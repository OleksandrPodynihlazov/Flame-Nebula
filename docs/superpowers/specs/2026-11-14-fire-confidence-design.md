# Fire-confidence ladder — design

Date: 2026-11-14 · Owner: harmonization (Alex) · Status: **draft, awaiting approval**
Background research: `research/08-fire-confirmation.md` (local, not in git; sources and verification notes live there).

## 1. Intent

Mentors told the team that a FIRMS hotspot is a thermal anomaly, not proof of fire. We need
**independent evidence** that each hotspot was a real landscape fire, and not industry, a volcano, a gas flare or a
false alarm. The evidence must reach two audiences:
- **the jury**: a validation report ("X% of 2008 hotspots independently confirmed, by level");
- **app users**: a per-hotspot confidence score, class and reasons that the API and UI can show and filter on.

The user asked for **levels ordered from cheap to expensive, each moving the confidence**, and wants every level
that genuinely adds confidence to be built. An Earthdata login will be provided (env var), so automated
smoke/CO evidence is in scope.

## 2. Goals, non-goals, anti-goals

Goals
- Per-hotspot `score` (0–100) + `class` + per-level signals and reason codes, for **all hotspots on disk**
  (MODIS 2000-11→2025, VIIRS S-NPP 2012→2025, Italy, ~474k rows). Expensive levels are allowed to cover a subset
  (e.g. 2008 first, or large events only). Coverage is reported explicitly.
- Per-event table (hotspots grouped into fire events) holding the event-level evidence.
- Pitch report (Markdown + JSON): per-level coverage and effect, monthly confirmed share for 2008, top events with evidence.
- A Worldview before/after link per hotspot for human checking.
- Each level is independently runnable, cached, and switchable off.

Non-goals
- Changing Vlad's `hotspots` table, the loader, the API or the frontend. We publish an **additive** table and a
  contract proposal; the owners wire it in.
- Changing hotspot counts or harmonization factors. Confidence is metadata, never a filter applied by default.
- ML models, SEVIRI (needs another account), TROPOMI (2018+ only; possible later extension of L7).

Anti-goals (fail even if it "works")
- **Absence of evidence lowers the score.** Only explicit contrary evidence may lower it (non-fire land cover,
  persistence, volcano, offshore). Clouds, small fires and missing data must leave the score neutral.
- **Circular evidence**: anything derived from MODIS active fire (MOD14A1, GIBS Thermal Anomalies, GFAS, GFED) must
  not count as confirmation. MCD64A1 counts as *partial* (weight reduced, labelled).
- Branching on `sensor` to choose fields above the level that reads raw CSVs (repo rule).
- Calling EFFIS/GIBS live from the browser in the demo.

## 3. Constraints

- Python 3.12 in Docker, 3.14 on the dev machine; no 3.13+ features. Pinned deps in `harmonize/requirements.txt`
  (CLAUDE.md). `numpy`, `rasterio`, `pyproj`, `h5py` have cp312 and cp314 manylinux wheels (checked).
- Raw input: `data/raw/firms_archive/{modis,viirs-snpp}_{year}_Italy.csv` (archive format, 15 columns).
  `data/` is gitignored. The CLI takes `--data-dir` because the worktree has no `data/`.
- Detection key = `(satellite, acq_date, acq_time, latitude, longitude)`, the same key the loader's unique index
  uses, so the DB join is exact.
- External services: Planetary Computer (no key; SAS token endpoint), EFFIS WFS (no key; connection resets ~50%,
  retry), NASA Earthdata (token via `EARTHDATA_TOKEN`, never in git), GIBS/Worldview (URL only).
- Another session is editing `harmonize/` in the main checkout. This work lives in `harmonize/confidence/` on its
  own branch and worktree, and touches no existing file except `harmonize/requirements.txt` (create or append)
  and `docs/contracts.md` (new section).
- Team conventions: Conventional Commits with scope `harmonize`; branch `harmonize/fire-confidence`;
  no AI attribution in commits/PRs (CLAUDE.md overrides).
- Deadline: pitch Sun 11:30. Levels ship in order; every level boundary is a usable state.

## 4. Approaches considered

1. **Events first, then evidence (chosen by the user).** Group hotspots into fire events. Cheap levels run per
   hotspot; expensive levels (rasters, Landsat, CO) run once per event and propagate to its hotspots. Python batch in
   `harmonize/confidence/`, outputs CSV + table + report, downloads cached.
2. Every level per hotspot. Simpler code, but 4–5× more expensive lookups, and smoke, CO and scars are event-scale
   phenomena anyway.
