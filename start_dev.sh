#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
fi
command -v node >/dev/null 2>&1 || { echo "找不到 Node.js，請先安裝。"; exit 1; }
[[ -x .venv/bin/python ]] || { echo "找不到 .venv/bin/python。"; exit 1; }
[[ -f frontend/node_modules/expo/bin/cli ]] || { echo "請先安裝 frontend 的套件。"; exit 1; }

for port in 8000 8081; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "連接埠 $port 已被使用，請先在原本的伺服器終端機按 Ctrl+C，再執行本腳本。"
    exit 1
  fi
done

LAN_IP="${REACT_NATIVE_PACKAGER_HOSTNAME:-$(ipconfig getifaddr en0 2>/dev/null || true)}"
[[ -n "$LAN_IP" ]] || { echo "無法取得區域網路 IP。請連上 Wi-Fi，或指定 REACT_NATIVE_PACKAGER_HOSTNAME。"; exit 1; }
export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP"
export EXPO_PUBLIC_API_BASE_URL="http://$LAN_IP:8000"

BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
READY=0
for ((attempt=0; attempt<30; attempt++)); do
  kill -0 "$BACKEND_PID" 2>/dev/null || { echo "後端啟動失敗，請查看上方錯誤。"; exit 1; }
  if curl -fsS --max-time 1 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[[ "$READY" == 1 ]] || { echo "後端啟動逾時。"; exit 1; }

echo "後端：$EXPO_PUBLIC_API_BASE_URL"
echo "手機請連同一個 Wi-Fi 並掃描 QR Code；電腦按 w 開啟網頁。"
echo "按 Ctrl+C 會停止前端與後端。"
cd frontend
node node_modules/expo/bin/cli start --go --lan --port 8081
