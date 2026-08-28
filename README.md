# RegimeInvest-tku

這是一套結合「市場狀態預測、股票篩選、資金配置與 Multi-Agent 決策討論」的投資決策研究系統。

本專案主要分成三個 Model：

1. **Model 1：HMM + MTA + LSTM 市場狀態預測**
2. **Model 2：股票篩選 + Zipf + Genetic Algorithm (GA) 資金配置**
3. **Model 3：Multi-Agent 投資決策討論**

最後由 un_all_models_app_v2_2.py 串接三個 Model，提供 App 使用。

---

# 一、系統架構

整體流程：

    user_profile.json
            |
            v
    Model 1：市場狀態預測
            |
            v
    Model 2-A：候選股票篩選
            |
            v
    Model 2-B：Zipf + GA 資金配置
            |
            v
    Model 3：Multi-Agent 投資討論
            |
            v
        App 顯示結果

App 正式執行入口：

    python run_all_models_app_v2_2.py

---

# 二、Model 1：市場狀態預測

正式程式：

    model_1_v5_production_app_duration.py

研究方法：

    HMM + MTA + LSTM

Model 1 的工作是判斷目前市場屬於：

- Bull（多頭）
- Bear（空頭）
- Sideways（盤整）

除了市場狀態之外，也會提供：

- Bear / Bull / Sideways 各狀態機率
- Expected Regime Duration（預期狀態持續時間）
- MTA to Bear（距離 Bear 狀態的平均吸收時間）

正式設定：

- Training Window：60 個月
- Validation Window：12 個月
- Sequence Length：3
- Class Weight：OFF
- HMM 使用 causal forward filtering，避免使用未來資訊

Model 1 的主要輸出：

    model_1_prediction_output.csv

此輸出會交給 Model 2 使用。

---

# 三、Model 2：選股與資金配置

Model 2 分成兩個階段。

## Model 2-A：候選股票篩選

正式程式：

    model_2_candidate_selection_production.py

主要根據股票的：

- 報酬表現
- 流動性
- 成交資訊
- 波動風險

進行候選股票篩選。

主要輸出：

    model_2_candidate_stocks.csv

---

## Model 2-B：Zipf + GA 資金配置

正式程式：

    model_2_v2_strong_production_app_profile.py

核心最佳化程式：

    model_2_zipf_ga_formal.py

流程：

    候選股票
        ↓
    Zipf 初始配置
        ↓
    Genetic Algorithm (GA)
        ↓
    個人化投資組合

Model 2 會讀取：

    user_profile.json

因此 App 可以依照使用者的：

- 投資人類型
- 風險偏好
- 投資預算
- 是否允許零股

產生個人化配置。

Frozen 正式參數：

- risk_add = 0.45
- concentration_penalty = 0.12
- HHI penalty = 0.05
- 單一股票最大權重 = 30%
- GA Population = 80
- GA Generations = 120

主要輸出：

    portfolio_allocation_output.csv

---

# 四、Model 3：Multi-Agent 投資決策

正式程式：

    model_3_v5_1_final_freeze_candidate.py

Model 3 使用三個不同角色的 Local LLM Agent。

## Risk-Seeking Agent

模型：

    Qwen3 8B

角色：

- 偏向報酬機會
- 尋找具有成長或報酬優勢的資產
- 提出較積極的投資觀點

## Risk-Averse Agent

模型：

    Mistral

角色：

- 偏向風險控制
- 關注波動、集中度與現金部位
- 對 Risk-Seeking Agent 的建議提出風險質疑

## Judge Agent

模型：

    Llama 3.2 3B

角色：

- 閱讀 Risk-Seeking 與 Risk-Averse 的討論
- 比較雙方使用的 Evidence
- 整合最後的投資方向與理由

---

# 五、Model 3 為什麼不直接修改股票權重？

這是本專案很重要的設計。

Model 2 的 Zipf + GA 負責：

    數值最佳化與正式資產權重

Model 3 的 Multi-Agent 負責：

    投資立場
    風險審查
    投資方向
    Agent Debate
    最終解釋

因此 Model 3 **不會重新最佳化 Model 2 的數值權重**。

也就是：

    Model 2 = Quantitative Optimization
    Model 3 = Decision / Risk / Explainability Layer

