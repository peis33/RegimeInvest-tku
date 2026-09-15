"""CSV close-price alerts, device-owned rules and durable Expo delivery state."""
import hashlib
import json
import logging
import os
import sqlite3
import threading
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from pywebpush import WebPushException
from .web_push import WebSubscription, public_key, send_web, vapid_config

log = logging.getLogger(__name__)

class AlertRule(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    symbol: str = Field(pattern=r'^\d{4}$')
    enabled: bool = True
    high: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    low: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    expires: date | None = None

class AlertSync(BaseModel):
    token: str | None = Field(default=None, pattern=r'^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$')
    subscription: WebSubscription | None = None
    rules: list[AlertRule] = Field(max_length=100)

class AlertStore:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = str(path)
        self.lock = threading.RLock()
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, secret TEXT, token TEXT);
            CREATE TABLE IF NOT EXISTS rules (device TEXT, id TEXT, config TEXT, high_active INTEGER DEFAULT 0, low_active INTEGER DEFAULT 0, stamp TEXT DEFAULT '', PRIMARY KEY(device,id));
            CREATE TABLE IF NOT EXISTS deliveries (id INTEGER PRIMARY KEY, device TEXT, rule_id TEXT, payload TEXT, status TEXT, ticket TEXT, attempts INTEGER DEFAULT 0, error TEXT);
            ''')
            if 'subscription' not in {row[1] for row in db.execute('PRAGMA table_info(devices)')}:
                db.execute('ALTER TABLE devices ADD COLUMN subscription TEXT')
    def db(self):
        return sqlite3.connect(self.path, timeout=10)
    def sync(self, owner, body):
        device = hashlib.sha256(owner.encode()).hexdigest()
        with self.lock, self.db() as db:
            db.execute('INSERT INTO devices(id,secret,token,subscription) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,subscription=excluded.subscription', (device, device, body.token, body.subscription.model_dump_json() if body.subscription else None))
            ids = {r.id for r in body.rules}
            if len(ids) != len(body.rules):
                raise ValueError('警示 ID 重複')
            old = dict(db.execute('SELECT id,config FROM rules WHERE device=?', (device,)))
            for rule in body.rules:
                config = json.dumps(rule.model_dump(mode='json'), sort_keys=True)
                if old.get(rule.id) != config:
                    db.execute('DELETE FROM rules WHERE device=? AND id=?', (device, rule.id))
                    db.execute('UPDATE deliveries SET status="cancelled" WHERE device=? AND rule_id=? AND status="pending"', (device, rule.id))
                    db.execute('INSERT INTO rules(device,id,config) VALUES(?,?,?)', (device, rule.id, config))
            for removed in old.keys() - ids:
                db.execute('DELETE FROM rules WHERE device=? AND id=?', (device, removed))
                db.execute('UPDATE deliveries SET status="cancelled" WHERE device=? AND rule_id=? AND status="pending"', (device, removed))
        return device
    def evaluate(self, quotes, today=None):
        today = today or datetime.now(ZoneInfo('Asia/Taipei')).date()
        created = 0
        with self.lock, self.db() as db:
            for device, rid, config, high_active, low_active, stamp in db.execute('SELECT * FROM rules').fetchall():
                rule = json.loads(config)
                if not rule['enabled'] or (rule['expires'] and rule['expires'] < today.isoformat()):
                    db.execute('UPDATE deliveries SET status="cancelled" WHERE device=? AND rule_id=? AND status="pending"', (device, rid))
                    continue
                quote = quotes.get(rule['symbol'])
                if not quote or quote['date'] > today.isoformat() or (stamp and quote['date'] < stamp):
                    continue
                high = rule['high'] is not None and quote['price'] >= rule['high']
                low = rule['low'] is not None and quote['price'] < rule['low']
                hits = []
                if high and not high_active: hits.append(f"已達 {rule['high']:g} 元以上")
                if low and not low_active: hits.append(f"已低於 {rule['low']:g} 元")
                if hits:
                    payload = {'title': f"{quote['name']}觸價警示", 'body': f"{rule['symbol']} {quote['name']}，{quote['date']} 收盤價 {quote['price']:g} 元，" + '、'.join(hits), 'data': {'symbol': rule['symbol'], 'date': quote['date']}, 'sound': 'default', 'channelId': 'price-alerts'}
                    db.execute('INSERT INTO deliveries(device,rule_id,payload,status) VALUES(?,?,?,"pending")', (device, rid, json.dumps(payload, ensure_ascii=False)))
                    created += 1
                db.execute('UPDATE rules SET high_active=?,low_active=?,stamp=? WHERE device=? AND id=?', (high, low, quote['date'], device, rid))
        return created
    def deliver(self, post=requests.post, web_sender=send_web):
        # A ticket is acceptance, not confirmed delivery; receipts are checked below.
        with self.lock, self.db() as db:
            if vapid_config() or web_sender is not send_web:
                web_rows = db.execute('SELECT n.id,n.payload,d.subscription,n.attempts,n.device FROM deliveries n JOIN devices d ON n.device=d.id WHERE n.status="pending" AND d.subscription IS NOT NULL AND n.attempts<5 LIMIT 5').fetchall()
                for nid, payload, subscription, attempts, device in web_rows:
                    db.execute('UPDATE deliveries SET attempts=attempts+1 WHERE id=?', (nid,))
                    try:
                        web_sender(json.loads(subscription), payload)
                        db.execute('UPDATE deliveries SET status="accepted_web" WHERE id=?', (nid,))
                    except (WebPushException, requests.RequestException, RuntimeError, ValueError) as exc:
                        code = getattr(getattr(exc, 'response', None), 'status_code', None)
                        permanent = code in (400,401,403,404,410,413) or attempts >= 4
                        db.execute('UPDATE deliveries SET status=?,error=? WHERE id=?', ('failed' if permanent else 'pending', 'Web Push 發送失敗' + (f' ({code})' if code else ''), nid))
                        if code in (404,410):
                            db.execute('UPDATE devices SET subscription=NULL WHERE id=?', (device,))
            rows = db.execute('SELECT n.id,n.payload,d.token,n.attempts FROM deliveries n JOIN devices d ON n.device=d.id WHERE n.status="pending" AND d.token IS NOT NULL AND n.attempts<5 LIMIT 5').fetchall()
            for nid, payload, token, attempts in rows:
                db.execute('UPDATE deliveries SET attempts=attempts+1 WHERE id=?', (nid,))
                try:
                    response = post('https://exp.host/--/api/v2/push/send', json={**json.loads(payload), 'to': token}, timeout=5)
                    response.raise_for_status()
                    ticket = response.json()['data']
                    if ticket['status'] == 'ok':
                        db.execute('UPDATE deliveries SET status="accepted",ticket=? WHERE id=?', (ticket['id'], nid))
                    else:
                        db.execute('UPDATE deliveries SET status="failed",error=? WHERE id=?', (ticket.get('message', 'Expo rejected notification'), nid))
                        if ticket.get('details', {}).get('error') == 'DeviceNotRegistered':
                            db.execute('UPDATE devices SET token=NULL WHERE token=?', (token,))
                except (requests.RequestException, ValueError, KeyError):
                    db.execute('UPDATE deliveries SET status=?,error="推播服務暫時無法連線" WHERE id=?', ('failed' if attempts >= 4 else 'pending', nid))
            accepted = db.execute('SELECT id,ticket,device FROM deliveries WHERE status="accepted" LIMIT 100').fetchall()
            if accepted:
                try:
                    response = post('https://exp.host/--/api/v2/push/getReceipts', json={'ids': [r[1] for r in accepted]}, timeout=5)
                    response.raise_for_status()
                    receipts = response.json()['data']
                    for nid, ticket, device in accepted:
                        receipt = receipts.get(ticket)
                        if receipt:
                            db.execute('UPDATE deliveries SET status=?,error=? WHERE id=?', ('delivered' if receipt['status'] == 'ok' else 'failed', receipt.get('message'), nid))
                            if receipt.get('details', {}).get('error') == 'DeviceNotRegistered':
                                db.execute('UPDATE devices SET token=NULL WHERE id=?', (device,))
                except (requests.RequestException, ValueError, KeyError):
                    log.warning('Push receipts unavailable')


def read_quotes(path):
    before = Path(path).stat()
    frame = pd.read_csv(path, encoding='big5', dtype=str)
    frame['date'] = pd.to_datetime(frame['年月日'], errors='raise').dt.strftime('%Y-%m-%d')
    frame['price'] = pd.to_numeric(frame['收盤價(元)'].str.replace(',', '', regex=False), errors='raise')
    if frame.empty or frame['price'].isna().any() or (frame['price'] <= 0).any():
        raise ValueError('CSV 缺少有效收盤價')
    after = Path(path).stat()
    if (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
        raise ValueError('CSV 更新中，稍後重試')
    quotes = {}
    for _, row in frame.sort_values('date').iterrows():
        symbol, name = row['證券代碼'].strip().split(maxsplit=1)
        quotes[symbol] = {'name': name, 'price': float(row['price']), 'date': row['date']}
    return quotes


def install_alerts(app, csv_path, db_path):
    store = AlertStore(db_path)
    router = APIRouter(prefix='/alerts')
    stop = threading.Event()
    def owner_key(authorization):
        key = (authorization or '').removeprefix('Bearer ')
        if len(key) < 32 or len(key) > 200:
            raise HTTPException(401, '缺少裝置識別')
        return key
    @router.get('/web-push-key')
    def web_key():
        key = public_key()
        if not key: raise HTTPException(503, '後端尚未設定 Web Push 金鑰')
        return {'publicKey': key}
    @router.put('/rules')
    def sync(body: AlertSync, authorization: str = Header(default='')):
        owner = owner_key(authorization)
        if body.subscription and body.token:
            raise HTTPException(422, '每個裝置只能選擇一種推播方式')
        if body.subscription and not vapid_config():
            raise HTTPException(503, '後端尚未設定 Web Push 金鑰')
        try:
            store.sync(owner, body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return {'saved': len(body.rules), 'push_ready': bool(body.token or body.subscription)}
    @router.get('/status')
    def status(authorization: str = Header(default='')):
        device = hashlib.sha256(owner_key(authorization).encode()).hexdigest()
        with store.db() as db:
            rows = db.execute('SELECT status,count(*) FROM deliveries WHERE device=? GROUP BY status', (device,)).fetchall()
        return {'notifications': dict(rows), 'source': 'CSV 收盤價'}
    def worker():
        while not stop.is_set():
            try:
                store.evaluate(read_quotes(csv_path))
                store.deliver()
            except Exception:
                log.exception('CSV alert check failed; retry on next interval')
            stop.wait(60)
    @app.on_event('startup')
    def start():
        if os.environ.get('PRICE_ALERT_WORKER', '1') == '1':
            threading.Thread(target=worker, daemon=True, name='price-alerts').start()
    @app.on_event('shutdown')
    def shutdown():
        stop.set()
    app.include_router(router)
    return store
