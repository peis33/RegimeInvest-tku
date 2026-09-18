# RegimeInvest｜市場狀態感知的投資配置 App

RegimeInvest 是一款以台股為對象的投資決策研究 App，結合**市場狀態預測、個人化資金配置與多 Agent 討論**，讓使用者不只看到配置比例，也能查看報酬與風險兩種觀點，以及 Judge 的最終建議。

本專案採用 React Native／Expo 建立手機介面，透過 FastAPI 串接 Python 模型，並以 Ollama 在電腦端執行語言模型。手機是操作與展示介面，不負責執行大型模型。

## App 可以做什麼？

### 個人化設定與股票群組

- 輸入投資預算、投資人身分、風險偏好及配置偏好。
- 支援是否允許零股的配置設定。
- 首次進入投資組合分析頁時，依登入身分顯示預設群組。
- 透過左上角 More 按鈕切換小股民、中間戶、大戶或自訂群組。

### Analyze｜投資組合分析

呈現模型計算的股票／現金配置、個股配置資訊與候選排名。群組或投資條件改變後，系統依新的範圍重新計算。

配置完成後即可查看結果，不必等待 AI 討論結束。

### Compare｜個股對比

選擇兩檔股票，比較行情、候選排名、組合占比與分配金額。配置更新後，已開啟的對比結果會重新計算配置欄位；排名與 Analyze 共用選股分數排序。

### Agent｜投資會議

- 查看第 1 輪、第 2 輪討論。
- 在 chat 區塊閱讀對話，展開 chat history 查看更多內容。
- 查看風險追求與風險趨避 Agent 的個股調整建議。
- 最終裁決顯示 Judge 建議的股票／現金比例、逐股調整與理由。

介面中的「提升／降低 X% 的預算」指相對於**總投資預算**的配置調整，不是股價漲跌幅，也不是預期報酬率。

### 設定與提醒

提供個人資料、投資相關選項與股票提醒條件管理。通知是否可用，取決於裝置權限、執行環境及推播設定。

## 系統流程

```text
手機 App：輸入條件／選擇股票群組
                   │
                   ▼
             FastAPI 後端
                   │
                   ▼
       Model 1：市場狀態預測
                   │
                   ▼
       Model 2：候選選股＋資金配置
                   │
          ┌────────┴─────────┐
          ▼                  ▼
  App 顯示配置結果    Model 3 背景投資討論
                             │
                    兩輪 Agent → Judge
                             │
                       驗證與保存結果
                             │
                       App 讀取並顯示
```

使用者提交不同設定重新計算時，後端會取消舊討論；新配置成功後啟動新的討論。舊任務的結果不能覆蓋新配置。

目前配置與模型輸出使用共用檔案，主要設計為**單一使用者／單一展示工作階段**，不是已完成帳號隔離的多使用者交易平台。

## 三個模型的分工

| 模型 | 方法 | 提供的資訊 |
| --- | --- | --- |
| Model 1 | HMM、MTA、LSTM | 多頭／空頭／盤整狀態、狀態機率、預估持續時間及轉向空頭的平均吸收時間 |
| Model 2 | 候選篩選、Zipf、Genetic Algorithm | 選股分數、配置權重、分配金額、股數與現金餘額 |
| Model 3 | 本機 LLM 多 Agent 討論 | 報酬／風險觀點、證據引用、主張回應與 Judge 建議 |

### Model 2：股票池與投資身分分開

以使用者指定的 `stock_pool` 選擇股票池；沒有指定時，才以 `investor_type` 作為預設。自選模式再套用 `selected_stock_ids` 範圍。

支援小戶、中間戶、大戶與合併股票池。單股配置上限為 30%；自選至少需要 3 檔股票，但仍須通過資料及可行性檢查，不代表任意三檔、任意預算都能成功配置。

### Model 3：固定兩輪，再由 Judge 裁決

| 角色 | Ollama 模型 | 關注重點 |
| --- | --- | --- |
| Risk-Seeking | `qwen3:8b` | 報酬機會、選股評分與成長機會 |
| Risk-Averse | `mistral:latest` | 波動風險、集中度與資本保護 |
| Judge | `llama3.2:3b` | 比較雙方提案並提出最終建議 |

