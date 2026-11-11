// "Guardar menú Uber Eats" bookmarklet (readable source).
// build.js minifies this into pedidosya-bookmarklet.html at the repo root.
//
// Runs on the Uber Eats store page the user has open:
//   1. scrolls to the bottom so every item card is drawn (discounts are only in drawn cards)
//   2. reads the schema.org menu (all items + current price) and the visible cards (old/new price)
//   3. downloads ubereats_<store>.json
// It makes no network requests and sends nothing anywhere.
(async () => {
  if (window.__ueMenuBusy) return;
  window.__ueMenuBusy = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toast = (msg, color) => {
    let el = document.getElementById('__ue_menu_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '__ue_menu_toast';
      el.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;max-width:360px;padding:12px 16px;' +
        'border-radius:10px;font:14px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3);white-space:pre-line';
      document.body.appendChild(el);
    }
    el.style.background = color || '#333';
    el.textContent = msg;
  };
  const toInt = s => Number(String(s).replace(/[^0-9]/g, '')) || 0;
  const PRICE = /(?:\$|CLP)\s?\d{1,3}(?:[.,]\d{3})*/g;
  const isPrice = t => /^(?:\$|CLP)\s?\d{1,3}(?:[.,]\d{3})*$/.test(t.trim());
  const isBadge = t => /^(popular|nuevo|promo|oferta|más vendido|#\d.*|\d+\s?%.*|-?\d+%.*|.*kcal.*|•|·)$/i.test(t.trim());

  try {
    if (!/ubereats\.com$/.test(location.hostname) || !/\/store\//.test(location.pathname)) {
      toast('Abre primero la página de un local en ubereats.com', '#c0392b');
      return;
    }

    // 1) scroll until the page stops growing (max ~60 s)
    toast('Cargando el menú completo… (no cierres la pestaña)');
    const start = Date.now();
    let stable = 0, lastH = 0;
    while (Date.now() - start < 60000 && stable < 4) {
      window.scrollBy(0, Math.max(400, window.innerHeight * 0.8));
      await sleep(350);
      const h = document.documentElement.scrollHeight;
      const atBottom = window.scrollY + window.innerHeight >= h - 10;
      stable = atBottom && h === lastH ? stable + 1 : 0;
      lastH = h;
    }
    await sleep(800);

    // 2a) schema.org menu (JSON-LD)
    const items = new Map();
    let store = '';
    const walk = (o, section) => {
      if (Array.isArray(o)) return o.forEach(x => walk(x, section));
      if (!o || typeof o !== 'object') return;
      if (/Restaurant|FoodEstablishment|Store/.test(String(o['@type'])) && o.name && !store) store = o.name;
      if (o['@type'] === 'MenuSection') section = o.name;
      if (o['@type'] === 'MenuItem' && o.name) {
        const price = [].concat(o.offers || []).map(x => Number(x.price)).find(x => x > 0) || 0;
        if (!items.has(o.name)) items.set(o.name, { name: o.name, full: Math.round(price), offer: 0, section: section || '' });
      }
      for (const v of Object.values(o)) walk(v, section);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try { walk(JSON.parse(s.textContent)); } catch (e) { /* ignore */ }
    });

    // 2b) rendered item cards: name + one or two prices
    let cardEls = [...document.querySelectorAll('[data-testid^="store-item"]')];
    if (!cardEls.length) cardEls = [...document.querySelectorAll('li')].filter(li => new RegExp(PRICE.source).test(li.textContent || '') && !li.querySelector('li'));
    let cards = 0, discounts = 0;
    cardEls.forEach(card => {
      const lines = [];
      const tw = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) { const t = tw.currentNode.textContent.trim(); if (t) lines.push(t); }
      const prices = ((card.textContent || '').match(PRICE) || []).map(toInt).filter(n => n > 0);
      if (!prices.length) return;
      cards++;
      const name = lines.find(l => items.has(l)) || lines.find(l => !isPrice(l) && !isBadge(l));
      if (!name) return;
      const hi = Math.max(...prices), lo = Math.min(...prices);
      const it = items.get(name) || { name, full: hi, offer: 0, section: '' };
      if (lo < hi) { it.full = hi; it.offer = lo; discounts++; } else if (!it.full) it.full = hi;
      items.set(name, it);
    });

    if (!items.size) {
      toast('No encontré productos en esta página.\n¿Es la página de un local de Uber Eats?', '#c0392b');
      return;
    }
    if (!store) store = (document.querySelector('h1')?.textContent || '').trim();
    if (!store) store = document.title.replace(/\s*[|_-]\s*Uber Eats.*$/i, '').replace(/^Pide\s+/i, '').trim();

    // 3) download
    const data = {
      source: 'ubereats-bookmarklet', version: 1, savedAt: new Date().toISOString(),
      store, url: location.href.split('?')[0], cardsSeen: cards, discounts, items: [...items.values()],
    };
    const slug = store.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'menu';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'ubereats_' + slug + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`✔ Guardado: ${store}\n${items.size} productos, ${discounts} con descuento\n(ubereats_${slug}.json en Descargas)`, '#27ae60');
  } catch (e) {
    toast('Error: ' + e.message, '#c0392b');
  } finally {
    window.__ueMenuBusy = false;
  }
})();