這樣可以避免 LLM 自行產生或修改金融數值造成 hallucination。

數值事實統一由 Python Evidence Engine 提供與驗證。

---

# 六、Multi-Agent 討論流程

Model 3 的正式討論流程：

    Risk-Seeking Round 1
            ↓
    Risk-Averse Round 1
            ↓
    Risk-Seeking Round 2
            ↓
    Risk-Averse Round 2
            ↓
          Judge
            ↓
       Final Decision

App 可以顯示完整討論內容，而不只是最後一句建議。

---

# 七、使用者設定 user_profile.json

user_profile.json 是 App 與 Model 2 之間的使用者設定介面。

例如：

    {
        "investor_type": "large",
        "risk_preference": "neutral",
        "budget": 50000,
        "allow_fractional": true
    }

App 修改使用者設定後，再執行：

    python run_all_models_app_v2_2.py

即可重新產生個人化投資結果。

---

# 八、安裝 Python 套件

建議使用：

    Python 3.10+

安裝：

    pip install -r requirements.txt

主要套件包含：

- NumPy
- pandas
- SciPy
- scikit-learn
- hmmlearn
- TensorFlow
- TEJ API
- requests

---

# 九、TEJ API 設定

⚠️ **禁止把真正的 TEJ API Key 寫進 GitHub。**

正式程式透過環境變數：

    TEJ_API_KEY

取得 API Key。

Windows PowerShell：

    $env:TEJ_API_KEY="你的_TEJ_API_KEY"

Repository 中只提供：

    .env.example

真正的：

    .env

已經被 .gitignore 排除。

---

# 十、Ollama / Local LLM 設定

Model 3 需要先安裝 Ollama。

需要的模型：

    ollama pull qwen3:8b
    ollama pull mistral
    ollama pull llama3.2:3b

確認 Ollama 正常執行後，才能執行完整 Model 3。

注意：

**Ollama 模型本身不會上傳到 GitHub。**

每台電腦需要自行下載模型。

---

# 十一、正式執行方式

如果要跑完整 App Pipeline：

    python run_all_models_app_v2_2.py

執行順序：

    Model 1
        ↓
    Model 2 Candidate Selection
        ↓
    Model 2 Zipf + GA
        ↓
    Model 3 Multi-Agent
        ↓
    End-to-End Audit

正常完成時，最後應確認 End-to-End Pipeline Audit 為 PASS。

---

# 十二、哪些程式是正式版本？

目前正式版本只認以下檔案：

### Model 1

    model_1_v5_production_app_duration.py

### Model 2

    model_2_candidate_selection_production.py
    model_2_v2_strong_production_app_profile.py
    model_2_zipf_ga_formal.py

### Model 3

    model_3_v5_1_final_freeze_candidate.py

### End-to-End

    run_all_models_app_v2_2.py

其他 V1、V2、V3、V4、ablation、diagnostic、audit 等檔案主要為研究與實驗過程使用。

**不要拿舊版本取代以上 Frozen Production Model。**

---

# 十三、研究實驗程式

Model 1 的 Sliding Window / Strict Rolling 實驗：

    hmm_mta_lstm_sliding_window_experiment.py
    hmm_mta_lstm_sliding_window_experiment_v4_strict_rolling.py

這些程式主要用於研究驗證，不是 App 正式執行入口。

---

# 十四、GitHub 安全注意事項

禁止上傳：

- .env
- 真實 TEJ API Key
- Password / Credential
- __pycache__
- .pyc
- 個人 Token

如果發現 API Key 曾經被公開，應立即重新產生新的 Key。

---

# 十五、快速了解版本

如果只是要執行專案，不需要研究所有舊程式。

### 第一次使用

1. 安裝 Python 套件：

       pip install -r requirements.txt

2. 設定 TEJ API Key。

3. 安裝 Ollama。

4. 下載：

       qwen3:8b
       mistral
       llama3.2:3b

5. 設定 user_profile.json。

6. 執行：

       python run_all_models_app_v2_2.py

### 如果只是做 App 串接

主要看：

    user_profile.json
    run_all_models_app_v2_2.py

以及各 Model 產生的 Output CSV / JSON。

---

# 注意

本專案為學術研究與系統 Prototype。

所有模型輸出僅供研究與系統展示使用，不構成任何實際投資建議。
