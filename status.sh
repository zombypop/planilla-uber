#!/usr/bin/env bash
cd "$(dirname "$0")"
PID=scraper/state/pid
if [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo "RUNNING (PID $(cat "$PID"))"; else echo "NOT RUNNING"; fi
node -e '
const csv=require("./scraper/lib/csv"),fs=require("fs");
const f="Planilla-Cacho - Sheet2 - precios.csv"; if(!fs.existsSync(f)){console.log("no output yet");process.exit()}
const o=csv.parse(fs.readFileSync("Planilla-Cacho - Sheet2.csv","utf8")).rows, n=csv.parse(fs.readFileSync(f,"utf8")).rows;
for (const [p,c] of [["PedidosYa (R)",17],["Rappi (U)",20]]) {
  let had=0,added=0,empty=0; n.slice(2).forEach((r,i)=>{ if(!r[0]||!r[5])return; const ov=o[i+2][c].trim(); if(ov)had++; else if(r[c].trim())added++; else empty++; });
  console.log(`${p}: already had ${had}, added ${added}, still empty ${empty}`);
}'
echo "not-found rows logged: $(( $(wc -l < scraper/logs/not_found.csv 2>/dev/null || echo 1) - 1 ))  (scraper/logs/not_found.csv)"
echo "--- last log lines"; tail -n 8 scraper/logs/run.log 2>/dev/null || true
