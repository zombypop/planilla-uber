# Planilla-Cacho price processor

Fills delivery-platform prices into `Planilla-Cacho - Sheet2 - precios.csv` (a copy of `Planilla-Cacho - Sheet2.csv`).
For user-facing usage see `README.md`.

## Rules that must not break

- **Never modify `Planilla-Cacho - Sheet2.csv`** (the original).
- In the copy, **only empty price cells are filled**; every other cell stays byte-identical.
  `fill.checkOnlyBlankPricesChanged` enforces this and throws otherwise. `csv.js` must round-trip the file exactly.
- When no dish matches confidently (score < 85), leave the cell blank and log it in `scraper/logs/not_found.csv`; never guess.
- Price format is `$21,990`. Offer is `$0` when there is no discount.

## Sheet layout (0-based column index)

| Platform  | Full    | Offer   | Comment/URL | Source |
|-----------|---------|---------|-------------|--------|
| Uber Eats | O (14)  | P (15)  | Q (16)      | saved menus (`ubereats_*.json`) |
| PedidosYa | R (17)  | S (18)  | T (19)      | saved menus (`pedidosya_*.json` or a Ctrl+S page) |
| Rappi     | U (20)  | V (21)  | W (22)      | fetched automatically from rappi.cl |

Column A (0) holds the restaurant slug and column F (5) the dish. Data starts on line 3.

## Layout

- `scraper/run.js`: the CLI processor (Node). Run it with `./start.sh` (background), `./status.sh` and `./stop.sh`.
  Options: `--only <platform>`, `--restaurant "<col A>"`, `--retry`, `--dry-run`.
  `--dry-run` still writes `stores.json` and appends to `not_found.csv`.
- `scraper/lib/fill.js`: matching and filling **shared by run.js and the browser page**. It must not use Node APIs.
- `scraper/lib/match.js` (fuzzy dish/store matching), `search.js` (search term per restaurant), `csv.js`,
  `rappi.js`, `pedidosya.js`, `ubereats.js` (parsers for saved pages).
- `scraper/stores.json`: per restaurant, the search term, store URLs and optional `<platform>_files` pins.
- `scraper/bookmarklet/`: the "Guardar menú" buttons (`source.js` = PedidosYa, `ubereats.js` = Uber Eats).
  `build.js` writes `pedidosya-bookmarklet.html`.
- `scraper/webapp/`: the source of `actualizar-precios.html`, a no-install page that fills Uber Eats and PedidosYa
  prices in Chrome or Edge on any PC (e.g. Windows). `build.js` inlines `lib/` and `stores.json`.

## Rebuild after changes

- Bookmarklets: `node scraper/bookmarklet/build.js`. Users must drag the buttons to the bookmarks bar again.
- Windows page: `node scraper/webapp/build.js`. Rebuild after changing `scraper/lib/*`, `scraper/stores.json`
  or `scraper/webapp/*`.

## Platform notes

- PedidosYa and Uber Eats block automated access (bot challenge), so don't fetch them from scripts.
  Prices come only from menus the user saves in their own browser.
- Uber Eats cards show per-unit prices like `$5.686/L`. These are not discounts; the bookmarklet drops them.
- Store names on saved menus look like "Brand - Branch" or "Brand (Branch)"; matching uses the brand part.

## Verifying a change

Replay fills from a known CSV with `--dry-run` (or restore logs/state afterwards) and diff the output CSV.
Only the expected O/P, R/S or U/V cells should change. For the page, load it in headless Chrome
(`scraper/node_modules/playwright-core` with `/usr/bin/google-chrome`) and compare the downloaded CSV.