3. SQL in Postgres. Fast for the cheap levels, but it splits the logic, lives in Vlad's `db/`, needs the DB for every
   run, and rasters still need Python.

## 5. The ladder

Each level emits, per hotspot, `signal ∈ {+1 support, 0 no info, −1 refute}` and a reason code. A level that cannot
run for a row (era, service down, not in subset) emits 0 with reason `n/a:<why>`.

| L | Name | Unit | Evidence | Signal | Weight | Era |
|---|---|---|---|---|---|---|
| L0 | product fields | hotspot | MODIS confidence (≥80 high, <30 low); VIIRS `h`/`l`; FRP | +1 high / −1 low conf. | 5 | all |
| L1 | known non-fire | hotspot | (a) volcano: within radius of a GVP Holocene volcano in Italy (per-volcano radius, Etna larger), or product `type=1`; (b) static source: 0.01° cell persistent ≥16 detection-days/year in ≥3 separate years in S-NPP (research/03 §3, decision I6) — MODIS-derived persistence as a second mask for pre-2012-only cells; (c) offshore: product `type=3` | −1 + sets `non_fire_class` | 40 | all |
| L2 | self-consistency | event | event = connected hotspots within 2 km and ±1 day (single sensor family). Support if event has ≥3 hotspots **or** spans ≥2 days **or** both Terra and Aqua (or ≥2 VIIRS overpasses) saw it | +1 / 0 (isolated single detection is 0, not −1) | 10 | all |
| L3 | independent thermal sensor | hotspot | MODIS hotspot with a VIIRS detection within 1.5 km and ±12 h, or the reverse | +1 / 0 | 15 | 2012+ |
| L4 | land cover | hotspot | ESA CCI LC (300 m, year-matched, clamped to 1992–2020) at the point: urban 190, bare 200–202, water 210, snow 220 → −1; tree/shrub/grass/crop/mosaic → +1 | ±1 | 10 refute / 5 support | all |
| L5 | MODIS burn scar (partial) | hotspot window | MCD64A1 `Burn_Date` within ±1 pixel (~1.5 km) and ±16 days of the detection | +1 / 0 | 15 (labelled partial) | 2000-11+ |
| L6 | EU burned-area map | hotspot | EFFIS `modis.ba.poly` polygon containing the point (1 km buffer) with `FIREDATE−2d ≤ date ≤ FINALDATE+2d` | +1 / 0 | 25 | 2016+ |
| L7 | smoke & CO | event-day | MOPITT L3 daily CO total column (1°) at the event cell above its ±15-day baseline (median + k·MAD, k=2); OMI UV aerosol index L3 daily (1°) > 1 and above baseline (2004-10+). Run only for events above a size threshold (default Σ FRP ≥ 500 MW or ≥10 hotspots) | +1 / 0 | 10 | 2000–2024 (CO), 2004+ (UVAI) |
| L8 | 30 m burn scar | event | Landsat C2 L2 (PC): least-cloudy scene ≤60 d before start and ≤60 d after end; mean dNBR around the event's hotspots ≥ 0.10, using the QA mask; TM/ETM+ NIR=B4, SWIR2=B7; OLI NIR=B5, SWIR2=B7. Top-N events per year (default 30) | +1 / 0 | 25 | all (L7 SLC-off gaps after 2003-05-31) |
| L9 | human check | hotspot | Worldview permalink: `v` = bbox ±0.25°, `l`/`l1` = Bands721 + TrueColor (Terra or Aqua by satellite) + MAIAC AOD + MOPITT CO, `t` = date, `t1` = date−10 d, `ca=true&cm=swipe` | none (link only) | — | all |

**Score:** `score = clamp(50 + Σ weight·signal, 0, 100)`. Default with no evidence = 50.
**Class**, in order:
1. `non_fire:<volcano|static|offshore|urban>` if L1 refutes, or L4 says urban/water **and** nothing in L3/L5/L6/L8 supports;
2. otherwise `confirmed` ≥ 80, `likely` 60–79, `unverified` 40–59, `doubtful` < 40.

Weights live in one config module, so they can be tuned without touching the levels.

## 6. Outputs and contracts

Files (`data/processed/`, gitignored):
- `hotspot_confidence.csv`: key columns, `sensor`, `event_id`, `l0`…`l8` signals, `reasons` (`;`-joined codes),
  `score`, `class`, `worldview_url`.
- `fire_events.csv`: `event_id`, sensor family, start/end date, `n_hotspots`, Σ FRP, centroid, bbox, event-level
  signals (L2, L5 share, L7, L8 dNBR value).
