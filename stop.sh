#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.pids"

stopped=0

# ── Kill by pid file ───────────────────────────────────────────────
if [ -f "$PID_FILE" ]; then
  while IFS='=' read -r name pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (pid $pid)..."
      kill "$pid" 2>/dev/null || true
      # Wait briefly, then force-kill if still alive
      for i in 1 2 3; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 "$pid" 2>/dev/null || true
      stopped=$((stopped + 1))
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# ── Safety net: kill anything left on the ports ────────────────────
for port in 3000 3001; do
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing leftover process on port $port (pid $pid)"
    kill -9 $pid 2>/dev/null || true
    stopped=$((stopped + 1))
  fi
done

if [ "$stopped" -gt 0 ]; then
  echo "✓ All services stopped."
else
  echo "Nothing was running."
fi
