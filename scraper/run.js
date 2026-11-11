#!/usr/bin/env node
'use strict';
// Price processor for Planilla-Cacho.
// Reads the sheet, looks up each dish (col F) of each restaurant (col A) on the
// delivery platforms and writes prices into a COPY of the CSV, only into cells
// that are empty. Every other cell is copied unchanged.
//
//   node scraper/run.js                      # all restaurants
//   node scraper/run.js --restaurant milas_cl --restaurant kairos
//   node scraper/run.js --retry              # re-try restaurants already marked done
//   node scraper/run.js --dry-run            # don't write the output CSV

const fs = require('fs');
const path = require('path');
const os = require('os');
const csv = require('./lib/csv');
const match = require('./lib/match');
const rappi = require('./lib/rappi');
const pedidosya = require('./lib/pedidosya');
const { defaultSearch } = require('./lib/search');
const ubereats = require('./lib/ubereats');
const fill = require('./lib/fill');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'Planilla-Cacho - Sheet2.csv');
const OUTPUT = path.join(ROOT, 'Planilla-Cacho - Sheet2 - precios.csv');
const STATE = path.join(__dirname, 'state');
const LOGS = path.join(__dirname, 'logs');
const STORES = path.join(__dirname, 'stores.json');
const PROGRESS = path.join(STATE, 'progress.json');
const NOT_FOUND = path.join(LOGS, 'not_found.csv');
const MENUS = path.join(STATE, 'menus');

const { COL, blank } = fill;
// columns come from lib/fill.js (Uber O/P, PedidosYa R/S, Rappi U/V)
const PLATFORMS = {
  rappi: { ...fill.COLUMNS.rappi, enabled: true },
  // PedidosYa blocks automated access, so it is read from menu pages the user
  // saved with Ctrl+S anywhere inside this folder (no requests to PedidosYa).
  pedidosya: { ...fill.COLUMNS.pedidosya, enabled: true },
  // Uber Eats also blocks automated access: read from saved menus, like PedidosYa.
  ubereats: { ...fill.COLUMNS.ubereats, enabled: true },
};
const DOMAINS = { rappi: 'rappi.cl', pedidosya: 'pedidosya.cl', ubereats: 'ubereats.com' };
const SAVED_PARSERS = { pedidosya, ubereats };

// Santiago points to search from when a chain isn't delivering to the first one.
const LOCATIONS = [
  { name: 'Providencia', lat: -33.4263, lng: -70.6200 },
  { name: 'Las Condes', lat: -33.4130, lng: -70.5800 },
  { name: 'Santiago Centro', lat: -33.4430, lng: -70.6530 },
  { name: 'Ñuñoa', lat: -33.4560, lng: -70.5970 },
  { name: 'La Florida', lat: -33.5220, lng: -70.5980 },
  { name: 'Maipú', lat: -33.5100, lng: -70.7570 },
  { name: 'Puente Alto', lat: -33.6100, lng: -70.5760 },
  { name: 'Huechuraba', lat: -33.3700, lng: -70.6330 },
];

// ---------------------------------------------------------------- helpers
const args = process.argv.slice(2);
const opt = {
  restaurants: args.flatMap((a, i) => (a === '--restaurant' ? [args[i + 1]] : [])),
  retry: args.includes('--retry'),
  dryRun: args.includes('--dry-run'),
  only: args.includes('--only') ? args[args.indexOf('--only') + 1] : null,
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pause = () => sleep(4000 + Math.random() * 5000);
const log = (...m) => console.log(new Date().toISOString().replace('T', ' ').slice(0, 19), ...m);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); };
const fileSlug = s => match.norm(s).replace(/ /g, '_') || 'x';


// ------------------------------------------------- one instance at a time
{
  const pidFile = path.join(STATE, 'pid');
  const other = Number(readJson(pidFile, 0));
  let alive = false; try { alive = other && other !== process.pid && process.kill(other, 0); } catch {}
  if (alive && !opt.dryRun) { console.error(`Another run is in progress (PID ${other}). Wait for it or ./stop.sh first.`); process.exit(1); }
}

