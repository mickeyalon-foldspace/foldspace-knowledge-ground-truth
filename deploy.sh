#!/usr/bin/env bash
# Pull latest changes and restart services on the Pi.
# Usage: ./deploy.sh
set -euo pipefail

HOST="henrypi@eval.foldspace.ai"
APP_DIR="/home/henrypi/foldspace-knowledge-ground-truth"

echo "Deploying to $HOST..."

ssh "$HOST" bash -s "$APP_DIR" <<'REMOTE'
set -euo pipefail
cd "$1"

echo "→ Pulling latest..."
git pull --ff-only

echo "→ Installing dependencies..."
npm ci

echo "→ Restarting services..."
pm2 restart all

echo ""
echo "✓ Done"
pm2 status
REMOTE
