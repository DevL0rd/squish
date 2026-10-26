#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is not installed. Install version 22.18 or newer from https://nodejs.org and run this again."
  exit 1
fi
npm install
echo "Setup done. Run ./start.sh to play."
