"""Web Push subscriptions, VAPID config and restricted push destinations."""
import base64
import os
from urllib.parse import urlsplit
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from cryptography.hazmat.primitives.serialization import load_pem_private_key, Encoding, PublicFormat
from pywebpush import webpush

class SubscriptionKeys(BaseModel):
    p256dh: str = Field(pattern=r'^[A-Za-z0-9_-]{87}={0,2}$')
    auth: str = Field(pattern=r'^[A-Za-z0-9_-]{22}={0,2}$')

class WebSubscription(BaseModel):
    endpoint: str = Field(max_length=2048)
    keys: SubscriptionKeys
    @field_validator('endpoint')
    @classmethod
    def validate_endpoint(cls, value):
        url = urlsplit(value)
        # Never allow arbitrary URLs supplied by a client to become server requests.
        allowed = {'web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'}
        if url.scheme != 'https' or url.hostname not in allowed or url.port not in (None,443) or url.username or url.password or url.fragment:
            raise ValueError('不支援的推播服務網址')
        return value

def vapid_config():
    key = os.environ.get('WEB_PUSH_PRIVATE_KEY', '')
    subject = os.environ.get('WEB_PUSH_SUBJECT', '')
    if not key or not Path(key).is_file() or not (subject.startswith('mailto:') or subject.startswith('https://')):
        return None
    return key, subject

def public_key():
    config = vapid_config()
    if not config: return None
    private = load_pem_private_key(Path(config[0]).read_bytes(), password=None)
    raw = private.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()

def send_web(subscription, payload):
    config = vapid_config()
    if not config: raise RuntimeError('Web Push 尚未設定')
    return webpush(subscription_info=subscription, data=payload,
        vapid_private_key=config[0], vapid_claims={'sub':config[1]}, ttl=3600, timeout=5)
