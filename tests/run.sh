#!/usr/bin/env bash
# Runs every committed suite. The browser suite needs playwright and a chromium
# binary; set CHROMIUM to override the path used by tests/ui.test.js.
#
# Every suite here runs on synthetic fixtures and the synthetic prompt pack. The
# editorial regression suites, which assert on the real instructions, are
# private and run separately: see docs/PROMPT-PACK.md.
#
# pipefail matters: several suites pipe into `tail`, which would otherwise
# swallow a non-zero exit and report a failing run as a passing one.
set -eo pipefail
cd "$(dirname "$0")/.."
echo "── artifact integrity ──";       node tests/artifact-integrity.test.js | tail -1
echo "── syntax ──"
for f in app/*.js data/*.js netlify/functions/*.js netlify/functions/lib/*.js tools/*.js tests/*.js tests/support/*.js tests/fixtures/*.js; do node --check "$f"; done
echo "ok"
echo "── site build ──";               node tools/build-site.js
echo "── app logic ──";                node tests/app-logic.test.js | tail -1
echo "── prompt pack ──";              node tests/prompt-pack.test.js 2>/dev/null | tail -1
echo "── security ──";                 node tests/security.test.js | tail -1
echo "── article workflow ──";         node tests/workflow.test.js | tail -1
echo "── deploy cleanup listing ──";   node tests/deploy-cleanup.test.js | tail -1
echo "── storefront catalog ──";       node tests/catalog.test.js
echo "── catalog pagination ──";       node tests/pagination.test.js
echo "── packaged function ──";       node tests/packaged.test.js 2>/dev/null
echo "── netlify blobs ──";            node tests/blobs-integration.test.js | tail -1
echo "── timing + background jobs ──"; node tests/timing-and-jobs.test.js 2>/dev/null | tail -1
echo "── generate handler ──";         node tests/generate.test.js 2>/dev/null | tail -1
echo "── browser ──"
if [ -x "${CHROMIUM:-/opt/pw-browsers/chromium}" ]; then
  node tests/mock-server.js & SERVER=$!
  trap 'kill $SERVER 2>/dev/null || true' EXIT
  sleep 2
  CHROMIUM="${CHROMIUM:-/opt/pw-browsers/chromium}" node tests/ui.test.js | tail -1
  kill $SERVER
  trap - EXIT
else
  echo "SKIP browser: Chromium not found; set CHROMIUM to its executable path."
fi
rm -rf public
