# Planilla-Cacho price processor

Fills prices into a **copy** of the sheet: `Planilla-Cacho - Sheet2 - precios.csv`.
The original CSV is never modified. In the copy, only **empty** price cells are filled:

| Platform  | Full | Offer | Source |
|-----------|------|-------|--------|
| Uber Eats | O    | P     | menu pages you save from your browser (see below) |
| PedidosYa | R    | S     | menu pages you save from your browser (see below) |
| Rappi     | U    | V     | rappi.cl public store pages, fetched automatically |

Offer is `$0` when the dish has no discount (same as the existing rows).

## Run

```bash
./start.sh          # runs in the background (survives closing the terminal)
./status.sh         # counts + last log lines
./stop.sh           # stop; ./start.sh again resumes where it left off
```

Options (pass to `./start.sh` or `node scraper/run.js`):

- `--only rappi` / `--only pedidosya` / `--only ubereats`: one platform only
- `--restaurant "<col A value>"`: only that restaurant (repeatable)
- `--retry`: retry Rappi restaurants already processed
- `--dry-run`: don't write the output file

## PedidosYa: saving menus

PedidosYa blocks automated access, so the processor reads menus you save while browsing.

**Bookmark button (fastest).** One time: open `pedidosya-bookmarklet.html` in Chrome and drag the
**📥 Guardar menú PedidosYa** button to the bookmarks bar. Then for each restaurant:

1. Open the restaurant's menu on pedidosya.cl (any Santiago address).
2. Click the bookmark. The page scrolls itself to the bottom (~10 s) and a green "✔ Guardado" appears.
   The file `pedidosya_<store>.json` goes to your Downloads folder.
3. When you're done with all of them, run `./start.sh --only pedidosya` (takes seconds).

The processor reads `pedidosya_*.json` from `~/Downloads` (or `~/Descargas`) and from anywhere in this folder.
Bookmarklet source: `scraper/bookmarklet/source.js`; rebuild the page with `node scraper/bookmarklet/build.js`.

**Or Ctrl+S.** Scroll to the bottom of the menu, press Ctrl+S, and save anywhere inside this folder
(e.g. `pedidosya_pages/`).

A saved page is matched to a restaurant by its store name (e.g. "Barra Chalaca - Costanera Center" → `milsabores_barrachalaca`).
If a match is wrong or missing, set it in `scraper/stores.json`:

```json
"milsabores_mila": { "search": "mila", "pedidosya_files": ["pedidosya_pages/Mila - Providencia ... PedidosYa.html"] }
```

## Uber Eats: saving menus

Uber Eats also blocks automated access, so it works the same way as PedidosYa. `pedidosya-bookmarklet.html` has a
second button, **📥 Guardar menú Uber Eats**. Drag it to the bookmarks bar, open each store page on ubereats.com
(e.g. `https://www.ubereats.com/cl/store/...`), and click it. It saves `ubereats_<store>.json` to Downloads.
Then run `./start.sh --only ubereats`. A page saved with Ctrl+S anywhere in this folder also works.

Pages are matched by store name. To pin a file, use `"ubereats_files": ["..."]` in `scraper/stores.json`.
Bookmarklet source: `scraper/bookmarklet/ubereats.js`.

## Windows / any PC: `actualizar-precios.html`

To update Uber Eats and PedidosYa prices on a PC without Node or this project, copy two files to that PC:
`actualizar-precios.html` and `pedidosya-bookmarklet.html`. Then:

1. Save menus with the bookmark buttons. The files go to Downloads.
2. Double-click `actualizar-precios.html` (Chrome or Edge).
3. Click **Abrir planilla** to pick the CSV, then **Elegir carpeta Descargas** (or drag the files onto the page).
4. Review the matches, then click **Guardar en la planilla**. This writes into the same CSV; the browser asks for
   permission the first time. **Descargar copia** downloads the updated CSV instead.

It uses the same matching code as `run.js` and the same rule: only empty price cells are filled. It works with
CSVs saved by Excel (`;` separator, Windows encoding). Rappi can't be done there, because the browser can't
download Rappi menus. The page is built from `scraper/webapp/` and the `scraper/lib/` files, so rebuild it after
changing those or `scraper/stores.json`: `node scraper/webapp/build.js`.

## Review / fix

- `scraper/logs/not_found.csv`: dishes that couldn't be matched confidently, with the closest menu item and its score. These cells are left blank rather than guessed.
- `scraper/stores.json`: per restaurant, the `search` term and the Rappi store(s) used (`rappi` = your URLs, `rappi_resolved` = found by search). To fix a wrong store, put the correct `https://www.rappi.cl/restaurantes/<id>-...` URL in `rappi`, then run `./start.sh --retry --restaurant "<name>"`.
- `scraper/logs/run.log`: full log, including every dish→menu item match.
# planilla-uber