// --------------------------------------------------------------- the sheet
const original = fs.readFileSync(INPUT, 'utf8');
const origSheet = csv.parse(original);
if (csv.serialize(origSheet) !== original) { console.error('CSV does not round-trip exactly; refusing to continue.'); process.exit(1); }
let sheet = origSheet;
if (fs.existsSync(OUTPUT)) {
  const out = csv.parse(fs.readFileSync(OUTPUT, 'utf8'));
  if (out.rows.length === origSheet.rows.length) sheet = out; // resume from previous run
}
const dataRows = fill.dataRows(sheet.rows);

function saveSheet() {
  if (opt.dryRun) return;
  // Safety: only price cells that were empty in the original may differ.
  fill.checkOnlyBlankPricesChanged(origSheet.rows, sheet.rows);
  fs.writeFileSync(OUTPUT + '.tmp', csv.serialize(sheet));
  fs.renameSync(OUTPUT + '.tmp', OUTPUT);
}

// ------------------------------------------------------------ store config
fs.mkdirSync(MENUS, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });
const stores = readJson(STORES, {});
for (const { r } of dataRows) {
  const n = r[COL.name];
  stores[n] ??= { search: defaultSearch(n), rappi: [], pedidosya: [], ubereats: [] };
  for (const [p, cfg] of Object.entries(PLATFORMS)) {
    stores[n][p] ??= [];
    const u = String(r[cfg.url] || '').split('?')[0].trim();
    if (u.includes(DOMAINS[p]) && !stores[n][p].includes(u)) stores[n][p].push(u);
  }
}
writeJson(STORES, stores);
const progress = readJson(PROGRESS, {});

if (!fs.existsSync(NOT_FOUND)) fs.writeFileSync(NOT_FOUND, 'time,platform,csv_row,restaurant,dish,store,best_candidate,score\n');
const noteNotFound = (p, row, store, cand) => fs.appendFileSync(NOT_FOUND,
  [new Date().toISOString(), p, row.i + 1, row.r[COL.name], row.r[COL.dish], store || '', cand?.item?.name || '', cand ? cand.score.toFixed(0) : '']
    .map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',') + '\n');

// ------------------------------------------------------------------ rappi
async function rappiMenu(id) {
  const f = path.join(MENUS, `rappi_${id}.json`);
  const cached = readJson(f, null);
  if (cached && Date.now() - cached.fetchedAt < 12 * 3600e3) return cached;
  await pause();
  const m = await rappi.fetchMenu(id, log);
  if (m) { m.fetchedAt = Date.now(); writeJson(f, m); }
  return m;
}

async function rappiCandidates(name) {
  const cfg = stores[name];
  const ids = [...new Set(cfg.rappi.map(rappi.storeIdFromUrl).filter(Boolean))];
  if (ids.length) return ids;
  if (cfg.rappi_resolved?.length) return cfg.rappi_resolved;
  if (Array.isArray(cfg.rappi_resolved) && !opt.retry) return []; // searched before, nothing found
  const found = new Map();
  for (const loc of LOCATIONS) {
    await pause();
    const res = await rappi.search(cfg.search, loc, log);
    for (const s of res) {
      const sc = Math.max(match.score(cfg.search, s.brand), match.score(cfg.search, s.name));
      if (sc >= 80 && !/turbo/i.test(s.name + s.brand) && !found.has(s.id)) found.set(s.id, { ...s, sc });
    }
    if (found.size) { log(`  rappi search "${cfg.search}" @${loc.name}: ${[...found.values()].map(s => s.name).join(' / ')}`); break; }
  }
  const out = [...found.values()].sort((a, b) => b.sc - a.sc).slice(0, 3).map(s => s.id);
  if (!out.length) log(`  rappi search "${cfg.search}": no matching store in any Santiago location`);
  cfg.rappi_resolved = out;
  writeJson(STORES, stores);
  return out;
}

