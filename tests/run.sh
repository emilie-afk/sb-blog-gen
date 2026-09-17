#!/usr/bin/env bash
# Runs every suite. The browser suite needs playwright and a chromium binary;
# set CHROMIUM to override the path used by tests/ui.test.js.
# pipefail matters: several suites pipe into `tail`, which would otherwise
# swallow a non-zero exit and report a failing run as a passing one.
set -eo pipefail
cd "$(dirname "$0")/.."
echo "── artifact integrity ──";     node tests/artifact-integrity.test.js
echo "── syntax ──"
for f in app/*.js data/*.js netlify/functions/*.js netlify/functions/lib/*.js tests/*.js; do node --check "$f"; done
echo "ok"
echo "── prompts + validation ──";   node tests/prompts.test.js     | tail -3
echo "── gift prompt voice ──";       node tests/prompt-voice.test.js | tail -3
echo "── correction pass ──";        node tests/corrections.test.js | tail -3
echo "── storefront catalog ──";     node tests/catalog.test.js
echo "── catalog pagination ──";     node tests/pagination.test.js
echo "── packaged function ──";      node tests/packaged.test.js
echo "── netlify blobs ──";           node tests/blobs-integration.test.js | tail -3
echo "── timing + background jobs ──"; node tests/timing-and-jobs.test.js | tail -3
echo "── generate handler ──";       node tests/generate.test.js    | tail -4
echo "── browser ──"
if [ -x "${CHROMIUM:-/opt/pw-browsers/chromium}" ]; then
  node tests/mock-server.js & SERVER=$!
  trap 'kill $SERVER 2>/dev/null || true' EXIT
  sleep 1.5
  CHROMIUM="${CHROMIUM:-/opt/pw-browsers/chromium}" node tests/ui.test.js | tail -3
  kill $SERVER
  trap - EXIT
else
  echo "SKIP browser: Chromium not found; set CHROMIUM to its executable path."
fi
