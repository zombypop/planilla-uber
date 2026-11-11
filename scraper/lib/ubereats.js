'use strict';
// Uber Eats: reads menus the user saved from their own browser, either with the
// "Guardar menú Uber Eats" bookmarklet (ubereats_*.json) or with Ctrl+S (.html).
// Uber Eats blocks automated access, so no requests are made to Uber.
// The saved HTML is treated as data only (parsed, never executed).
//
// Prices come from the schema.org JSON-LD menu embedded in the page (all items,
// current price). If an item card shows two prices (discount), full = higher,
// offer = lower.

const fs = require('fs');
const path = require('path');

const toInt = s => Number(String(s).replace(/[^0-9]/g, '')) || 0;
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const PRICE = /^(?:\$|CLP)\s?\d{1,3}(?:[.,]\d{3})*$/;

// JSON file downloaded by the "Guardar menú Uber Eats" bookmarklet.
function parseMenuJson(file) {
  let d;
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (d?.source !== 'ubereats-bookmarklet' || !Array.isArray(d.items)) return null;
  const items = d.items
    .filter(i => i && typeof i.name === 'string' && Number(i.full) > 0)
    .map(i => ({ name: i.name, full: Number(i.full), offer: Number(i.offer) > 0 && Number(i.offer) < Number(i.full) ? Number(i.offer) : 0, available: true, corridor: String(i.section || '') }));
  return { id: file, name: String(d.store || path.basename(file)), url: String(d.url || file), items, discountsSeen: Number(d.discounts) || 0, savedAt: d.savedAt };
}

function parseSavedPage(file) {
  if (/\.json$/i.test(file)) return parseMenuJson(file);
  const html = fs.readFileSync(file, 'utf8');
  if (!/ubereats\.com/i.test(html.slice(0, 200000))) return null;

  // 1) JSON-LD menu
  const items = [];
  let storeName = '';
  const walk = (o, section) => {
    if (Array.isArray(o)) return o.forEach(x => walk(x, section));
    if (!o || typeof o !== 'object') return;
    if (/Restaurant|FoodEstablishment|Store/.test(String(o['@type'])) && o.name && !storeName) storeName = decode(o.name);
    if (o['@type'] === 'MenuSection') section = o.name;
    if (o['@type'] === 'MenuItem' && o.name) {
      const price = [].concat(o.offers || []).map(x => Number(x.price)).find(x => x > 0) || 0;
      if (price) items.push({ name: decode(o.name), full: Math.round(price), offer: 0, available: true, corridor: section || '' });
    }
    for (const v of Object.values(o)) walk(v, section);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { walk(JSON.parse(m[1])); } catch { /* ignore malformed block */ }
  }

  // 2) Rendered item cards: name + one or two prices
  const cards = new Map();
  for (const m of html.matchAll(/data-testid="store-item[^"]*"[\s\S]*?(?=data-testid="store-item|$)/g)) {
    const chunk = m[0].slice(m[0].indexOf('>') + 1, 6000);
    const text = chunk.replace(/<[^>]+>/g, '|').split('|').map(s => decode(s.trim())).filter(Boolean);
    const prices = text.filter(t => PRICE.test(t)).map(toInt).filter(n => n > 0);
    if (!prices.length) continue;
    const name = text.find(t => items.some(i => i.name === t)) ||
      text.find(t => !PRICE.test(t) && !/^(popular|nuevo|promo|oferta|más vendido|#\d.*|-?\d+\s?%.*|.*kcal.*|•|·)$/i.test(t));
    if (name && !cards.has(name)) cards.set(name, { hi: Math.max(...prices), lo: Math.min(...prices) });
  }
  let discounts = 0;
  for (const [name, c] of cards) {
    const it = items.find(i => i.name === name);
    if (it) { if (c.lo < c.hi) { it.full = c.hi; it.offer = c.lo; discounts++; } }
    else items.push({ name, full: c.hi, offer: c.lo < c.hi ? c.lo : 0, available: true, corridor: '' });
    if (!it && c.lo < c.hi) discounts++;
  }

  if (!storeName) {
    const t = html.match(/<title>([^<]*)<\/title>/i);
    storeName = t ? decode(t[1]).replace(/\s*[|_-]\s*Uber Eats.*$/i, '').replace(/^Pide\s+/i, '').trim() : path.basename(file);
  }
  return { id: file, name: storeName, url: file, items, discountsSeen: discounts };
}

module.exports = { parseSavedPage };
