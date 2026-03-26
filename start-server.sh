#!/usr/bin/env bash
set -euo pipefail

# Starts backend + built frontend in background.
# Also supports status/stop/check helpers.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/logs"
SERVER_PID_FILE="$PID_DIR/server.pid"
CLIENT_PID_FILE="$PID_DIR/client.pid"
SERVER_LOG="$LOG_DIR/server.log"
CLIENT_LOG="$LOG_DIR/client.log"

HOST_INPUT="localhost"
SCHEME="http"
API_PORT="3001"
APP_PORT="3000"
ACTION="start"

usage() {
  cat <<'EOF'
Usage:
  ./start-server.sh [options]

Options:
  --host <host-or-url>  Hostname or full URL (default: localhost)
                        Examples:
                        --host syntheaui.os.mieweb.org
                        --host https://syntheaui.os.mieweb.org
  --api-port <port>     Backend API port (default: 3001)
  --app-port <port>     Frontend app port (default: 3000)
  --scheme <http|https> Override scheme if --host is hostname only
  --status              Show service status
  --stop                Stop services
  --check               Check runtime deployment diagnostics
  -h, --help            Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST_INPUT="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    --scheme) SCHEME="$2"; shift 2 ;;
    --status) ACTION="status"; shift ;;
    --stop) ACTION="stop"; shift ;;
    --check) ACTION="check"; shift ;;
    -h|--help) ACTION="help"; shift ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

normalize_host() {
  local raw="$1"
  local host="$raw"

  if [[ $raw == *://* ]]; then
    SCHEME="${raw%%://*}"
    host="${raw#*://}"
  fi

  host="${host%%/*}"
  host="${host%%:*}"

  if [[ -z "$host" ]]; then
    echo "Invalid --host value: $raw" >&2
    exit 1
  fi

  echo "$host"
}

HOST="$(normalize_host "$HOST_INPUT")"

build_public_url() {
  local scheme="$1"
  local host="$2"
  local port="$3"

  if [[ "$scheme" == "https" && "$port" == "443" ]]; then
    echo "$scheme://$host"
  elif [[ "$scheme" == "http" && "$port" == "80" ]]; then
    echo "$scheme://$host"
  else
    echo "$scheme://$host:$port"
  fi
}

PUBLIC_APP_URL="$(build_public_url "$SCHEME" "$HOST" "$APP_PORT")"
PUBLIC_API_URL="$(build_public_url "$SCHEME" "$HOST" "$API_PORT")"

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && ps -p "$(cat "$pid_file")" >/dev/null 2>&1
}

stop_one() {
  local name="$1" pid_file="$2"
  if is_running "$pid_file"; then
    local pid
    pid="$(cat "$pid_file")"
    kill "$pid" || true
  fi
  rm -f "$pid_file"
  echo "Stopped $name"
}

if [[ "$ACTION" == "help" ]]; then
  usage
  exit 0
fi

mkdir -p "$PID_DIR" "$LOG_DIR"

if [[ "$ACTION" == "status" ]]; then
  if is_running "$SERVER_PID_FILE"; then
    echo "Backend: running (PID $(cat "$SERVER_PID_FILE"))"
  else
    echo "Backend: not running"
  fi
  if is_running "$CLIENT_PID_FILE"; then
    echo "Frontend: running (PID $(cat "$CLIENT_PID_FILE"))"
  else
    echo "Frontend: not running"
  fi
  exit 0
fi

if [[ "$ACTION" == "stop" ]]; then
  stop_one "backend" "$SERVER_PID_FILE"
  stop_one "frontend" "$CLIENT_PID_FILE"
  exit 0
fi

if [[ "$ACTION" == "check" ]]; then
  if command -v curl >/dev/null 2>&1; then
    echo "Checking local API health: http://127.0.0.1:$API_PORT/api/health/details"
    curl -fsS "http://127.0.0.1:$API_PORT/api/health/details" | cat
    echo
    echo "Checking JWKS: $PUBLIC_APP_URL/.well-known/jwks.json"
    curl -fsS "$PUBLIC_APP_URL/.well-known/jwks.json" | cat
    echo
  else
    echo "curl not found; install curl to use --check"
    exit 1
  fi
  exit 0
fi

if is_running "$SERVER_PID_FILE" || is_running "$CLIENT_PID_FILE"; then
  echo "Services already running. Use --stop first."
  exit 1
fi

echo "Starting backend on :$API_PORT"
(
  cd "$SCRIPT_DIR/server"
  PORT="$API_PORT" \
  CLIENT_ORIGIN="$PUBLIC_APP_URL" \
  PUBLIC_API_URL="$PUBLIC_API_URL" \
  nohup node index.js >>"$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID_FILE"
)

echo "Installing and building frontend"
(
  cd "$SCRIPT_DIR/client"
  npm install --silent
  VITE_API_URL="$PUBLIC_API_URL" npm run build -- --logLevel warn
)

echo "Starting frontend on :$APP_PORT"
(
  cd "$SCRIPT_DIR/client"
  nohup npx --yes serve -s dist -l "$APP_PORT" >>"$CLIENT_LOG" 2>&1 &
  echo $! > "$CLIENT_PID_FILE"
)

echo "Started"
echo "  Frontend:  $PUBLIC_APP_URL"
echo "  Backend:   $PUBLIC_API_URL"
echo "  JWKS:      $PUBLIC_APP_URL/.well-known/jwks.json"
echo "  Logs:      $SERVER_LOG and $CLIENT_LOG"
