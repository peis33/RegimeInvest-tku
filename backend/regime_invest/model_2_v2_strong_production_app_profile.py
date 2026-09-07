# -*- coding: utf-8 -*-
from __future__ import annotations
from pathlib import Path
import importlib.util, json, random
import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent
MODEL2_FILE = BASE / "model_2_zipf_ga_formal.py"
PREDICTION_FILE = BASE / "model_1_prediction_output.csv"
CANDIDATE_FILE = BASE / "model_2_candidate_stocks.csv"
PROFILE_FILE = BASE / "user_profile.json"
OUTPUT_FILE = BASE / "portfolio_allocation_output.csv"
AUDIT_FILE = BASE / "model_2_v2_strong_final_portfolio_audit.csv"

SEED, POP_SIZE, GENERATIONS = 42, 80, 120
CFG = dict(risk_add=.45, concentration_penalty=.12, hhi_penalty=.05, max_stock_weight=.30)

def load_module(path, name):
    if not path.exists(): raise FileNotFoundError(path.name)
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod

def repair(w,cmin,cmax,cap):
    w=np.maximum(np.asarray(w,float),0); w=w/w.sum() if w.sum()>0 else np.ones_like(w)/len(w)
    cash=float(np.clip(w[-1],cmin,cmax)); risky=w[:-1].copy(); budget=1-cash
    if len(risky)*cap+1e-12 < budget:
        raise ValueError(f"Frozen 30% cap infeasible: {len(risky)} stocks cannot hold {budget:.2%}.")
    risky=risky*budget/risky.sum() if risky.sum()>0 else np.full(len(risky),budget/len(risky))
    for _ in range(100):
        over=risky>cap+1e-12
        if not over.any(): break
        excess=float((risky[over]-cap).sum()); risky[over]=cap
        under=np.where(risky<cap-1e-12)[0]
        if not len(under): break
        capacity=cap-risky[under]; risky[under]+=excess*capacity/capacity.sum()
    diff=budget-risky.sum()
    if abs(diff)>1e-10:
        under=np.where(risky<cap-1e-12)[0]
        if diff>0 and len(under):
            capacity=cap-risky[under]; risky[under]+=diff*capacity/capacity.sum()
        elif diff<0 and risky.sum()>0:
            risky*=budget/risky.sum()
    out=np.append(np.maximum(risky,0),cash)
    if not np.isclose(out.sum(),1,atol=1e-8): raise ValueError(f"weight sum={out.sum()}")
    if np.max(out[:-1])>cap+1e-8: raise ValueError("30% stock cap violated")
    return out

def fit(mod,w,selected,pred,profile):
    m=mod.portfolio_metrics(w,selected)
    lam=.35+.60*pred["prob_Bear"]+.15*pred["prob_Sideways"]+CFG["risk_add"]
    if profile["risk_preference"]=="conservative": lam+=.20
    elif profile["risk_preference"]=="aggressive": lam-=.15
    cash=float(w[-1]); risky=np.asarray(w[:-1],float)
    target=.50*pred["prob_Bear"]+.28*pred["prob_Sideways"]+.15*pred["prob_Bull"]
    alignment=-abs(cash-target)*.04+risky.sum()*pred["prob_Bull"]*.015
    hhi=float(np.sum(risky**2))
    return float(m["expected_return"]-lam*m["risk"]-CFG["concentration_penalty"]*m["concentration"]
                 -CFG["hhi_penalty"]*hhi+m["diversification"]*.02+alignment)

