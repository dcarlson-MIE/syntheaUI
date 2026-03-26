#!/usr/bin/env bash
# start-server.sh — Production/server deployment startup script
# Starts the backend API and serves the built frontend in the background.
#
# Usage:
#   ./start-server.sh [options]
#
# Options:
#   --host     HOST      Public hostname or IP (default: localhost)
#   --api-port PORT      Backend API port      (default: 3001)
#   --app-port PORT      Frontend port         (default: 3000)
#   --stop               Stop running instances and exit
#   --status             Show running instances and exit
#   -h, --help           Show this help message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
SERVER_PID_FILE="$PID_DIR/server.pid"
CLIENT_PID_FILE="$PID_DIR/client.pid"
SERVER_LOG="$SCRIPT_DIR/logs/server.log"
CLIENT_LOG="$SCRIPT_DIR/logs/client.log"

# ── Defaults ──────────────────────────────────────────────────────────────────
HOST="localhost"
API_PORT="3001"
APP_PORT="3000"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)      HOST="$2";     shift 2 ;;
    --api-port)  API_PORT="$2"; shift 2 ;;
    --app-port)  APP_PORT="$2"; shift 2 ;;
    --stop)      ACTION="stop";  shift ;;
    --status)    ACTION="status"; shift ;;
    -h|--help)   ACTION="help";  shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
ACTION="${ACTION:-start}"

# ── Helpers ───────────────────────────────────────────────────────────────────
is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && ps -p "$(cat "$pid_file")" > /dev/null 2>&1
}

stop_process() {
  local name="$1" pid_file="$2"
  if is_running "$pid_file"; then
    local pid; pid=$(cat "$pid_file")
    echo "  Stopping $name (PID $pid)..."
    kill "$pid" && rm -f "$pid_file"
  else
    echo "  $name is not running."
    rm -f "$pid_file"
  fi
}

# ── Actions ───────────────────────────────────────────────────────────────────
case "$ACTION" in

  help)
    head -n 14 "${BASH_SOURCE[0]}" | tail -n 13 | sed 's/^# \{0,1\}//'
    exit 0
    ;;

  stop)
    echo "Stopping services..."
    stop_process "Backend API" "$SERVER_PID_FILE"
    stop_process "Frontend"    "$CLIENT_PID_FILE"
    echo "Done."
    exit 0
    ;;

  status)
    echo "Service status:"
    if is_running "$SERVER_PID_FILE"; then
      echo "  ✓ Backend API  — running (PID $(cat "$SERVER_PID_FILE")) on http://$HOST:$API_PORT"
    else
      echo "  ✗ Backend API  — not running"
    fi
    if is_running "$CLIENT_PID_FILE"; then
      echo "  ✓ Frontend     — running (PID $(cat "$CLIENT_PID_FILE")) on http://$HOST:$APP_PORT"
    else
      echo "  ✗ Frontend     — not running"
    fi
    exit 0
    ;;

  start)
    ;;

  *)
    echo "Unknown action: $ACTION"; exit 1 ;;
esac

# ── Start ─────────────────────────────────────────────────────────────────────
echo "Starting Synthetic Patient Generator..."
echo "  Host:     $HOST"
echo "  API port: $API_PORT"
echo "  App port: $APP_PORT"
echo ""

mkdir -p "$PID_DIR" "$(dirname "$SERVER_LOG")" "$(dirname "$CLIENT_LOG")"

# Guard against already-running instances
if is_running "$SERVER_PID_FILE" || is_running "$CLIENT_PID_FILE"; then
  echo "One or more services are already running. Use --stop to stop them first."
  exit 1
fi

# ── 1. Install backend dependencies ──────────────────────────────────────────
echo "[1/4] Installing backend dependencies..."
(cd "$SCRIPT_DIR/server" && npm install --silent)

# ── 2. Start backend in background ───────────────────────────────────────────
echo "[2/4] Starting backend API on port $API_PORT..."
(
  cd "$SCRIPT_DIR/server"
  PORT="$API_PORT" \
  CLIENT_ORIGIN="http://$HOST:$APP_PORT" \
  node index.js >> "$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID_FILE"
)

# Wait until the API responds (up to 15 s)
echo "       Waiting for backend to be ready..."
for i in $(seq 1 15); do
  if node -e "fetch('http://localhost:$API_PORT/api/health').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "       ✓ Backend ready."
    break
  fi
  sleep 1
  if [[ $i -eq 15 ]]; then
    echo "       ✗ Backend did not start in time. Check logs: $SERVER_LOG"
    exit 1
  fi
done

# ── 3. Install frontend dependencies ─────────────────────────────────────────
echo "[3/4] Installing and building frontend..."
(cd "$SCRIPT_DIR/client" && npm install --silent)

# Build with the correct API URL baked in
(
  cd "$SCRIPT_DIR/client"
  VITE_API_URL="http://$HOST:$API_PORT" npm run build -- --logLevel warn
)

# ── 4. Serve built frontend in background ────────────────────────────────────
echo "[4/4] Serving frontend on port $APP_PORT..."
if ! command -v npx &>/dev/null; then
  echo "  npx not found — ensure Node.js/npm is installed."
  exit 1
fi

(
  cd "$SCRIPT_DIR/client"
  npx --yes serve -s dist -l "$APP_PORT" >> "$CLIENT_LOG" 2>&1 &
  echo $! > "$CLIENT_PID_FILE"
)

sleep 1   # brief pause so serve can bind the port

if ! is_running "$CLIENT_PID_FILE"; then
  echo "  ✗ Frontend failed to start. Check logs: $CLIENT_LOG"
  exit 1
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Both services are running in the background."
echo ""
echo "  Frontend:  http://$HOST:$APP_PORT"
echo "  Backend:   http://$HOST:$API_PORT"
echo "  JWKS URL:  http://$HOST:$API_PORT/.well-known/jwks.json"
echo ""
echo "  Logs:      $SERVER_LOG"
echo "             $CLIENT_LOG"
echo ""
echo "  To stop:   $0 --stop"
echo "  To check:  $0 --status"
