'use strict';
// Dish / restaurant name fuzzy matching (no dependencies).

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/®|™/g, '')
    .replace(/[´`'’]/g, '')
    .replace(/@/g, 'o')
    .replace(/(\d)[.,](\d)/g, '$1$2')          // 1,5 / 1.5 -> 15
    .replace(/(\d)([a-z])/g, '$1 $2')           // 6pack -> 6 pack, 15l -> 15 l
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function ratio(a, b) {
  if (!a.length && !b.length) return 100;
  return 100 * (1 - lev(a, b) / Math.max(a.length, b.length));
}

// Extra words allowed when one name is contained in the other
// ("Super Pepperoni" vs "Pizza Super Pepperoni"). Anything else extra
// (papas, bebida, zero, familiar, grande, combo...) means a different product.
const FILLER = new Set(('de del la el los las y con en a al pizza pizzas off promo wok milanesa burger hamburguesa ' +
  'sandwich sushi roll rolls clasico clasica plato').split(' '));
const nums = s => s.split(' ').filter(t => /^\d+$/.test(t)).sort().join(' ');

// Score 0..100. Exact normalized match = 100. Token-sort ratio is the base;
// a subset match ("Clásica" vs "Mila Clásica") gets credit but is penalised
// by how many extra words the longer name has, so generic names don't win.
function score(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (nums(na) !== nums(nb)) return 0;   // sizes / quantities / combo numbers must agree
  const ta = [...new Set(na.split(' '))].sort(), tb = [...new Set(nb.split(' '))].sort();
  const sortRatio = ratio(ta.join(' '), tb.join(' '));
  const sa = new Set(ta), sb = new Set(tb);
  const inter = ta.filter(t => sb.has(t));
  let subset = 0;
  const shorter = Math.min(ta.length, tb.length), longer = Math.max(ta.length, tb.length);
  if (inter.length && inter.length === shorter) {
    const extra = (ta.length > tb.length ? ta : tb).filter(t => !inter.includes(t));
    if (extra.every(t => FILLER.has(t))) subset = 97 - 6 * extra.length;
  }
  return Math.max(sortRatio, subset, ratio(na, nb));
}

// Returns { item, score } for the best menu item, or null.
function best(name, items, key = i => i.name) {
  let top = null;
  for (const it of items) {
    const s = score(name, key(it));
    if (!top || s > top.score || (s === top.score && it.available && !top.item.available)) top = { item: it, score: s };
  }
  return top;
}

module.exports = { norm, score, best };
