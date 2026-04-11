#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.pids"

# ── Pre-flight checks ──────────────────────────────────────────────
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "⚠  Port $port already in use (pid $pid) — killing it"
    kill -9 $pid 2>/dev/null || true
    sleep 0.5
  fi
done

if [ -f "$PID_FILE" ]; then
  echo "Cleaning up stale pid file"
  rm -f "$PID_FILE"
fi

# ── Start backend server ───────────────────────────────────────────
echo "Starting backend server on port 3001..."
cd "$DIR"
npx tsx watch src/server/index.ts > "$DIR/.server.log" 2>&1 &
SERVER_PID=$!
echo "server=$SERVER_PID" > "$PID_FILE"

# ── Start Next.js client ───────────────────────────────────────────
echo "Starting Next.js client on port 3000..."
cd "$DIR/src/client"
npx next dev --port 3000 > "$DIR/.client.log" 2>&1 &
CLIENT_PID=$!
echo "client=$CLIENT_PID" >> "$PID_FILE"

cd "$DIR"

echo ""
echo "✓ Services started"
echo "  Backend  → http://localhost:3001  (pid $SERVER_PID)"
echo "  Frontend → http://localhost:3000  (pid $CLIENT_PID)"
echo "  Logs     → .server.log / .client.log"
echo ""
echo "Run ./stop.sh to shut everything down."
