"""Content-addressed cache; only complete, audited artifacts may be reused."""
import csv
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

FILES = ('model_3_final_output.csv', 'model_3_final_discussion_output.json',
         'model_3_advisory_allocation.csv', 'model_3_final_production_report.txt',
         'model_3_final_production_audit.csv')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def cache_key(conditions):
    return digest(json.dumps(conditions, sort_keys=True, ensure_ascii=False,
                             separators=(',', ':'), allow_nan=False).encode())


def allocation_fingerprint(path):
    """Ignore only generation time; preserve exact numeric values and row order."""
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or 'stock_id' not in reader.fieldnames:
            raise ValueError('Invalid allocation CSV')
        fields = [field for field in reader.fieldnames if field != 'generated_at']
        rows = [{field: row[field] for field in fields} for row in reader]
    if not rows:
        raise ValueError('Empty allocation CSV')
    return {'columns': fields, 'rows': rows}


def cache_miss_reason(root, conditions):
    candidates=[]
    for path in Path(root).glob('*/manifest.json'):
        try:
            previous=json.loads(path.read_text(encoding='utf-8'))
            if previous.get('conditions',{}).get('profile') == conditions.get('profile'):
                candidates.append(previous)
        except (OSError,ValueError):
            continue
    if not candidates:return {'reason':'no_matching_profile'}
    previous=max(candidates,key=lambda item:item.get('created_at',''))
    changed=[key for key in set(previous['conditions']) | set(conditions)
             if previous['conditions'].get(key)!=conditions.get(key)]
    return {'reason':'conditions_changed' if changed else 'cached_output_unavailable',
            'changed_fields':sorted(changed),'previous_created_at':previous.get('created_at')}


def valid_outputs(base):
    try:
        if not all((base / name).is_file() and (base / name).stat().st_size for name in FILES):
            return False
        with (base / FILES[-1]).open(encoding='utf-8-sig', newline='') as stream:
            rows = list(csv.DictReader(stream))
        if not rows or any(row.get('status') != 'PASS' for row in rows):
            return False
        data = json.loads((base / FILES[1]).read_text(encoding='utf-8'))
        return bool(data.get('structured_decisions', {}).get('judge') and data.get('rounds'))
    except (OSError, ValueError, KeyError, TypeError):
        return False


def restore(root, key, destination):
    entry = root / key
    try:
        manifest = json.loads((entry / 'manifest.json').read_text(encoding='utf-8'))
        if manifest.get('key') != key or not valid_outputs(entry):
            return None
        if any(digest((entry / name).read_bytes()) != manifest['hashes'][name] for name in FILES):
            return None
        for name in FILES:
            shutil.copy2(entry / name, destination / name)
        return manifest
    except (OSError, ValueError, KeyError, TypeError):
        return None


def save(root, key, source, conditions):
    if not valid_outputs(source):
        return None
    root.mkdir(parents=True, exist_ok=True)
    # Immutable entries: a forced successful run creates outputs but need not overwrite history.
    if (root / key).exists():
        return None
    with tempfile.TemporaryDirectory(prefix='.writing-', dir=root) as temporary:
        staging = Path(temporary) / 'entry'
        staging.mkdir()
        for name in FILES:
            shutil.copy2(source / name, staging / name)
        data = json.loads((source / FILES[1]).read_text(encoding='utf-8'))
        manifest = {'key': key, 'created_at': data.get('created_at') or datetime.now().isoformat(),
                    'conditions': conditions,
                    'hashes': {name: digest((staging / name).read_bytes()) for name in FILES}}
        (staging / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
        try:
            os.rename(staging, root / key)
        except FileExistsError:
            return None
        return manifest
