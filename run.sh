#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log() { echo -e "${CYAN}[run.sh]${NC} $*"; }
ok()  { echo -e "${GREEN}[✓]${NC} $*"; }
err() { echo -e "${RED}[✗]${NC} $*"; }

# ── dependency checks ─────────────────────────────────────────────────────────
for cmd in ollama node npm uv; do
  if ! command -v "$cmd" &>/dev/null; then
    err "$cmd not found. Run: brew install ${cmd/uv/uv}"
    exit 1
  fi
done

# ── model pull (one-time) ─────────────────────────────────────────────────────
if ! ollama list 2>/dev/null | grep -q "qwen3:32b"; then
  log "Pulling qwen3:32b (~20 GB, one-time download)..."
  ollama pull qwen3:32b
fi

# ── copy .env if missing ──────────────────────────────────────────────────────
[ ! -f "$ROOT/.env" ] && cp "$ROOT/.env.example" "$ROOT/.env" && log "Created .env from .env.example"

# ── frontend deps ─────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  log "Installing frontend dependencies..."
  (cd "$ROOT/frontend" && npm install --silent)
  ok "npm install done"
fi

# ── backend venv ──────────────────────────────────────────────────────────────
if [ ! -f "$ROOT/backend/.venv/bin/activate" ]; then
  log "Creating Python 3.12 venv..."
  (cd "$ROOT/backend" && uv venv .venv --python 3.12 --seed --clear && uv pip install -r requirements.txt -q)
  ok "Backend venv ready"
fi

# ── launch all three processes ────────────────────────────────────────────────
log "Starting Ollama..."
ollama serve &>/tmp/portfolio-ollama.log &
OLLAMA_PID=$!

log "Starting backend (FastAPI on :8000)..."
(cd "$ROOT/backend" && source .venv/bin/activate && uvicorn main:app --port 8000 2>&1) &>/tmp/portfolio-backend.log &
BACKEND_PID=$!

log "Starting frontend (Next.js on :3000)..."
(cd "$ROOT/frontend" && npm run dev 2>&1) &>/tmp/portfolio-frontend.log &
FRONTEND_PID=$!

# ── wait for backend to be ready ─────────────────────────────────────────────
log "Waiting for backend..."
for i in $(seq 1 30); do
  curl -sf http://localhost:8000/api/health &>/dev/null && break
  sleep 1
done
ok "Backend ready"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Portfolio Dashboard running at http://localhost:3000 ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Logs:  /tmp/portfolio-backend.log"
echo -e "         /tmp/portfolio-frontend.log"
echo -e "         /tmp/portfolio-ollama.log"
echo ""
echo -e "${YELLOW}  Press Ctrl+C to stop all services${NC}"

# ── cleanup on exit ───────────────────────────────────────────────────────────
trap "echo ''; log 'Stopping...'; kill $OLLAMA_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