- `confidence_report.md` + `confidence_report.json`: per-level coverage (rows evaluated / n/a) and effect
  (supports / refutes); monthly confirmed share for the selected year; class histogram; top events with evidence.

DB (proposal for Vlad, DDL shipped in `harmonize/confidence/sql/hotspot_confidence.sql`, not in `db/init/`):
table `hotspot_confidence` keyed by the detection key, plus a loader script mirroring `ingest/load_hotspots.py`
(psql, idempotent).

`docs/contracts.md`: new section **[1b] harmonize/confidence → hotspot_confidence.csv / table**, marked
"proposal — owners of [2] and [3] decide adoption", with a suggested API extension (`confidence_score`,
`confidence_class`, `reasons` in GeoJSON properties; optional `min_confidence` filter). Tag Vlad, Sasha, Sanya.

## 7. Code layout

```
harmonize/confidence/
  __main__.py      CLI: run --data-dir D --years 2008[,..] --levels L0-L6 [--refresh LEVEL]; report; load-db
  config.py        weights, thresholds, radii, volcano list, paths
  records.py       read raw CSVs → canonical rows (only place that knows MODIS vs VIIRS columns)
  events.py        event clustering (grid hash, union-find)
  levels/l0_product.py … l9_worldview.py   one module per level, common interface
  sources/         thin clients with on-disk cache + retry: pc.py (STAC + SAS), effis.py, earthdata.py
  score.py         combine signals → score, class
  report.py        md + json report
  sql/hotspot_confidence.sql, load_db.py
  tests/           offline unit tests per level with synthetic data and mocked HTTP
```

Level interface: `run(ctx) -> dict[key, (signal, reason)]` (event levels map through `event_id`). `ctx` holds
records, events, config and the cache dir (`data/cache/confidence/<level>/`).

## 8. Testing and acceptance

- Unit tests per level, offline (synthetic hotspots, recorded small fixtures for EFFIS GML / STAC JSON / tiny COG).
- Golden counts: MODIS Italy 2008 row count read = number of data rows in `modis_2008_Italy.csv` (contract example
  says 6,689; the test asserts against the file, not the constant).
- Acceptance on real data:
  - Taranto steel-plant cell (≈40.5N 17.2E) → majority `non_fire:static`.
  - Etna summit hotspots → `non_fire:volcano`.
  - Montiferru 2021-07-24…29 (≈40.2N 8.55E) → L6 EFFIS support; L5 support expected.
  - 2008 report generated; every level shows its coverage, even when 0 (e.g. L6 for 2008 = n/a).

## 9. Delivery order (each line is a usable stop)

1. Scaffold + records + L0 + L1 + L2 + score + CSV + report (no network).
2. L3 (VIIRS cross-check) + L9 (Worldview URLs).
3. L4 land cover + L5 MCD64A1 (Planetary Computer).
4. L6 EFFIS.
5. Contract section + SQL + DB loader.
6. L7 smoke/CO (Earthdata token required; blocked until provided).
7. L8 Landsat dNBR for top events.

## 10. Calls made during review (designer's calls, not user decisions)

- **Year coverage:** L0–L6 run on **all years on disk**. L7 and L8 default to **2008 (MVP) + 2007, 2017, 2021**
  (record/demo years). `--years` extends them. Reason: MOPITT/OMI daily files and Landsat scenes cost minutes each.
- **Static mask is always built from all S-NPP years present**, whatever `--years` says, because it is spatial (cached).
- **L0 VIIRS:** `h` → +1, `n` → 0, `l` → −1. Low product confidence counts as weak *contrary* evidence (weight 5),
  not as absence.
- **L4 water** maps to class `non_fire:offshore`; L4 urban maps to `non_fire:urban` only when no independent support exists.
- **Join key** keeps `latitude`/`longitude` as the raw text and `acq_time` as 4 digits, so CSV↔DB joins parse the same text.
- **Not decided here (harmonization follow-up for the user):** whether the calendar's burning-activity counts should
  exclude `non_fire:*` (research D3/D5 suggest excluding volcanoes and static sources). This design only produces the data.

## 11. Left to the builder

- Exact clustering distance tweaks (scan/track-aware), cache formats, retry policy, page size for EFFIS WFS.
- MOPITT and OMI exact product versions and file naming (verify against ASDC / GES DISC listings).
- Per-volcano radii (start: Etna 12 km, others 4 km; list from Smithsonian GVP for Italy).
- Pinned versions that have wheels for both cp312 and cp314.
