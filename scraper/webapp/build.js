#!/usr/bin/env node
'use strict';
// Builds actualizar-precios.html (repo root): a single self-contained page that
// fills Uber Eats / PedidosYa prices in the CSV from saved menu files, in the
// browser, with no install. Rebuild after changing lib/*.js, stores.json or
// anything in this folder:   node scraper/webapp/build.js
const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..', 'lib');
const read = f => fs.readFileSync(f, 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');

// Tiny CommonJS shim so the same lib files run in the browser.
const mods = ['csv', 'match', 'search', 'fill'].map(n =>
  `__defs['./${n}'] = function (module, exports, require) {\n${read(path.join(LIB, n + '.js'))}\n};`).join('\n');

// Only what the page needs from stores.json: search term + pinned menu files.
const stores = {};
for (const [name, cfg] of Object.entries(JSON.parse(read(path.join(__dirname, '..', 'stores.json'))))) {
  stores[name] = { search: cfg.search };
  for (const k of ['pedidosya_files', 'ubereats_files']) if (cfg[k]?.length) stores[name][k] = cfg[k];
}

const modules = `const __defs = {}, __cache = {};
function require(n) {
  const k = './' + n.split('/').pop().replace(/\\.js$/, '');
  if (!__cache[k]) { const m = { exports: {} }; __cache[k] = m; __defs[k](m, m.exports, require); }
  return __cache[k].exports;
}
${mods}
const STORES = ${JSON.stringify(stores).replace(/</g, '\\u003c')};`;

const html = read(path.join(__dirname, 'template.html'))
  .replace('/*__MODULES__*/', () => safe(modules))
  .replace('/*__APP__*/', () => safe(read(path.join(__dirname, 'app.js'))));
const out = path.resolve(__dirname, '..', '..', 'actualizar-precios.html');
fs.writeFileSync(out, html);
console.log('wrote', out, `(${(html.length / 1024).toFixed(0)} KB, ${Object.keys(stores).length} restaurants)`);
