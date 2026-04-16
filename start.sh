#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.pids"

# ── Kill anything on our ports ────────────────────────────────────
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null || fuser "$port/tcp" 2>/dev/null | tr -d ' ' || true)
  if [ -n "$pid" ]; then
    echo "⚠  Port $port in use (pid $pid) — killing"
    kill -9 $pid 2>/dev/null || true
    sleep 0.5
  fi
done

rm -f "$PID_FILE"

# ── Start backend ────────────────────────────────────────────────
echo "Starting backend..."
cd "$DIR"
npx tsx watch src/server/index.ts > "$DIR/.server.log" 2>&1 &
SERVER_PID=$!
echo "server=$SERVER_PID" > "$PID_FILE"

# ── Start frontend ───────────────────────────────────────────────
echo "Starting frontend..."
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
