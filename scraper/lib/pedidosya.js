'use strict';
// PedidosYa: reads menu pages that the user saved from their own browser
// (Ctrl+S -> "Webpage, Complete" or "HTML only"). No requests are made to
// PedidosYa. The saved HTML is treated as data only (parsed, never executed).
//
// Prices come from the schema.org JSON-LD menu embedded in the page (all items,
// current price). If a product card was rendered when the page was saved and
// shows two prices (discount), full = higher, offer = lower.

const fs = require('fs');
const path = require('path');

function findSavedPages(root, skip = []) {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.endsWith('_files') || skip.includes(p)) continue;
        walk(p);
      } else if (/\.html?$/i.test(e.name) || /^pedidosya_.*\.json$/i.test(e.name)) {
        out.push(p);
      }
    }
  };
  walk(root);
  return out;
}

const toInt = s => Number(String(s).replace(/[^0-9]/g, '')) || 0;
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// JSON file downloaded by the "Guardar menú PedidosYa" bookmarklet.
function parseMenuJson(file) {
  let d;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (d?.source !== 'pedidosya-bookmarklet' || !Array.isArray(d.items)) return null;
  const items = d.items
    .filter(i => i && typeof i.name === 'string' && Number(i.full) > 0)
    .map(i => ({ name: i.name, full: Number(i.full), offer: Number(i.offer) > 0 && Number(i.offer) < Number(i.full) ? Number(i.offer) : 0, available: true, corridor: String(i.section || '') }));
  return { id: file, name: String(d.store || path.basename(file)), url: String(d.url || file), items, discountsSeen: Number(d.discounts) || 0, savedAt: d.savedAt };
}

function parseSavedPage(file) {
  if (/\.json$/i.test(file)) return parseMenuJson(file);
  const html = fs.readFileSync(file, 'utf8');
  if (!/pedidosya/i.test(html.slice(0, 200000))) return null;

  // 1) JSON-LD menu
  const items = [];
  let storeName = '';
  const walk = (o, section) => {
    if (Array.isArray(o)) return o.forEach(x => walk(x, section));
    if (!o || typeof o !== 'object') return;
    if (o['@type'] === 'Restaurant' && o.name && !storeName) storeName = o.name;
    if (o['@type'] === 'MenuSection') section = o.name;
    if (o['@type'] === 'MenuItem' && o.name) {
      const offers = [].concat(o.offers || []);
      const price = offers.map(x => Number(x.price)).find(x => x > 0) || 0;
      items.push({ name: decode(o.name), full: price, offer: 0, available: true, corridor: section || '' });
    }
    for (const v of Object.values(o)) walk(v, section);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { walk(JSON.parse(m[1])); } catch { /* ignore malformed block */ }
  }

  // 2) Rendered product cards: look for discounts (two prices in one card)
  const discounts = new Map();
  for (const m of html.matchAll(/id="product-card-\d+"[\s\S]*?(?=id="product-card-\d+"|$)/g)) {
    const chunk = m[0].slice(0, 6000);
    const text = chunk.replace(/<[^>]+>/g, '|').split('|').map(s => decode(s.trim())).filter(Boolean);
    const prices = text.filter(t => /^\$\s?\d{1,3}(\.\d{3})*$/.test(t)).map(toInt);
    const name = text.find(t => items.some(i => i.name === t));
    if (name && prices.length >= 2) {
      const hi = Math.max(...prices), lo = Math.min(...prices);
      if (lo < hi) discounts.set(name, { hi, lo });
    }
  }
  for (const it of items) {
    const d = discounts.get(it.name);
    if (d) { it.full = d.hi; it.offer = d.lo; }
  }

  if (!storeName) {
    const t = html.match(/<title>([^<]*)<\/title>/i);
    storeName = t ? decode(t[1]).replace(/\s+a Domicilio.*$/i, '').replace(/\s*[|_-]\s*PedidosYa.*$/i, '').trim() : path.basename(file);
  }
  return { id: file, name: storeName, url: file, items, discountsSeen: discounts.size };
}

module.exports = { findSavedPages, parseSavedPage };
