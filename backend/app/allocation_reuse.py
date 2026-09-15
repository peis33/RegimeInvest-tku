"""Persistent verification of the current successful allocation, fail closed."""
import hashlib
import json
from pathlib import Path

INPUTS = ('run_all_models_app_FINAL_UPDATED_FIX.py',
          'model_2_candidate_selection_production_UPDATED.py',
          'model_2_v2_strong_production_app_profile_UPDATED.py',
          'model_2_zipf_ga_formal.py', '小戶10.csv', '中間戶10.csv', '大戶10.csv',
          'model_1_prediction_output.csv', 'model_1_production_metadata.csv')
OUTPUTS = ('portfolio_allocation_output.csv', 'model_2_candidate_stocks.csv',
           'model_2_v2_strong_final_portfolio_audit.csv')

def hashes(base, names):
    return {name:hashlib.sha256((base/name).read_bytes()).hexdigest() for name in names}

def signature(base, profile, model1_manifest, runtime):
    return {'profile':profile,'model1':model1_manifest,'inputs':hashes(base,INPUTS),'runtime':runtime}

def reusable(base, expected):
    try:
        saved=json.loads((base/'allocation_reuse.json').read_text())
        return saved['conditions']==expected and saved['outputs']==hashes(base,OUTPUTS)
    except (OSError,ValueError,KeyError):
        return False

def save(base, conditions):
    payload={'conditions':conditions,'outputs':hashes(base,OUTPUTS)}
    temporary=base/'allocation_reuse.json.tmp'
    temporary.write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    temporary.replace(base/'allocation_reuse.json')
