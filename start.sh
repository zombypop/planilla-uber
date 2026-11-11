#!/usr/bin/env bash
# Start the price processor in the background. Extra args are passed to run.js
# (e.g. ./start.sh --retry   or   ./start.sh --restaurant milas_cl)
cd "$(dirname "$0")"
PID=scraper/state/pid
mkdir -p scraper/state scraper/logs
if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then
  echo "Already running (PID $(cat "$PID")). Use ./status.sh or ./stop.sh"; exit 1
fi
[ -d scraper/node_modules/playwright-core ] || (cd scraper && npm install --silent)
nohup node scraper/run.js "$@" >> scraper/logs/run.log 2>&1 &
echo $! > "$PID"
echo "Started (PID $!). Log: scraper/logs/run.log   Output: 'Planilla-Cacho - Sheet2 - precios.csv'"
