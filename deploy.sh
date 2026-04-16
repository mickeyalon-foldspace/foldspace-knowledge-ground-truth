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

# ── 6. Restart services ──────────────────────────────────────────────
# Stop existing processes
log "Stopping existing processes..."

if command -v pm2 &>/dev/null; then
  # PM2 is available — use it for process management
  log "Using PM2 for process management."

  pm2 delete ground-truth-server 2>/dev/null || true
  pm2 delete ground-truth-client 2>/dev/null || true

  log "Starting server with PM2..."
  pm2 start dist/server/index.js --name ground-truth-server 2>&1 | tee -a "$LOG_FILE"

  log "Starting client with PM2..."
  pm2 start npm --name ground-truth-client -- run start:client 2>&1 | tee -a "$LOG_FILE"

  pm2 save 2>&1 | tee -a "$LOG_FILE"
else
  # Fallback: plain background processes with PID files
  log "PM2 not found — using PID files."

  PID_DIR="$APP_DIR/.pids"
  mkdir -p "$PID_DIR"

  # Kill old server
  if [[ -f "$PID_DIR/server.pid" ]]; then
    OLD_PID=$(cat "$PID_DIR/server.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      log "Killing old server (PID $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null || true
      sleep 2
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/server.pid"
  fi

  # Kill old client
  if [[ -f "$PID_DIR/client.pid" ]]; then
    OLD_PID=$(cat "$PID_DIR/client.pid")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      log "Killing old client (PID $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null || true
      sleep 2
      kill -9 "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_DIR/client.pid"
  fi

  # Start server
  log "Starting server..."
  nohup node dist/server/index.js >> "$APP_DIR/server.log" 2>&1 &
  echo $! > "$PID_DIR/server.pid"
  log "Server started (PID $(cat "$PID_DIR/server.pid"))."

  # Start client
  log "Starting client..."
  nohup npx next start src/client --port 3000 >> "$APP_DIR/client.log" 2>&1 &
  echo $! > "$PID_DIR/client.pid"
  log "Client started (PID $(cat "$PID_DIR/client.pid"))."
fi

# ── 7. Health check ──────────────────────────────────────────────────
log "Waiting for server to come up..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
    log "Server is healthy."
    break
  fi
  if [[ $i -eq 15 ]]; then
    log "WARNING: Server health check failed after 15 attempts."
  fi
  sleep 2
done

DEPLOYED_SHA=$(git rev-parse --short HEAD)
log "=== Deploy complete ($DEPLOYED_SHA) ==="
