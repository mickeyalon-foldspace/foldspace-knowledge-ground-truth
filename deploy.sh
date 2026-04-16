#!/usr/bin/env bash
# Pull latest changes, rebuild, and restart services.
# Run this from the project directory on the server.
set -euo pipefail

echo "→ Pulling latest..."
git pull --ff-only

echo "→ Installing dependencies..."
npm ci

echo "→ Rebuilding frontend..."
cd src/client
npx next build
cd ../..

echo "→ Restarting services..."
pm2 restart all

echo ""
echo "✓ Done"
pm2 status
