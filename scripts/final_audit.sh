#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "== parity =="
node scripts/parity_check.js
echo "== vitest =="
npx vitest run
echo "== frontend build =="
cd frontend && npm run build >/tmp/mrv-build.log && tail -n 5 /tmp/mrv-build.log
echo "== backend check =="
cd ../backend && node --check server.js
echo "AUDIT_OK"
