#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.pids"

# ── Pre-flight: kill anything on our ports ────────────────────────
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null || fuser "$port/tcp" 2>/dev/null | tr -d ' ' || true)
  if [ -n "$pid" ]; then
    echo "⚠  Port $port in use (pid $pid) — killing"
    kill -9 $pid 2>/dev/null || true
    sleep 0.5
  fi
done

rm -f "$PID_FILE"

# ── Detect mode: pass --prod for production ───────────────────────
if [ "${1:-}" = "--prod" ]; then
  MODE="prod"
else
  MODE="dev"
fi

# ── Start backend ────────────────────────────────────────────────
echo "Starting backend ($MODE)..."
cd "$DIR"
if [ "$MODE" = "prod" ]; then
  npx tsx src/server/index.ts > "$DIR/.server.log" 2>&1 &
else
  npx tsx watch src/server/index.ts > "$DIR/.server.log" 2>&1 &
fi
SERVER_PID=$!
echo "server=$SERVER_PID" > "$PID_FILE"

# ── Start frontend ───────────────────────────────────────────────
echo "Starting frontend ($MODE)..."
cd "$DIR/src/client"
if [ "$MODE" = "prod" ]; then
  npx next start -p 3000 > "$DIR/.client.log" 2>&1 &
else
  npx next dev --port 3000 > "$DIR/.client.log" 2>&1 &
fi
CLIENT_PID=$!
echo "client=$CLIENT_PID" >> "$PID_FILE"

cd "$DIR"

echo ""
echo "✓ Services started ($MODE)"
echo "  Backend  → http://localhost:3001  (pid $SERVER_PID)"
echo "  Frontend → http://localhost:3000  (pid $CLIENT_PID)"
echo "  Logs     → .server.log / .client.log"
echo ""
echo "Run ./stop.sh to shut everything down."
