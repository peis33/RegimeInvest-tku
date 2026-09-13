# RegimeInvest-tku

這是一套結合「市場狀態預測、使用者選股、股票篩選、資金配置與 Multi-Agent 決策討論」的投資決策研究系統。

本專案主要分成三個 Model：

1. **Model 1：HMM + MTA + LSTM 市場狀態預測**
2. **Model 2：使用者選股範圍限制 + 股票篩選 + Zipf + Genetic Algorithm (GA) 資金配置**
3. **Model 3：Multi-Agent 投資決策討論與風險審查**

最後由 `run_all_models_app_FINAL_UPDATED_FIX.py` 串接三個 Model，提供 App 使用。

---

# 一、系統架構

整體流程：

```text
前端使用者設定 / 選擇股票
        |
        v
user_profile.json
        |
        v
Model 1：市場狀態預測
        |
        v
Model 2-A：投資人類型股票池 + 前端選股限制 + 候選股票篩選
        |
        v
Model 2-B：Zipf + GA 資金配置
        |
        v
Model 3：Multi-Agent 投資討論 / Judge Advisory
        |
        v
End-to-End Audit
        |
        v
    App 顯示結果
```

App 正式執行入口：

```powershell
python run_all_models_app_FINAL_UPDATED_FIX.py
```

---

# 二、Model 1：市場狀態預測

正式程式：

```text
model_1_v5_production_app_duration.py
```

研究方法：

```text
HMM + MTA + LSTM
```

Model 1 的工作是判斷目前市場屬於：

* Bull（多頭）
* Bear（空頭）
* Sideways（盤整）

除了市場狀態之外，也會提供：

* Bear / Bull / Sideways 各狀態機率
* Expected Regime Duration（預期狀態持續時間）
* MTA to Bear（距離 Bear 狀態的平均吸收時間）

正式設定：

* Training Window：60 個月
* Validation Window：12 個月
* Sequence Length：3
* Class Weight：OFF
* HMM 使用 causal forward filtering，避免使用未來資訊

Model 1 的主要輸出：

```text
model_1_prediction_output.csv
```

此輸出會交給 Model 2 與 Model 3 使用。

---

# 三、Model 2：選股與資金配置

Model 2 分成兩個階段。

## Model 2-A：使用者範圍限制與候選股票篩選

正式程式：

```text
model_2_candidate_selection_production_UPDATED.py
```

Model 2-A 會先依照使用者的投資人類型決定可使用的股票池：

```text
small  → 小戶10.csv
normal → 中間戶10.csv
large  → 大戶10.csv
```

再與前端使用者選擇的股票取交集。

因此目前正式流程為：

```text
Investor-Type Eligibility Pool
        ↓
Frontend Selected Stocks
        ↓
Allowed Stock Universe
        ↓
Candidate Evaluation
        ↓
Model 2 Candidate Set
```

也就是：

**前端選擇股票 → 後端只從使用者選擇、且符合該投資人類型的股票中進行評估與資金配置。**

例如使用者選擇 `large`，後端只會考慮大戶股票池中符合前端選擇範圍的股票，不會自行加入前端沒有選擇的股票。

候選股票主要根據：

* 報酬表現
* 流動性
* 成交資訊
* 波動風險
* 市場狀態資訊

進行評估與篩選。

主要輸出：

```text
model_2_candidate_stocks.csv
```

同時產生候選股票選擇 Audit：

```text
experiment_model_2_candidate_selection_audit.csv
experiment_model_2_candidate_selection_summary.csv
```

Audit 會檢查候選股票是否超出：

* Investor-Type 股票池
* Frontend Selected Stock Scope

以避免後端使用使用者未選擇或不符合投資人類型的股票。

---

## Model 2-B：Zipf + GA 資金配置

正式程式：

```text
model_2_v2_strong_production_app_profile_UPDATED.py
```

核心最佳化程式：

```text
model_2_zipf_ga_formal.py
```

流程：

```text
Model 2 Candidate Set
        ↓
Zipf 初始配置
        ↓
Genetic Algorithm (GA)
        ↓
Constraint Validation
        ↓
個人化投資組合
```

Model 2 會讀取：

```text
user_profile.json
```

因此 App 可以依照使用者的：

* 投資人類型
* 風險偏好
* 投資預算
* 是否允許零股
* 前端選擇的股票範圍