async function rappiMenus(name) {
  const menus = [];
  for (const id of await rappiCandidates(name)) {
    const m = await rappiMenu(id);
    if (m?.items?.length) menus.push(m);
  }
  return menus;
}

// ---------------------------------- pedidosya / ubereats (saved menu pages)
const savedPages = {};
function savedMenus(p, name) {
  if (!savedPages[p]) {
    // saved pages / bookmarklet files: anywhere in this folder, plus <platform>_*.json in Downloads
    const dl = ['Downloads', 'Descargas'].map(d => path.join(os.homedir(), d)).filter(d => fs.existsSync(d));
    const re = new RegExp(`^${p}_.*\\.json$`, 'i');
    const files = [...pedidosya.findSavedPages(ROOT, [__dirname]),
      ...dl.flatMap(d => fs.readdirSync(d).filter(n => re.test(n)).map(n => path.join(d, n)))];
    savedPages[p] = files.map(f => {
      try { return SAVED_PARSERS[p].parseSavedPage(f); } catch (e) { log(`  could not read ${f}: ${e.message}`); return null; }
    }).filter(m => m?.items?.length);
    log(`${p}: ${savedPages[p].length} saved menu page(s) found: ${savedPages[p].map(m => m.name).join(' / ') || '-'}`);
  }
  return fill.selectMenus(savedPages[p], name, stores, p);
}

async function fillPlatform(p, name, rows) {
  const P = PLATFORMS[p];
  const todo = rows.filter(x => blank(x.r[P.full]));
  if (!todo.length) return 'nothing to fill';
  const menus = p === 'rappi' ? await rappiMenus(name) : savedMenus(p, name);
  if (!menus.length) {
    if (p === 'rappi') todo.forEach(x => noteNotFound(p, x, '', null));
    return p === 'rappi' ? 'store not found' : 'no saved page for this restaurant';
  }
  let filled = 0;
  for (const { x, hit, best } of fill.fillRows(todo, menus, p)) {
    if (!hit) { noteNotFound(p, x, best?.store?.name || menus[0].name, best); continue; }
    filled++;
    log(`    row ${x.i + 1} "${x.r[COL.dish]}" -> "${hit.item.name}" @ ${hit.store.name}: ${x.r[P.full]} / ${x.r[P.offer]} (score ${hit.score.toFixed(0)})`);
  }
  return `filled ${filled}/${todo.length}`;
}

// ------------------------------------------------------------------- main
(async () => {
  const byRest = new Map();
  for (const x of dataRows) {
    if (opt.restaurants.length && !opt.restaurants.includes(x.r[COL.name])) continue;
    if (!byRest.has(x.r[COL.name])) byRest.set(x.r[COL.name], []);
    byRest.get(x.r[COL.name]).push(x);
  }
  log(`start: ${byRest.size} restaurants, ${dataRows.length} rows; output -> ${path.basename(OUTPUT)}`);

  let i = 0;
  for (const [name, rows] of byRest) {
    i++;
    for (const [p, cfg] of Object.entries(PLATFORMS)) {
      if (!cfg.enabled || (opt.only && opt.only !== p)) continue;
      progress[p] ??= {};
      // saved PedidosYa / Uber Eats pages are cheap to re-check (new pages may have been added)
      if (p === 'rappi' && progress[p][name] && !opt.retry && !opt.restaurants.length) continue;
      log(`[${i}/${byRest.size}] ${p}: ${name} ("${stores[name].search}")`);
      try {
        const result = await fillPlatform(p, name, rows);
        log(`  -> ${result}`);
        progress[p][name] = { at: new Date().toISOString(), result };
      } catch (e) {
        log(`  !! error: ${e.message}`);
      }
      saveSheet();
      if (!opt.dryRun) writeJson(PROGRESS, progress);
    }
  }
  log('done.');
})().catch(e => { log('fatal:', e.stack || e.message); process.exit(1); });