Agent 收到的是 Model 2 的結果摘要、Model 1 市場資訊、使用者條件、新聞證據及討論規則，並非整份 Model 2 程式或訓練資料。

新聞由 Yahoo 台灣個股新聞頁取得，篩選最近 7 天且符合公司名稱的內容。外部來源可能缺漏或變更，系統會記錄取得狀態。

**Model 3 的建議不會覆寫 Model 2 原始配置。** 輸出需經結構、數值、證據與相關一致性檢查；仍可能因逾時或回答無效而失敗。稽核通過不代表市場預測正確或自然語言理由一定完整。

## 背景討論與快取

- Model 1／2 配置與 Model 3 討論分開執行。
- 前端定期讀取狀態；目前不是逐字串流聊天室。
- 成功且通過快取資格檢查的完整討論可保存重用。
- 判定包含使用者設定、模型輸入、新聞、程式版本、模型版本與執行參數等條件。
- 即使前端輸入相同，新聞或模型程式更新也可能使快取失效。
- 失敗或不符合資格的結果不會作為有效快取重用。

## Agent 討論影響測試

`backend/regime_invest/agent_impact_backtest.py` 會將 Model 2 基準配置與 Model 3 Judge 建議配置，在相同歷史起始日、相同持有期間下比較，輸出總報酬、年化波動、最大回撤及 Sharpe 差異：

```bash
cd RegimeInvest-tku
.venv/bin/python backend/regime_invest/agent_impact_backtest.py
```

目前的初步執行是「固定一份已保存建議權重的歷史敏感度回放」，不是把 Agent 在每個歷史日期重新執行，因此不能直接宣稱 Agent 造成某個報酬提升或風險降低百分比。正式因果比較需要在每個歷史決策日保存 Model 2 原始權重、Agent Judge 最終權重、決策日與後續價格，再以相同交易成本和持有規則評估。

本機真實測試中的完整討論曾耗時約 5–9 分鐘。這只是特定環境的測試紀錄，不是效能保證；硬體、輸入長度、模型載入與重試都會影響時間。

## 開發工具與執行環境

| 層級 | 技術 |
| --- | --- |
| 手機介面 | React Native、Expo、React Navigation |
| 圖形與本機狀態 | React Native SVG、Skia、AsyncStorage |
| 後端 API | Python、FastAPI、Uvicorn |
| 數值與預測 | NumPy、pandas、SciPy、scikit-learn、hmmlearn、TensorFlow |
| 本機語言模型 | Ollama |
| 資料與新聞 | TEJ／本機 CSV、Yahoo 台灣新聞 |
| 提醒服務 | SQLite、Expo 通知及選用的 Web Push |

目前主要以 macOS 電腦搭配 iPhone Expo Go 開發與驗證。Android／其他電腦平台仍需各自驗證，不代表已完成全平台測試。

## 專案結構

```text
RegimeInvest-tku/
├── frontend/
│   ├── App.js
│   └── src/
│       ├── app/                   # Analyze、Compare、Home、Setting、會議頁
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── services/
│       └── data/
├── backend/
│   ├── app/                       # API、配置快取與提醒服務
│   ├── regime_invest/             # 正式模型、輸入資料與模型輸出
│   ├── data/                      # 本機快取、進度與資料庫
│   └── tests/                     # 測試程式與本機測試結果
└── start_dev.sh                    # macOS 區網開發啟動腳本
```

目前正式模型位於 `backend/regime_invest/`：

- `model_1_v5_production_app_duration.py`，及其引用的研究模組。
- `model_2_candidate_selection_production_UPDATED.py`
- `model_2_v2_strong_production_app_profile_UPDATED.py`
- `model_2_zipf_ga_formal.py`
- `model_3_final_polished.py`
- `discussion_cache.py`
- `run_all_models_app_FINAL_UPDATED_FIX.py`

App 應透過 FastAPI 使用背景討論流程；直接執行模型管線腳本屬於另一種執行方式，不能取代 App 狀態管理。

## 本機啟動：Expo Go

### 1. 準備環境與安裝依賴

需先安裝 Git、Python、Node.js／npm、Ollama，手機安裝與專案 SDK 相容的 Expo Go。Python 依賴包含 TensorFlow，請使用其支援的平台與版本；開發環境曾使用 Python 3.12。

