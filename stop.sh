#!/usr/bin/env bash
cd "$(dirname "$0")"
PID=scraper/state/pid
if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then kill "$(cat "$PID")" && echo "Stopped PID $(cat "$PID")"; else echo "Not running"; fi
rm -f "$PID"
