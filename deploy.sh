#!/usr/bin/env bash
set -euo pipefail

#
# deploy.sh — pull latest changes from git and redeploy on the Pi.
#
# Usage:
#   ./deploy.sh          # normal deploy
#   ./deploy.sh --force  # deploy even if no new changes
#

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="main"
LOG_FILE="$APP_DIR/deploy.log"
FORCE=false

[[ "${1:-}" == "--force" ]] && FORCE=true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$APP_DIR"
log "=== Deploy started ==="

# ── 1. Check for remote changes ──────────────────────────────────────
log "Fetching from origin..."
git fetch origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]] && [[ "$FORCE" == "false" ]]; then
  log "Already up to date ($LOCAL). Nothing to deploy."
  exit 0
fi

log "Changes detected: $LOCAL -> $REMOTE"

# ── 2. Pull latest ───────────────────────────────────────────────────
log "Pulling latest changes..."
git pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

# ── 3. Install dependencies ──────────────────────────────────────────
log "Installing dependencies..."
npm ci 2>&1 | tee -a "$LOG_FILE"

# Install Playwright browsers if needed
log "Ensuring Playwright browsers are installed..."
npx playwright install chromium 2>&1 | tee -a "$LOG_FILE"

# ── 4. Build ─────────────────────────────────────────────────────────
log "Building server..."
npm run build:server 2>&1 | tee -a "$LOG_FILE"

log "Building client..."
npm run build:client 2>&1 | tee -a "$LOG_FILE"

# ── 5. Ensure MongoDB is running ─────────────────────────────────────
if command -v docker &>/dev/null; then
  log "Checking MongoDB container..."
  if ! docker ps --format '{{.Names}}' | grep -q ground-truth-mongo; then
    log "Starting MongoDB via docker-compose..."
    docker compose up -d mongodb 2>&1 | tee -a "$LOG_FILE"
  else
    log "MongoDB container is running."
  fi
fi

# ── 6. Stop existing services ────────────────────────────────────────
log "Stopping existing processes..."

SERVER_PORT=3001
CLIENT_PORT=3000

wait_for_port_free() {
  local port=$1
  local max_wait=20
  for i in $(seq 1 $max_wait); do
    if ! lsof -i :"$port" -t >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  log "WARNING: Port $port still in use after ${max_wait}s — force-killing."
  lsof -i :"$port" -t 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
}

if command -v pm2 &>/dev/null; then
  log "Using PM2 for process management."
  pm2 stop ground-truth-server 2>/dev/null || true
  pm2 stop ground-truth-client 2>/dev/null || true
  pm2 delete ground-truth-server 2>/dev/null || true
  pm2 delete ground-truth-client 2>/dev/null || true
else
  log "PM2 not found — using PID files."
  PID_DIR="$APP_DIR/.pids"
  mkdir -p "$PID_DIR"

  for svc in server client; do
    if [[ -f "$PID_DIR/$svc.pid" ]]; then
      OLD_PID=$(cat "$PID_DIR/$svc.pid")
      if kill -0 "$OLD_PID" 2>/dev/null; then
        log "Stopping old $svc (PID $OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null || true
      fi
      rm -f "$PID_DIR/$svc.pid"
    fi
  done
fi

log "Waiting for ports to free up..."
wait_for_port_free $SERVER_PORT
wait_for_port_free $CLIENT_PORT
log "Ports $SERVER_PORT and $CLIENT_PORT are free."

# ── 7. Start services ───────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
  log "Starting server with PM2..."
  pm2 start dist/server/index.js --name ground-truth-server 2>&1 | tee -a "$LOG_FILE"

  log "Starting client with PM2..."
  pm2 start npm --name ground-truth-client -- run start:client 2>&1 | tee -a "$LOG_FILE"

  pm2 save 2>&1 | tee -a "$LOG_FILE"
else
  PID_DIR="$APP_DIR/.pids"

  log "Starting server..."
  nohup node dist/server/index.js >> "$APP_DIR/server.log" 2>&1 &
  echo $! > "$PID_DIR/server.pid"
  log "Server started (PID $(cat "$PID_DIR/server.pid"))."

  log "Starting client..."
  nohup npm run start:client >> "$APP_DIR/client.log" 2>&1 &
  echo $! > "$PID_DIR/client.pid"
  log "Client started (PID $(cat "$PID_DIR/client.pid"))."
fi

# ── 8. Health check ──────────────────────────────────────────────────
log "Waiting for server to come up..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:$SERVER_PORT/api/health >/dev/null 2>&1; then
    log "Server is healthy."
    break
  fi
  if [[ $i -eq 30 ]]; then
    log "WARNING: Server health check failed after 30 attempts."
  fi
  sleep 2
done

log "Waiting for client to come up..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:$CLIENT_PORT >/dev/null 2>&1; then
    log "Client is healthy."
    break
  fi
  if [[ $i -eq 30 ]]; then
    log "WARNING: Client health check failed after 30 attempts."
  fi
  sleep 2
done

DEPLOYED_SHA=$(git rev-parse --short HEAD)
log "=== Deploy complete ($DEPLOYED_SHA) ==="
