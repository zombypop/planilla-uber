'use strict';
// Rappi Chile: public store pages and search pages are server-rendered and
// embed their data as Next.js __NEXT_DATA__ JSON, so plain HTTP is enough.

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function locationCookie(loc) {
  const v = { id: 1, city: 'Santiago', url: 'santiago', lat: loc.lat, lng: loc.lng, autoLocation: false, address: loc.name };
  return 'currentLocation=' + Buffer.from(encodeURIComponent(JSON.stringify(v))).toString('base64');
}

async function getNextData(url, loc, log) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'es-CL,es;q=0.9', cookie: loc ? locationCookie(loc) : '' },
        signal: AbortSignal.timeout(45000),
      });
    } catch (e) {
      log(`  rappi fetch error (${e.message}), retry ${attempt}`);
      await sleep(15000 * attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      log(`  rappi HTTP ${res.status}, backing off (attempt ${attempt})`);
      await sleep(60000 * attempt);
      continue;
    }
    if (res.status === 404) return null;
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) { log(`  rappi: no __NEXT_DATA__ (HTTP ${res.status})`); return null; }
    return JSON.parse(m[1]);
  }
  throw new Error('rappi: too many failed attempts for ' + url);
}

function storeIdFromUrl(url) {
  const m = String(url).match(/rappi\.cl\/restaurantes\/(\d+)/);
  return m ? m[1] : null;
}

// Returns { id, name, url, items:[{name, full, offer, available}] } or null.
async function fetchMenu(storeId, log) {
  const url = `https://www.rappi.cl/restaurantes/${storeId}`;
  const d = await getNextData(url, null, log);
  const fb = d?.props?.pageProps?.fallback;
  if (!fb) return null;
  const key = Object.keys(fb).find(k => k.includes('restaurant/'));
  const st = key && fb[key];
  if (!st || !Array.isArray(st.corridors)) return null;
  const items = [];
  for (const c of st.corridors) {
    for (const p of c.products || []) {
      const a = Number(p.price) || 0, b = Number(p.realPrice) || 0;
      const full = Math.max(a, b), low = Math.min(a, b) || full;
      items.push({ name: p.name, full, offer: low < full ? low : 0, available: p.isAvailable !== false, corridor: c.name });
    }
  }
  return { id: String(st.id || storeId), name: st.name, url, items };
}

// Search near a location. Returns [{id, name, brand}]
async function search(query, loc, log) {
  const d = await getNextData('https://www.rappi.cl/search?query=' + encodeURIComponent(query), loc, log);
  const fb = d?.props?.pageProps?.fallback;
  if (!fb) return [];
  const stores = [];
  for (const v of Object.values(fb)) for (const s of v?.stores || []) {
    if (s.storeType && s.storeType !== 'restaurant') continue;
    stores.push({ id: String(s.storeId), name: s.storeName || '', brand: s.brandName || '' });
  }
  return stores;
}

module.exports = { fetchMenu, search, storeIdFromUrl };
