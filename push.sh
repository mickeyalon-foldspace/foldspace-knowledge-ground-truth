#!/bin/bash
cd "$(dirname "$0")"

if [ -z "$1" ]; then
  echo "Usage: ./push.sh \"commit message\""
  exit 1
fi

git add -A
git -c user.name="mickeyalon-foldspace" -c user.email="mickey.alon.21@gmail.com" \
  commit -m "$1"
git push