產生個人化配置。

Frozen 正式參數：

* risk_add = 0.45
* concentration_penalty = 0.12
* HHI penalty = 0.05
* 單一股票最大權重 = 30%
* GA Population = 80
* GA Generations = 120

主要輸出：

```text
portfolio_allocation_output.csv
```

正式 Audit：

```text
model_2_v2_strong_final_portfolio_audit.csv
```

Model 2 的數值配置為正式 Quantitative Portfolio Allocation。

---

# 四、Model 3：Multi-Agent 投資決策

正式程式：

```text
model_3_final_polished.py
```

Model 3 使用三個不同角色的 Local LLM Agent。

## Risk-Seeking Agent

模型：

```text
Qwen3 8B
```

角色：

* 偏向報酬機會
* 尋找具有成長或報酬優勢的資產
* 提出較積極的投資觀點
* 根據 Evidence 提出各資產的調整方向

## Risk-Averse Agent

模型：

```text
Mistral
```

角色：

* 偏向風險控制
* 關注波動、集中度與現金部位
* 對 Risk-Seeking Agent 的建議提出風險質疑
* 可接受或反駁對方提出的 Claim

## Judge Agent

模型：

```text
Llama 3.2 3B
```

角色：

* 閱讀 Risk-Seeking 與 Risk-Averse 的完整討論
* 比較雙方使用的 Evidence
* 整合最後的投資方向與理由
* 產生 Advisory Allocation

---

# 五、Model 2 與 Model 3 的責任分離

這是本專案很重要的設計。

Model 2 的 Zipf + GA 負責：

```text
數值最佳化
正式資產權重
投資限制
資金配置
```

Model 3 的 Multi-Agent 負責：

```text
投資立場
風險審查
Evidence-based Debate
投資方向
Judge Advisory
最終解釋
```

因此：

```text
Model 2 = Quantitative Optimization Layer
Model 3 = Decision Support / Risk Review / Explainability Layer
```

**Model 2 原始數值配置在 Model 3 中保持不變。**

Model 3 可以提出 Advisory Allocation，但不會覆寫：

```text
portfolio_allocation_output.csv
```

也就是說：

* Model 2 Allocation = 正式數值最佳化結果
* Model 3 Advisory Allocation = Multi-Agent 討論後的決策支援結果

所有市場狀態、股票數值、報酬、風險、權重等事實統一由 Python Evidence Engine 提供。

LLM Agent 主要負責根據 Evidence 進行立場分析、討論與決策支援，降低 LLM 自行產生金融事實的風險。

此外，Judge 提出的數值建議最後仍會經過 Python Constraint Layer 檢查，以確保最終 Advisory Allocation 合法。

---

# 六、Multi-Agent 討論流程

Model 3 採用 **2–5 輪動態討論機制**。

基本流程：

```text
Risk-Seeking Round 1
        ↓
Risk-Averse Round 1
        ↓
Risk-Seeking Round 2
        ↓
Risk-Averse Round 2
        ↓
檢查數值提案是否收斂
        ↓
若尚未收斂 → 繼續下一輪
        ↓
最多 Round 5
        ↓
Judge
        ↓
Python Numeric Constraint Check
        ↓
Final Advisory Decision
```

Agent 每輪可以：

* 提出投資立場
* 引用 Evidence
* 建立 Claim
* 接受對方 Claim
* 反駁對方 Claim
* 調整股票建議
* 調整現金配置方向

討論至少進行 2 輪，最多進行 5 輪。

如果雙方的數值提案已經穩定並達到收斂條件，可以提前停止討論。

因此 Agent **不需要被強迫產生不同答案**；如果雙方根據 Evidence 最後得到相同或接近的配置建議，系統可以視為數值共識。

Judge 最後再整合雙方提案。

App 可以顯示完整討論內容，而不只是最後一句建議。

---

# 七、使用者設定 user_profile.json

`user_profile.json` 是 App 與模型 Pipeline 之間的使用者設定介面。

例如：

```json
{
    "investor_type": "large",
    "risk_preference": "neutral",
    "budget": 50000,
    "allow_fractional": true,
    "selection_mode": "custom",
    "selected_stocks": ["2330", "2454", "3008", "3034", "2379"]
}
```

其中：

