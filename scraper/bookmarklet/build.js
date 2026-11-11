#!/usr/bin/env node
'use strict';
// Builds pedidosya-bookmarklet.html (install page) from source.js (PedidosYa)
// and ubereats.js (Uber Eats).
const fs = require('fs');
const path = require('path');

const bookmarklet = file => 'javascript:' + encodeURIComponent(fs.readFileSync(path.join(__dirname, file), 'utf8')
  .split('\n')
  .filter(l => !/^\s*\/\//.test(l))      // drop whole-line comments
  .map(l => l.trim())
  .filter(Boolean)
  .join('\n'));
const href = bookmarklet('source.js');
const hrefUber = bookmarklet('ubereats.js');
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guardar menús</title>
<style>
  :root { --bg:#fafafa; --fg:#1d1d1f; --muted:#666; --card:#fff; --line:#e3e3e3; --accent:#ea004b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#161618; --fg:#f2f2f2; --muted:#a0a0a0; --card:#202024; --line:#333; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.55 system-ui, sans-serif; }
  main { max-width:680px; margin:0 auto; padding:32px 16px 48px; }
  h1 { font-size:1.6rem; margin:0 0 4px; }
  p.sub { color:var(--muted); margin:0 0 28px; }
  .drag { text-align:center; padding:28px 16px; border:2px dashed var(--line); border-radius:14px; background:var(--card); margin-bottom:28px; }
  .drag a { display:inline-block; margin:6px; padding:12px 22px; border-radius:999px; background:var(--accent); color:#fff;
            font-weight:600; text-decoration:none; cursor:grab; }
  .drag small { display:block; margin-top:12px; color:var(--muted); }
  ol { padding-left:22px; } li { margin-bottom:10px; }
  code { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:1px 6px; font-size:.9em; }
  .note { color:var(--muted); font-size:.92rem; border-top:1px solid var(--line); padding-top:16px; margin-top:28px; }
</style>
</head>
<body>
<main>
  <h1>Guardar menús</h1>
  <p class="sub">Botones para la planilla de precios: guardan el menú del restaurante que tienes abierto.</p>

  <div class="drag">
    <a href="${esc(href)}" onclick="alert('Arrastra este botón a tu barra de marcadores (no hagas clic aquí).'); return false;">📥 Guardar menú PedidosYa</a>
    <a href="${esc(hrefUber)}" style="background:#06c167" onclick="alert('Arrastra este botón a tu barra de marcadores (no hagas clic aquí).'); return false;">📥 Guardar menú Uber Eats</a>
    <small>Arrastra cada botón a la barra de marcadores de Chrome (Ctrl+Shift+B si no la ves).</small>
  </div>

  <h2>Uso (PedidosYa)</h2>
  <ol>
    <li>En <b>pedidosya.cl</b>, con una dirección de Santiago, abre el menú del restaurante.</li>
    <li>Haz clic en <b>📥 Guardar menú PedidosYa</b> en la barra de marcadores.</li>
    <li>Espera ~10 segundos: la página baja sola hasta el final y aparece un aviso verde
        <i>“✔ Guardado”</i>. El archivo <code>pedidosya_&lt;restaurante&gt;.json</code> queda en Descargas.</li>
    <li>Repite con los demás restaurantes.</li>
    <li>Al final, en la carpeta del proyecto: <code>./start.sh --only pedidosya</code></li>
  </ol>

  <h2>Uso (Uber Eats)</h2>
  <ol>
    <li>En <b>ubereats.com</b>, con una dirección de Santiago, abre la página del local.</li>
    <li>Haz clic en <b>📥 Guardar menú Uber Eats</b> en la barra de marcadores.</li>
    <li>Espera el aviso verde <i>“✔ Guardado”</i>. El archivo <code>ubereats_&lt;local&gt;.json</code> queda en Descargas.</li>
    <li>Al final: <code>./start.sh --only ubereats</code></li>
  </ol>

  <p class="note">Los botones solo leen la página que tienes abierta y descarga un archivo a tu computador.
  No envía datos a ningún lado ni abre otras páginas.</p>
</main>
</body>
</html>
`;
const out = path.resolve(__dirname, '..', '..', 'pedidosya-bookmarklet.html');
fs.writeFileSync(out, html);
console.log('wrote', out, `(bookmarklets ${href.length} + ${hrefUber.length} chars)`);
