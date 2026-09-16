#!/usr/bin/env bash
# Runs every suite. The browser suite needs playwright and a chromium binary;
# set CHROMIUM to override the path used by tests/ui.test.js.
set -e
cd "$(dirname "$0")/.."
echo "── syntax ──"
for f in app/*.js data/*.js netlify/functions/*.js netlify/functions/lib/*.js tests/*.js; do node --check "$f"; done
echo "ok"
echo "── prompts + validation ──";   node tests/prompts.test.js     | tail -3
echo "── correction pass ──";        node tests/corrections.test.js | tail -3
echo "── storefront catalog ──";     node tests/catalog.test.js
echo "── generate handler ──";       node tests/generate.test.js    | tail -4
echo "── browser ──"
node tests/mock-server.js & SERVER=$!
sleep 1.5
node tests/ui.test.js | tail -3
kill $SERVER