* `investor_type`：投資人類型
* `risk_preference`：風險偏好
* `budget`：投資預算
* `allow_fractional`：是否允許零股
* `selection_mode`：股票選擇模式
* `selected_stocks`：前端使用者選擇的股票

App 修改使用者設定後，再執行：

```powershell
python run_all_models_app_FINAL_UPDATED_FIX.py
```

即可重新產生符合使用者股票範圍與投資屬性的個人化結果。

---

# 八、安裝 Python 套件

建議使用：

```text
Python 3.10+
```

安裝：

```powershell
pip install -r requirements.txt
```

主要套件包含：

* NumPy
* pandas
* SciPy
* scikit-learn
* hmmlearn
* TensorFlow
* TEJ API
* requests

---

# 九、TEJ API 設定

⚠️ **禁止把真正的 TEJ API Key 寫進 GitHub。**

正式程式透過環境變數：

```text
TEJ_API_KEY
```

取得 API Key。

Windows PowerShell：

```powershell
$env:TEJ_API_KEY="你的_TEJ_API_KEY"
```

Repository 中只提供：

```text
.env.example
```

真正的：

```text
.env
```

應由 `.gitignore` 排除。

---

# 十、Ollama / Local LLM 設定

Model 3 需要先安裝 Ollama。

需要的模型：

```powershell
ollama pull qwen3:8b
ollama pull mistral
ollama pull llama3.2:3b
```

確認 Ollama 正常執行後，才能執行完整 Model 3。

注意：

**Ollama 模型本身不會上傳到 GitHub。**

每台電腦需要自行下載模型。

---

# 十一、正式執行方式

如果要跑完整 App Pipeline：

```powershell
python run_all_models_app_FINAL_UPDATED_FIX.py
```

執行順序：

```text
Model 1
    ↓
Model 2 Candidate Selection UPDATED
    ↓
Model 2 V2 Strong Allocation UPDATED
    ↓
Model 3 Final-Polished Multi-Agent
    ↓
End-to-End Audit
```

正常完成時，最後應看到：

```text
FINAL RESULT: END-TO-END APP PIPELINE PASS
```

End-to-End 主要輸出：

```text
end_to_end_app_pipeline_audit.csv
end_to_end_app_pipeline_report.txt
```

---

# 十二、哪些程式是目前正式版本？

目前正式 Pipeline 使用以下檔案。

### Model 1

```text
model_1_v5_production_app_duration.py
```

### Model 2

```text
model_2_candidate_selection_production_UPDATED.py
model_2_v2_strong_production_app_profile_UPDATED.py
model_2_zipf_ga_formal.py
```

### Model 3

```text
model_3_final_polished.py
```

### End-to-End

```text
run_all_models_app_FINAL_UPDATED_FIX.py
```

其他 V1、V2、V3、V4、V5、ablation、diagnostic、audit 等檔案主要為研究與實驗過程使用。

**正式 App 串接應以上述目前版本為準，不要使用舊版程式取代。**

---

# 十三、研究實驗程式

Repository 中保留多個研究驗證程式，包括：

* Sliding Window
* Strict Rolling
* Ablation Study
* Robustness Test
* Repeated Stability Test
* Regime Sensitivity
* Model 2 Constraint / Benchmark Audit
* Model 3 Multi-Agent / Grounding / Stability Audit

這些程式主要用於研究驗證，不是 App 正式執行入口。

---

# 十四、GitHub 安全注意事項

禁止上傳：

* Password / Credential
* 真實 API Key
* `.env`
* `__pycache__`
* `.pyc`
* 個人 Token

正式 API Key 應透過環境變數管理。

---

# 十五、快速了解版本

如果只是要執行專案，不需要研究所有舊程式。

### 第一次使用

1. 安裝 Python 套件：

   ```powershell
   pip install -r requirements.txt
   ```

2. 設定 TEJ API Key。

3. 安裝 Ollama。

4. 下載：

   ```powershell
   ollama pull qwen3:8b
   ollama pull mistral
   ollama pull llama3.2:3b
   ```

5. 設定 `user_profile.json`。

6. 執行：

   ```powershell
   python run_all_models_app_FINAL_UPDATED_FIX.py
   ```

### 如果只是做 App 串接

主要看：

```text
user_profile.json
run_all_models_app_FINAL_UPDATED_FIX.py
```

以及各 Model 產生的 Output CSV / JSON。

---

# App 串接說明

## 1. 執行完整模型

App 後端執行：

