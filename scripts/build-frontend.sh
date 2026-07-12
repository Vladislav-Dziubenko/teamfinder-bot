#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../web-src"

npm ci
npm run build

rm -rf ../webapp/static/*
cp -r out/* ../webapp/static/
echo "Frontend copied to webapp/static"
