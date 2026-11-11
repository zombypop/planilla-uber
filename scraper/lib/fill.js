'use strict';
// Matching + filling shared by run.js (Node) and actualizar-precios.html (browser).
// No Node APIs here: it must run unchanged in the browser.

const match = require('./match');

const COL = { name: 0, dish: 5 };
// 0-based columns of each platform in the sheet (O/P/Q, R/S/T, U/V/W).
const COLUMNS = {
  ubereats: { full: 14, offer: 15, url: 16, label: 'Uber Eats', header: 'Uber' },
  pedidosya: { full: 17, offer: 18, url: 19, label: 'PedidosYa', header: 'PedidosYa' },
  rappi: { full: 20, offer: 21, url: 22, label: 'Rappi', header: 'Rappi' },
};
const THRESHOLD = 85;

const blank = v => !String(v || '').trim();
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const baseName = f => String(f).split(/[\\/]/).pop();

// Bookmarklet JSON ("Guardar menú PedidosYa / Uber Eats") -> menu, or null.
const SOURCES = { 'pedidosya-bookmarklet': 'pedidosya', 'ubereats-bookmarklet': 'ubereats' };
function menuFromJson(d, file) {
  const platform = SOURCES[d?.source];
  if (!platform || !Array.isArray(d.items)) return null;
  const items = d.items
    .filter(i => i && typeof i.name === 'string' && Number(i.full) > 0)
    .map(i => ({ name: i.name, full: Number(i.full), offer: Number(i.offer) > 0 && Number(i.offer) < Number(i.full) ? Number(i.offer) : 0, available: true, corridor: String(i.section || '') }));
  return { platform, id: file, name: String(d.store || baseName(file)), url: String(d.url || file), items, discountsSeen: Number(d.discounts) || 0, savedAt: d.savedAt };
}

// "Streat Burger (Parque Arauco)" / "Barra Chalaca - Costanera" -> brand part
const brand = name => String(name).split(/ - | \(/)[0];
const strictMatch = (search, menu) => match.score(search, brand(menu.name)) >= 85;

// Saved menus (of one platform) that belong to restaurant `name`.
// stores: { <col A name>: { search, <platform>_files: [paths] } }
function selectMenus(menus, name, stores, platform) {
  const cfg = stores[name];
  const pinned = (cfg[`${platform}_files`] || []).map(baseName);
  if (pinned.length) return menus.filter(m => pinned.includes(baseName(m.id)));
  const strict = menus.filter(m => strictMatch(cfg.search, m));
  if (strict.length) return strict;
  // fallback: store name starts with the search words ("Tarragona Mall Plaza Alameda"),
  // unless that menu clearly belongs to another restaurant ("streat" vs "Streat Burger ...")
  const q = match.norm(cfg.search);
  return menus.filter(m => (match.norm(m.name) + ' ').startsWith(q + ' ') &&
    !Object.entries(stores).some(([n, c]) => n !== name && c.search !== cfg.search && strictMatch(c.search, m)));
}

// Fill the empty `platform` price cells of `rows` ([{r: row array, i: row index}])
// from `menus`. Mutates the rows. Returns one result per row that needed a price:
// { x, hit: {item, score, store} | null, best: {item, score, store} | null }
function fillRows(rows, menus, platform) {
  const P = COLUMNS[platform];
  const todo = rows.filter(x => blank(x.r[P.full]));
  if (!todo.length || !menus.length) return todo.map(x => ({ x, hit: null, best: null }));
  // Prefer the store whose menu covers most dishes; fall back to the others per dish.
  const cover = m => todo.filter(x => (match.best(x.r[COL.dish], m.items)?.score || 0) >= THRESHOLD).length;
  menus = [...menus].sort((a, b) => cover(b) - cover(a));
  return todo.map(x => {
    let hit = null, best = null;
    for (const m of menus) {
      const b = match.best(x.r[COL.dish], m.items);
      if (b && (!best || b.score > best.score)) best = { ...b, store: m };
      if (b && b.score >= THRESHOLD) { hit = { ...b, store: m }; break; }
    }
    if (hit) {
      x.r[P.full] = money(hit.item.full);
      if (blank(x.r[P.offer])) x.r[P.offer] = money(hit.item.offer);
    }
    return { x, hit, best };
  });
}

// Throws unless the only differences are price cells that were empty in `orig`.
function checkOnlyBlankPricesChanged(origRows, rows) {
  const allowed = new Set(Object.values(COLUMNS).flatMap(p => [p.full, p.offer]));
  if (origRows.length !== rows.length) throw new Error('row count changed');
  rows.forEach((row, i) => row.forEach((v, j) => {
    const o = origRows[i][j];
    if (v !== o && !(allowed.has(j) && blank(o))) throw new Error(`refusing to change cell row ${i + 1} col ${j + 1}`);
  }));
}

// Data rows: from the 3rd line on, with restaurant and dish.
const dataRows = sheetRows => sheetRows.map((r, i) => ({ r, i })).filter(({ r, i }) => i >= 2 && !blank(r[COL.name]) && !blank(r[COL.dish]));

module.exports = { COL, COLUMNS, THRESHOLD, blank, money, menuFromJson, selectMenus, fillRows, checkOnlyBlankPricesChanged, dataRows, brand };