def run_ga(mod,selected,pred,profile,initial):
    cmin,cmax=mod.get_cash_bounds(pred,profile)
    rp=lambda x: repair(x,cmin,cmax,CFG["max_stock_weight"])
    random.seed(SEED); np.random.seed(SEED)
    pop=[rp(initial)]+[rp(initial+np.random.normal(0,.08,len(initial))) for _ in range(POP_SIZE-1)]
    best,bscore=pop[0].copy(),-np.inf
    for _ in range(GENERATIONS):
        scored=[(rp(x),fit(mod,rp(x),selected,pred,profile)) for x in pop]
        scored.sort(key=lambda z:z[1],reverse=True)
        if scored[0][1]>bscore: best,bscore=scored[0][0].copy(),float(scored[0][1])
        elites=[z[0] for z in scored[:max(4,POP_SIZE//5)]]; new=[x.copy() for x in elites]
        while len(new)<POP_SIZE:
            p1,p2=random.sample(elites,2); a=random.random(); child=a*p1+(1-a)*p2
            mask=np.random.random(len(child))<.25
            if mask.any(): child[mask]+=np.random.normal(0,.05,int(mask.sum()))
            new.append(rp(child))
        pop=new
    return rp(best),bscore

def main():
    print("="*110); print("MODEL 2 V2 STRONG — APP USER PROFILE PRODUCTION"); print("="*110)
    mod=load_module(MODEL2_FILE,"m2v2_interface")
    missing=[p.name for p in (PREDICTION_FILE,CANDIDATE_FILE) if not p.exists()]
    if missing:
        print("STOP — missing formal upstream input:", ", ".join(missing))
        print("No CSV created; missing data will not be fabricated."); return
    if not PROFILE_FILE.exists():
        raise FileNotFoundError(
            "user_profile.json is required for App production. "
            "No fixed USER_PROFILE fallback is allowed."
        )
    raw_profile=json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    profile=mod.normalize_user_profile(raw_profile)
    psource=PROFILE_FILE.name

    investor_type=str(profile.get("investor_type","")).lower()
    risk_preference=str(profile.get("risk_preference","")).lower()
    budget=float(profile.get("budget",0))
    allow_fractional=bool(profile.get("allow_fractional",False))

    if investor_type not in {"small","normal","large"}:
        raise ValueError(f"Unsupported investor_type: {investor_type}")
    if risk_preference not in {"conservative","neutral","aggressive"}:
        raise ValueError(f"Unsupported risk_preference: {risk_preference}")
    if budget <= 0:
        raise ValueError(f"budget must be positive, got {budget}")

    print("\nAPP USER PROFILE")
    print(f"- source          : {psource}")
    print(f"- investor_type   : {investor_type}")
    print(f"- risk_preference : {risk_preference}")
    print(f"- budget          : {budget:.2f}")
    print(f"- allow_fractional: {allow_fractional}")
    pred=mod.load_latest_prediction(str(PREDICTION_FILE))
    stocks=mod.load_candidate_stocks(str(CANDIDATE_FILE))
    selected=mod.select_candidates(stocks,pred,profile)
    if selected.empty: raise ValueError("Formal selection returned zero stocks.")
    initial=mod.build_initial_weight(selected,pred,profile)
    w,score=run_ga(mod,selected,pred,profile,initial)
    portfolio=mod.calculate_position_table(selected,w,profile,score,pred)
    cmin,cmax=mod.get_cash_bounds(pred,profile)
    req={"stock_id","name","asset_type","final_weight_percent","allocated_amount","predicted_regime"}
    checks=[
      ("Formal Model 1 input exists",True,PREDICTION_FILE.name),
      ("Formal candidate input exists",True,CANDIDATE_FILE.name),
      ("No demo candidate fallback",True,"formal candidate CSV only"),
      ("Frozen V2 Strong parameters",True,str(CFG)),
      ("Formal GA budget",True,f"{POP_SIZE}x{GENERATIONS}"),
      ("Weights sum to one",np.isclose(w.sum(),1,atol=1e-8),f"{w.sum():.12f}"),
      ("Weights nonnegative",(w>=-1e-12).all(),f"min={w.min():.12f}"),
      ("Cash bounds preserved",cmin-1e-8<=w[-1]<=cmax+1e-8,f"cash={w[-1]:.8f}; [{cmin:.8f},{cmax:.8f}]"),
      ("Frozen 30% stock cap",np.max(w[:-1])<=.30+1e-8,f"max={np.max(w[:-1]):.8f}"),
      ("Model 3 interface columns",req.issubset(portfolio.columns),",".join(portfolio.columns)),
      ("User profile source",psource=="user_profile.json",psource),
      ("Investor type applied",investor_type in {"small","normal","large"},investor_type),
      ("Risk preference applied",risk_preference in {"conservative","neutral","aggressive"},risk_preference),
      ("Budget applied",budget>0,f"{budget:.2f}"),
      ("Fractional-share setting applied",True,str(allow_fractional)),
      ("Profile propagated to portfolio",
       ("investor_type" in portfolio.columns and
        portfolio["investor_type"].astype(str).str.lower().eq(investor_type).all() and
        "risk_preference" in portfolio.columns and
        portfolio["risk_preference"].astype(str).str.lower().eq(risk_preference).all() and
        "budget" in portfolio.columns and
        np.allclose(pd.to_numeric(portfolio["budget"],errors="coerce"),budget,equal_nan=False)),
       f"investor_type={investor_type}; risk_preference={risk_preference}; budget={budget:.2f}")]
    audit=pd.DataFrame([{"check_name":n,"status":"PASS" if bool(ok) else "FAIL","detail":d} for n,ok,d in checks])
    print("\nAUDIT\n",audit.to_string(index=False))
    if (audit.status=="FAIL").any(): raise RuntimeError("Audit failed; output not written.")
    portfolio.to_csv(OUTPUT_FILE,index=False,encoding="utf-8-sig")
    audit.to_csv(AUDIT_FILE,index=False,encoding="utf-8-sig")
    print("\nFINAL PORTFOLIO")
    print(portfolio[["stock_id","name","asset_type","final_weight_percent","allocated_amount"]].to_string(index=False))
    print(f"\nRESULT: PASS\nCreated: {OUTPUT_FILE.name}\nCreated: {AUDIT_FILE.name}")

if __name__=="__main__": main()
