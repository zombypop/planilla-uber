// actualizar-precios.html: browser app (readable source).
// build.js inlines this together with lib/csv.js, lib/match.js, lib/search.js,
// lib/fill.js and the restaurant search terms from stores.json.
//
// Everything happens on this computer: the page reads the CSV and the saved
// menu files you give it, and writes the CSV back (or downloads a copy).
// It makes no network requests.
/* global STORES, require */
(() => {
  'use strict';
  const csv = require('./csv');
  const fill = require('./fill');
  const { defaultSearch } = require('./search');
  const PLATFORMS = ['ubereats', 'pedidosya'];
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
    return e;
  };
  const canWrite = 'showOpenFilePicker' in window;

  const state = {
    sheet: null,     // { fileName, handle, lastModified, enc, bom, text, parsed }
    menus: new Map(),// key -> menu (one per platform + store + url, newest kept)
    errors: [],      // files that could not be read
    result: null,    // { rows, report, unused, filled }
    savedMsg: '',
  };

  // ---------------------------------------------------------------- files
  const W1252 = (() => { // char -> byte for Windows-1252 (what Excel uses for CSV on Spanish Windows)
    const dec = new TextDecoder('windows-1252'), map = new Map();
    for (let b = 0; b < 256; b++) map.set(dec.decode(new Uint8Array([b])), b);
    return map;
  })();
  function decodeBytes(buf) {
    let bytes = new Uint8Array(buf), bom = false;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) { bom = true; bytes = bytes.subarray(3); }
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), enc: 'utf-8', bom }; }
    catch { return { text: new TextDecoder('windows-1252').decode(bytes), enc: 'windows-1252', bom: false }; }
  }
  function encodeText(text, enc, bom) {
    if (enc === 'windows-1252') return Uint8Array.from([...text], ch => W1252.get(ch) ?? 0x3F);
    const body = new TextEncoder().encode(text);
    if (!bom) return body;
    const out = new Uint8Array(body.length + 3);
    out.set([0xEF, 0xBB, 0xBF]); out.set(body, 3);
    return out;
  }
  function detectDelim(text) {
    const head = text.split(/\r?\n/).slice(0, 2).join('\n');
    return (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
  }

  async function loadCsv(file, handle) {
    const { text, enc, bom } = decodeBytes(await file.arrayBuffer());
    const parsed = csv.parse(text, detectDelim(text));
    if (csv.serialize(parsed) !== text) throw new Error('El archivo CSV tiene un formato que no puedo reescribir sin cambiarlo.');
    const h0 = parsed.rows[0] || [];
    const bad = Object.values(fill.COLUMNS).filter(c => !String(h0[c.full] || '').includes(c.header));
    if (bad.length || parsed.rows.length < 3) {
      throw new Error('Las columnas no coinciden con la planilla (esperaba Uber en O, PedidosYa en R y Rappi en U, con los títulos en las filas 1 y 2).');
    }
    state.sheet = { fileName: file.name, handle: handle || null, lastModified: file.lastModified, enc, bom, text, parsed };
    state.savedMsg = '';
  }

  async function loadMenu(file) {
    let d;
    try { d = JSON.parse(await file.text()); } catch { state.errors.push(`${file.name}: no es un archivo JSON válido`); return; }
    const m = fill.menuFromJson(d, file.name);
    if (!m) { state.errors.push(`${file.name}: no es un menú guardado con los botones`); return; }
    if (!m.items.length) { state.errors.push(`${file.name}: el menú no tiene productos`); return; }
    const key = [m.platform, m.name, m.url].join('|');
    const prev = state.menus.get(key);
    if (!prev || String(m.savedAt || '') >= String(prev.savedAt || '')) state.menus.set(key, m);
  }

  async function addFiles(files) {
    state.errors = [];
    const list = [...files];
    for (const { file, handle } of list) {
      try {
        if (/\.csv$/i.test(file.name)) await loadCsv(file, handle);
        else if (/\.json$/i.test(file.name)) await loadMenu(file);
        else state.errors.push(`${file.name}: no es un CSV ni un menú (.json)`);
      } catch (e) { state.errors.push(`${file.name}: ${e.message}`); }
    }
    try { compute(); } catch (e) { state.result = null; state.errors.push('Error al calcular: ' + e.message); }
    render();
  }

  // ------------------------------------------------------------- compute
  function compute() {
    state.result = null;
    if (!state.sheet) return;
    const orig = state.sheet.parsed.rows;
    const rows = orig.map(r => [...r]);
    const data = fill.dataRows(rows);
    const byRest = new Map();
    for (const x of data) {
      const n = x.r[fill.COL.name];
      if (!byRest.has(n)) byRest.set(n, []);
      byRest.get(n).push(x);
    }
    const stores = {};
    for (const n of byRest.keys()) stores[n] = { ...(STORES[n] || {}), search: STORES[n]?.search || defaultSearch(n) };
    const menus = [...state.menus.values()];
    const used = new Set();
    const report = [];
    for (const [name, rs] of byRest) {
      for (const p of PLATFORMS) {
        const mine = fill.selectMenus(menus.filter(m => m.platform === p), name, stores, p);
        if (!mine.length) continue;
        mine.forEach(m => used.add(m));
        const results = fill.fillRows(rs, mine, p);
        report.push({ name, platform: p, menus: mine, results, total: rs.length });
      }
    }
    fill.checkOnlyBlankPricesChanged(orig, rows);
    const filled = report.reduce((a, x) => a + x.results.filter(y => y.hit).length, 0);
    state.result = { rows, report, unused: menus.filter(m => !used.has(m)), filled };
  }

  // ---------------------------------------------------------------- save
  function outputBytes() {
    const s = state.sheet;
    return encodeText(csv.serialize({ ...s.parsed, rows: state.result.rows }), s.enc, s.bom);
  }

  async function afterSave(text, lastModified) {
    const s = state.sheet;
    s.text = text; s.lastModified = lastModified;
    s.parsed = csv.parse(text, s.parsed.delim);
    compute();
  }

  async function saveInPlace() {
    const s = state.sheet;
    try {
      if ((await s.handle.queryPermission({ mode: 'readwrite' })) !== 'granted' &&
          (await s.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        alert('Sin permiso para modificar el archivo. Usa "Descargar copia".');
        return;
      }
      const current = await s.handle.getFile();
      if (current.lastModified !== s.lastModified &&
          !confirm('El archivo cambió desde que lo abriste (¿lo editaste en Excel?).\n\nSi guardas, esos cambios se pierden. ¿Guardar igual?')) return;
      const filled = state.result.filled;
      const bytes = outputBytes();
      const w = await s.handle.createWritable();
      await w.write(bytes);
      await w.close();
      const text = csv.serialize({ ...s.parsed, rows: state.result.rows });
      await afterSave(text, (await s.handle.getFile()).lastModified);
      state.savedMsg = `✔ Guardado en ${s.fileName}: ${filled} precio${filled === 1 ? '' : 's'} nuevo${filled === 1 ? '' : 's'}.`;
    } catch (e) {
      alert('No se pudo guardar: ' + e.message + '\n\nUsa "Descargar copia".');
    }
    render();
  }

  function download() {
    const a = el('a', { href: URL.createObjectURL(new Blob([outputBytes()], { type: 'text/csv' })), download: state.sheet.fileName });
    document.body.append(a); a.click(); a.remove();
    state.savedMsg = `✔ Descargado: ${state.sheet.fileName} (en Descargas). Reemplaza tu planilla con ese archivo.`;
    render();
  }

  // -------------------------------------------------------------- pickers
  async function pickCsv() {
    if (canWrite) {
      try {
        const [handle] = await window.showOpenFilePicker({ id: 'planilla', types: [{ description: 'Planilla CSV', accept: { 'text/csv': ['.csv'] } }] });
        await addFiles([{ file: await handle.getFile(), handle }]);
      } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
    } else $('#csvInput').click();
  }
  async function pickFolder() {
    try {
      const dir = await window.showDirectoryPicker({ id: 'menus', startIn: 'downloads' });
      const files = [];
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'file' && /^(pedidosya|ubereats)_.*\.json$/i.test(name)) files.push({ file: await h.getFile() });
      }
      if (!files.length) { state.errors = ['Esa carpeta no tiene archivos pedidosya_*.json ni ubereats_*.json']; render(); return; }
      await addFiles(files);
    } catch (e) { if (e.name !== 'AbortError') alert(e.message); }
  }

  // --------------------------------------------------------------- render
  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const badge = p => el('span', { class: 'badge ' + p }, fill.COLUMNS[p].label);

  function render() {
    // 1) planilla
    const s = state.sheet;
    $('#sheetInfo').replaceChildren(s
      ? el('span', {}, el('b', {}, s.fileName), ` · ${fill.dataRows(s.parsed.rows).length} platos`,
        s.handle ? '' : el('span', { class: 'muted' }, ' · se descargará una copia al guardar'))
      : el('span', { class: 'muted' }, 'Ninguna planilla abierta'));
    $('#step1').classList.toggle('done', !!s);

    // 2) menus
    const menus = [...state.menus.values()].sort((a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name));
    $('#menuList').replaceChildren(...(menus.length ? menus.map(m => el('li', {},
      badge(m.platform), ' ', el('b', {}, m.name), el('span', { class: 'muted' },
        ` · ${m.items.length} productos${m.discountsSeen ? ` · ${m.discountsSeen} con descuento` : ''}${m.savedAt ? ` · guardado ${fmtDate(m.savedAt)}` : ''}`)))
      : [el('li', { class: 'muted' }, 'Ningún menú cargado')]));
    $('#step2').classList.toggle('done', menus.length > 0);
    $('#errors').replaceChildren(...state.errors.map(e => el('li', {}, e)));
    $('#errors').hidden = !state.errors.length;

    // 3) result
    const r = state.result;
    const out = $('#result');
    $('#saveMsg').textContent = state.savedMsg;
    $('#saveMsg').hidden = !state.savedMsg;
    if (!r || !menus.length) {
      out.replaceChildren(el('p', { class: 'muted' }, !s ? 'Abre la planilla y agrega menús para ver qué precios se van a llenar.' : 'Agrega menús guardados con los botones.'));
      $('#saveBtn').disabled = $('#downloadBtn').disabled = true;
      return;
    }
    const filled = r.filled;
    const notFound = r.report.reduce((a, x) => a + x.results.filter(y => !y.hit).length, 0);
    const blocks = [];
    blocks.push(el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('strong', {}, filled), el('span', {}, filled === 1 ? 'precio nuevo' : 'precios nuevos')),
      el('div', { class: 'stat' }, el('strong', {}, notFound), el('span', {}, 'no encontrados')),
      el('div', { class: 'stat' }, el('strong', {}, r.report.length), el('span', {}, 'restaurantes con menú'))));
    if (r.unused.length) {
      blocks.push(el('div', { class: 'warn' }, el('b', {}, 'Menús sin restaurante en la planilla: '),
        r.unused.map(m => `${m.name} (${fill.COLUMNS[m.platform].label})`).join(', '),
        '. El nombre del local no se parece a ningún restaurante de la columna A.'));
    }
    if (!r.report.length) blocks.push(el('p', { class: 'muted' }, 'Ningún menú corresponde a un restaurante de la planilla.'));
    for (const x of r.report) {
      const hits = x.results.filter(y => y.hit), miss = x.results.filter(y => !y.hit);
      const P = fill.COLUMNS[x.platform];
      const status = !x.results.length ? 'ya estaba completo' : `${hits.length} de ${x.results.length} llenados`;
      const lines = x.results.map(({ x: row, hit, best }) => hit
        ? el('tr', {}, el('td', { class: 'num' }, row.i + 1), el('td', {}, row.r[fill.COL.dish]),
          el('td', {}, hit.item.name, hit.score < 100 ? el('span', { class: 'approx', title: 'Coincidencia aproximada' }, ` ≈ ${hit.score.toFixed(0)}%`) : ''),
          el('td', { class: 'num' }, row.r[P.full]), el('td', { class: 'num' }, row.r[P.offer]))
        : el('tr', { class: 'miss' }, el('td', { class: 'num' }, row.i + 1), el('td', {}, row.r[fill.COL.dish]),
          el('td', { colspan: 3 }, 'No encontrado', best && best.score >= 50 ? el('span', { class: 'muted' }, ` · lo más parecido: “${best.item.name}” (${best.score.toFixed(0)}%)`) : '')));
      blocks.push(el('details', { class: 'rest' + (miss.length ? ' has-miss' : '') },
        el('summary', {}, badge(x.platform), ' ', el('b', {}, x.name), el('span', { class: 'muted' }, ` · ${x.menus.map(m => m.name).join(' / ')}`),
          el('span', { class: 'count' + (miss.length ? ' partial' : '') }, status)),
        x.results.length ? el('div', { class: 'table-wrap' }, el('table', {},
          el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Fila'), el('th', {}, 'Plato (planilla)'), el('th', {}, 'Producto en el menú'),
            el('th', { class: 'num' }, 'Full'), el('th', { class: 'num' }, 'Offer'))),
          el('tbody', {}, lines))) : el('p', { class: 'muted pad' }, 'Todos los platos ya tenían precio en esta plataforma.')));
    }
    out.replaceChildren(...blocks);
    $('#saveBtn').disabled = !(filled > 0 && s.handle);
    $('#saveBtn').hidden = !s.handle;
    $('#downloadBtn').disabled = !(filled > 0);
  }

  // ---------------------------------------------------------------- wire
  $('#pickCsv').addEventListener('click', pickCsv);
  $('#csvInput').addEventListener('change', e => { addFiles([...e.target.files].map(file => ({ file }))); e.target.value = ''; });
  $('#pickMenus').addEventListener('click', () => $('#menuInput').click());
  $('#menuInput').addEventListener('change', e => { addFiles([...e.target.files].map(file => ({ file }))); e.target.value = ''; });
  if ('showDirectoryPicker' in window) $('#pickFolder').addEventListener('click', pickFolder); else $('#pickFolder').hidden = true;
  $('#saveBtn').addEventListener('click', saveInPlace);
  $('#downloadBtn').addEventListener('click', download);
  $('#clearMenus').addEventListener('click', () => { state.menus.clear(); state.errors = []; compute(); render(); });

  let dragDepth = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    // grab everything synchronously: the drop data is gone after the first await
    const items = [...e.dataTransfer.items].filter(i => i.kind === 'file');
    const plain = items.map(i => i.getAsFile());
    const handles = items.map(i => (i.getAsFileSystemHandle ? i.getAsFileSystemHandle().catch(() => null) : null));
    const files = await Promise.all(items.map(async (_, k) => {
      const handle = await handles[k];
      if (handle && handle.kind === 'file') return { file: await handle.getFile(), handle };
      return plain[k] && { file: plain[k], handle: null };
    }));
    addFiles(files.filter(Boolean));
  });

  render();
})();