```bash
git clone https://github.com/peis33/RegimeInvest-tku.git
cd RegimeInvest-tku
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cd frontend
npm ci
cd ..
```

版本依 `frontend/package.json` 與鎖定檔為準。安裝成功不代表資料已備妥。

目前 `frontend/app.json` 的圖示設定指向尚未提供的 `frontend/assets/`；需補入對應圖示，或調整圖示設定後再驗證 Expo 啟動與打包。

### 2. 準備模型資料

請依資料使用授權，將正式輸入放在 `backend/regime_invest/`。主要包括：

- 加權指數歷史資料與 `加權指數2026.csv`；歷史路徑可由 `HISTORY_CSV_PATH` 設定。
- `小戶10.csv`、`中間戶10.csv`、`大戶10.csv`。
- `model_2_investor_profile_historical.csv`（管線前置檢查需要）。
- `stock_detail_historical.csv`、`介面圖表全部資料.csv`。

欄位與編碼以各讀取程式為準；股票池支援程式指定的 CP950／UTF-8 編碼。資料集不保證全部隨倉庫提供，缺少資料時不能直接完成模型流程。

如使用 TEJ API 補資料，請在本機環境設定 `TEJ_API_KEY`，不要將真實金鑰放進版本控制。

### 3. 準備本機語言模型

```bash
ollama pull qwen3:8b
ollama pull mistral:latest
ollama pull llama3.2:3b
ollama list
```

啟動 Ollama 應用程式或服務，預設本機位址為 `http://localhost:11434`。模型需要自行下載，不包含在本倉庫中。

### 4. 啟動 App

手機與電腦連上同一個 Wi-Fi，在專案根目錄執行：

```bash
bash start_dev.sh
```

腳本會啟動後端 `8000` 與 Expo `8081`，設定手機可用的區網 API 位址。使用 Expo Go 掃描 QR Code。

若 macOS 自動偵測的網卡不適用，可指定電腦實際區網 IP：

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.100 bash start_dev.sh
```

請將範例 IP 換成自己的電腦位址。手機不能用 `localhost:8000` 連到電腦後端。防火牆及 Wi-Fi 用戶端隔離也可能阻擋連線。

只檢查後端服務時，可在電腦上呼叫：

```bash
curl http://127.0.0.1:8000/health
```

啟動腳本綁定區網位址僅供開發展示，不應直接暴露到公網；健康檢查成功也不代表所有資料與模型都已可執行。

## API 概覽

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET | `/health` | 服務健康檢查 |
| POST | `/api/investment/run` | 計算配置，成功後排入背景討論 |
| GET | `/api/investment/latest` | 取得目前配置與討論狀態 |
| POST | `/api/investment/discussion` | 啟動／重用目前配置的討論 |
| GET | `/api/stocks/{stock_id}/detail` | 個股資料 |
| GET | `/api/stocks/{stock_id}/charts` | 個股圖表資料 |

自選配置的請求範例（股票仍須存在於對應資料池）：

```json
{
  "budget": 50000,
  "investor_type": "normal",
  "risk_preference": "neutral",
  "allocation_preference": "moderate",
  "allow_fractional": true,
  "stock_pool": "normal",
  "selection_mode": "custom",
  "selected_stock_ids": ["2303", "2382", "2412", "2603"]
}
```

欄位名稱是 `selected_stock_ids`，不是 `selected_stocks`。配置更新中可能回傳 `configuration_busy`；尚無有效配置時可能回傳 `configuration_unavailable`。

## 開發與安全注意事項

- 不提交真實 `.env`、API Key、私鑰、推播 token 或訂閱資料。
- 不提交本機資料庫、討論快取、測試結果、虛擬環境及 node_modules。
- `.gitignore` 不會取消已追蹤檔案；若秘密曾提交，需處理追蹤／歷史與金鑰更換。
- 前端直接讀取後端會議資料，不包含本機會議預覽紀錄。
- 歷史行情與新聞並非交易所即時報價；畫面資料日期取決於本機資料及外部來源。
- 新聞可能缺漏，模型也可能逾時、引用錯誤或產生不完整理由。系統會進行檢查，但不保證每場討論成功。
- 尚未翻譯或不完整的裁決理由會在介面提示，不能把提示視為完整的投資分析。
- 模型、前端與測試仍持續迭代，單次成功測試不代表所有使用情境皆已驗證。