```powershell
python run_all_models_app_FINAL_UPDATED_FIX.py
```

完整流程：

```text
Frontend Selected Stocks
→ user_profile.json
→ Model 1
→ Investor-Type Eligibility Filter
→ Model 2 Candidate Selection
→ Model 2 Portfolio Allocation
→ Model 3 Multi-Agent Advisory
→ End-to-End Audit
```

請勿修改 Model 1、Model 2、Model 3 已確認的正式演算法內容。

---

## 2. App 輸入

使用者設定檔：

```text
user_profile.json
```

主要欄位：

* `investor_type`
* `risk_preference`
* `budget`
* `allow_fractional`
* `selection_mode`
* `selected_stocks`

目前股票選擇流程：

```text
前端選股
    ↓
寫入 selected_stocks
    ↓
依 investor_type 取得 Eligible Pool
    ↓
兩者取交集
    ↓
Model 2 只使用合法股票範圍
```

因此後端不會自行使用前端未選擇的股票。

---

## 3. App 需要讀取的輸出

### Model 1：市場狀態

檔案：

```text
model_1_prediction_output.csv
```

App 主要使用：

* `predicted_regime`
* `prob_Bear`
* `prob_Bull`
* `prob_Sideways`
* `expected_regime_duration_steps`
* `mta_to_bear_steps`

用途：

顯示目前預測市場狀態、各狀態機率、預估狀態持續時間，以及 MTA to Bear。

---

### Model 2：投資組合

檔案：

```text
portfolio_allocation_output.csv
```

App 主要使用：

* `stock_id`
* `name`
* `asset_type`
* `price`
* `final_weight`
* `final_weight_percent`
* `allocated_amount`
* `shares`
* `expected_return`
* `risk`

用途：

顯示正式股票配置、現金配置、投資金額與權重。

Model 2 / Zipf + GA 的數值配置為正式 Quantitative Portfolio Allocation。

---

### Model 3：Multi-Agent 討論

主要檔案：

```text
model_3_final_discussion_output.json
```

其他輸出：

```text
model_3_final_output.csv
model_3_advisory_allocation.csv
model_3_final_production_report.txt
model_3_final_production_audit.csv
```

App 可呈現：

* Risk-Seeking / Risk-Averse 各輪討論
* Agent 立場
* 各資產提高 / 降低 / 維持
* Evidence
* Claim
* 接受 / 反駁對方 Claim
* Debate Round Count
* Consensus Status
* Stop Reason
* Judge 最終判斷
* Judge Advisory Allocation

Model 3 是：

```text
Decision Support / Risk Review / Explainability Layer
```

Model 3 不覆寫 Model 2 的：

```text
portfolio_allocation_output.csv
```

正式 Quantitative Allocation 與 Multi-Agent Advisory 可以在 App 中分開呈現。

---

## 4. App 串接流程

```text
使用者輸入
    ↓
user_profile.json
    ↓
python run_all_models_app_FINAL_UPDATED_FIX.py
    ↓
Model 1
    ↓
Model 2 Candidate Selection
    ↓
Model 2 Portfolio Allocation
    ↓
Model 3 Multi-Agent Advisory
    ↓
End-to-End Audit
    ↓
App 讀取結果
```

主要結果：

```text
1. model_1_prediction_output.csv
2. portfolio_allocation_output.csv
3. model_3_final_discussion_output.json
4. model_3_advisory_allocation.csv
5. end_to_end_app_pipeline_audit.csv
```

---

## 5. 模型端目前狀態

目前完整 Pipeline 已成功執行：

```text
Model 1                                  PASS
Model 2 Candidate Selection UPDATED     PASS
Model 2 V2 Strong Allocation UPDATED    PASS
Model 3 Final-Polished Multi-Agent      PASS
End-to-End Pipeline                     PASS
```

目前流程已支援：

```text
Frontend Selected Universe
        ↓
Investor-Type Eligibility Filter
        ↓
Candidate Selection
        ↓
Model 2 Quantitative Allocation
        ↓
Model 3 Multi-Agent Advisory
```

因此使用者從前端選擇股票後，後端只會在符合該使用者投資人類型與選股範圍的股票中進行後續評估與資金配置。

---

# 注意

本專案為學術研究與系統 Prototype。

所有模型輸出僅供研究與系統展示使用，不構成任何實際投資建議。
