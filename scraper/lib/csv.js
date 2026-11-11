'use strict';
// Minimal RFC4180 CSV parser/serializer that round-trips the original file
// byte-for-byte (we verify this before writing anything).

function parse(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  const trailingNewline = /\r?\n$/.test(text);
  if (!trailingNewline || field !== '' || row.length) { row.push(field); rows.push(row); }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { rows, eol, trailingNewline };
}

function quote(f) {
  return /[",\r\n]/.test(f) ? '"' + f.replace(/"/g, '""') + '"' : f;
}

function serialize({ rows, eol, trailingNewline }) {
  return rows.map(r => r.map(quote).join(',')).join(eol) + (trailingNewline ? eol : '');
}

module.exports = { parse, serialize };
