# Oil and gas value chain tracker

Interactive world map of the oil and gas value chain: offshore and onshore fields, pipelines, ports,
chokepoints, LNG export and import plants, floating terminals (FSRUs), refineries, gas-to-power demand
and sea lanes. Every record carries a card with capacity, operator, who supplies it and who it delivers to.

## How it is put together

| Path | What it holds |
| --- | --- |
| `index.html` | Page shell and styles |
| `js/config.js` | Database address and publishable key. Empty values mean "use the bundled snapshot" |
| `js/loader.js` | Loads the data (live database first, snapshot as fallback) and starts the map |
| `js/app.js` | Map logic: filters, chain tracing, cards, country view, timeline |
| `data/snapshot.json` | Full copy of the dataset: assets, routes, links, country balances |
| `data/pipelines.json` | Surveyed pipeline routes (Global Energy Monitor), simplified |
| `data/world.json` | Country outlines (Natural Earth, through world-atlas) |
| `img/satellite.jpg` | Coarse satellite basemap (NASA Blue Marble). Detailed imagery streams from EOX Sentinel-2 cloudless tiles (CC BY 4.0) as you zoom |
| `supabase/migrations/0001_schema.sql` | Database tables and read-only access rules |
| `supabase/seed.sql` | All records as SQL, generated from the snapshot |
| `scripts/build-seed.mjs` | Regenerates the two SQL files from `data/snapshot.json` |
| `scripts/build-single-file.mjs` | Builds one self-contained HTML file for hosts that block outside files |

## What an investor can do with it

- **Totals:** refining and LNG capacity, import points and fields for the current map window or the whole world.
- **Assets:** a sortable list of every record, with a button that copies it as spreadsheet rows.
- **Projects:** capacity starting up by target year, and every project in progress grouped by year.
- **Companies:** gross capacity by operator or partner. Selecting a company highlights its sites.
- **Charters:** floating terminals grouped by when their charter ends.
- **Links:** every record has its own address (`#record-id`), so a view can be shared.

## Database

Five tables, all prefixed `og_` because they share a Supabase project: `og_assets` (points), `og_routes`
(named pipelines and sea lanes), `og_links` (supplied by / delivers to), `og_country_balances` and
`og_category_defaults`. The page reads them with the publishable key. Row level security
allows reading only, so nobody can change data from the website. Add or edit records in the Supabase table
editor and they appear on the next page load.

Adding a record:

1. Add a row to `og_assets` with a unique `id` and `name`, a `category`, `lat`, `lon` and `status`.
2. Add rows to `og_links` with the asset name as `subject`, `direction` `in` (supplied by) or `out` (delivers to),
   and the counterparty. If the counterparty matches another record name exactly, it becomes a live link.
3. Fill `source` and `checked_on` once the record has been verified. The card then shows it as checked.

Codes: status `o` operating, `c` under construction, `p` planned, `x` offline. Categories are listed in the
schema file.

## News, review queue and live vessels

- `og_news` holds dated, sourced headlines per record. A daily scheduled scan adds to it.
- `og_change_proposals` is the review queue. The scan proposes changes; nothing is applied until a
  proposal's `status` is set to `approved`, which updates the record and stamps it as checked.
- `og_vessels` holds the latest position per tanker. The `ais-relay` function in
  `supabase/functions` fills it from aisstream.io and needs an `AISSTREAM_API_KEY` secret.
  Coverage is coastal only.
- Satellite has three modes: a sharp cloud-free composite (2016), the newest passes from the past
  week (about 30 metres), and a daily wide-area image (about 250 metres). The last two come from NASA.

## Running it

It is a static site. Serve the folder with any web server, for example `python3 -m http.server`, or publish
it with GitHub Pages from the `main` branch root.

## Data caveats

- Compiled from public knowledge to mid-2026. Positions are approximate. Most figures are unverified:
  each card states whether its record has been checked and against what.
- Vessels are simulated along real trade lanes. They are not tracked positions.
- Named pipelines and sea lanes are drawn schematically. The full pipeline network layer uses surveyed routes.
- Pipeline routes come from Global Energy Monitor's oil and gas infrastructure trackers. Confirm their
  licence terms before redistributing this data commercially.
