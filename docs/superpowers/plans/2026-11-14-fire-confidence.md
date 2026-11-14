# Fire-Confidence Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-hotspot fire-confidence score, class and reasons from a ladder of cheap→expensive independent-evidence levels, plus an event table and a jury report.

**Architecture:** Stdlib-first Python batch in `harmonize/confidence/`. It reads the raw FIRMS archive CSVs, clusters hotspots into fire events and runs levels L0–L9; each level returns `{key: (signal, reason)}`. A scorer combines them. Network levels go through cached source clients (Planetary Computer, EFFIS, Earthdata).

**Tech Stack:** Python 3.12/3.14, stdlib `unittest`, numpy, rasterio, pyproj, h5py.

**Spec:** `docs/superpowers/specs/2026-11-14-fire-confidence-design.md`

## Global Constraints

- No Python 3.13+ features. Pinned deps in `harmonize/requirements.txt`: `numpy==2.5.4`, `rasterio==1.5.2`, `pyproj==3.8.0`, `h5py==3.16.0`.
- Run as scripts with a `sys.path` insert (ingest pattern). There is no `harmonize/__init__.py` (it would conflict with the parallel harmonize branch).
  - Tests: `python3 -m unittest discover -s harmonize/confidence/tests -t harmonize`.
- Only `records.py` knows MODIS vs VIIRS column differences. Levels never branch on `sensor` to pick a field.
- Detection key = `(satellite, acq_date, acq_time(4 digits), latitude_text, longitude_text)`.
- Signal ∈ {+1, 0, −1}. Missing data → 0 with reason `n/a:<why>`. Absence of evidence never yields −1.
- Weights (in `config.py`): L0 5, L1 40, L2 10, L3 15, L4 10 refute / 5 support, L5 15, L6 25, L7 10, L8 25.
  - `score = clamp(50 + Σ w·s, 0, 100)`.
  - Classes: `confirmed` ≥80, `likely` 60–79, `unverified` 40–59, `doubtful` <40, plus `non_fire:*` overrides (spec §5).
- Secrets only from env (`EARTHDATA_TOKEN`). Cache under `<data-dir>/cache/confidence/`. Outputs under `<data-dir>/processed/`.
- Commits: Conventional Commits, scope `harmonize`, **no AI trailers**. Never commit `data/`.

## Review Focus

1. **Empty / missing raw files for a year:** the run continues, and the report shows the year as missing. *Task 1 test.*
2. **VIIRS `acq_time` like `0120` and MODIS like `105`** both normalize to 4 digits, so keys match the DB loader. *Task 1 test.*
3. **A service down (EFFIS reset, PC 5xx)** gives that level `n/a:service` for all rows, not a crash. *Tasks 6 and 8 tests.*
4. **Hotspot on a year/month boundary** (Dec 30 for MCD64A1 ±16 days, events spanning New Year): adjacent months/years are consulted. *Tasks 2 and 7 tests.*
5. **A non-fire class never lowers the score through "no data"**: a point with only n/a levels scores exactly 50, `unverified`. *Task 3 test.*

---

### Task 1: Records, config, CLI skeleton

**Files:**
- Create: `harmonize/confidence/{__init__.py,config.py,records.py,run.py}`
- Create: `harmonize/requirements.txt`
- Test: `harmonize/confidence/tests/{__init__.py,test_records.py}`

**Interfaces — Produces:**
- `records.Hotspot` (frozen dataclass). Fields:
  - identity: `key: tuple[str,str,str,str,str]`, `sensor: str` ('MODIS'|'VIIRS'), `platform: str` ('terra'|'aqua'|'snpp'|'noaa20'|'noaa21');
  - position and time: `lat: float`, `lon: float`, `date: datetime.date`, `hhmm: str`, `ts: datetime` (UTC);
  - product fields: `conf_level: str` ('high'|'nominal'|'low'), `frp: float|None`, `type: int|None`, `daynight: str`, `scan: float|None`, `track: float|None`.
- `records.load(data_dir: Path, years: list[int]|None) -> tuple[list[Hotspot], dict[str, list[int]]]`: returns hotspots plus `{'missing': [...years...]}` per sensor.
- `config.py` constants: `WEIGHTS`, `CLASS_THRESHOLDS`, `VOLCANOES` (name, lat, lon, radius_km), `ITALY_BBOX=(6.76,35.49,18.52,46.90)`.

- [ ] Step 1: tests:
  - `test_modis_row_maps` (conf 85→'high', 25→'low', 50→'nominal'; `acq_time` '105'→'0105');
  - `test_viirs_row_maps` ('h'/'n'/'l'; `bright_ti4` ignored; platform 'snpp');
  - `test_key_uses_raw_text` (lat text '41.4350' preserved);
  - `test_missing_year_reported`.
- [ ] Step 2: run, expect ImportError.
- [ ] Step 3: implement `records.py`, `config.py`. `run.py` has an argparse skeleton with subcommands `run`, `report`, `load-db`, and args `--data-dir`, `--years`, `--levels`, `--report-year 2008`.
- [ ] Step 4: tests pass. Then: `python3 -I -c` smoke: load 2008 MODIS from real data and print the count, which must equal `wc -l` − 1.
- [ ] Step 5: commit `feat(harmonize): confidence records and config`.

### Task 2: Fire events

**Files:** Create `harmonize/confidence/events.py`. Test: `tests/test_events.py`.

**Interfaces — Produces:**
- `events.cluster(hotspots: list[Hotspot], max_km=2.0, max_days=1) -> dict[key, str]`: maps key → event_id `"{family}-{yyyymmdd}-{n}"`, where family is 'MODIS' or 'VIIRS'.
- `events.summarize(hotspots, event_of) -> dict[str, Event]`. Event fields: `id, family, start, end, n, frp_sum, lat, lon, bbox, platforms:set[str], members:list[key]`.

Approach: grid hash (0.02°) per date, then union-find over neighbours in date d−1..d+1 within haversine `max_km`, separately per family.

- [ ] Step 1: tests:
  - `test_two_close_same_day_join`;
  - `test_far_points_split` (3 km apart → 2 events);
  - `test_chain_across_days` (day 1 → day 2 → day 3 → one event);
  - `test_new_year_boundary_joins` (Dec 31 + Jan 1);
  - `test_sensor_families_separate`.
- [ ] Steps 2–4: fail → implement → pass.
- [ ] Step 5: commit `feat(harmonize): cluster hotspots into fire events`.

### Task 3: L0, L1, L2 and the scorer

**Files:**
- Create: `levels/{__init__.py,l0_product.py,l1_nonfire.py,l2_consistency.py}`, `score.py`
- Test: `tests/test_levels_cheap.py`, `tests/test_score.py`

**Interfaces:**
- `Ctx` (dataclass in `levels/__init__.py`):
  - `hotspots: list[Hotspot]`, `by_key: dict`, `event_of: dict[key,str]`, `events: dict[str,Event]`;
  - `cache_dir: Path`, `years: list[int]`, `all_hotspots_for_masks: list[Hotspot]`.
- Each level module: `NAME='L0'` … and `run(ctx) -> dict[key, tuple[int,str]]`.
- `l1_nonfire` also exposes `build_static_mask(hotspots, sensor, min_days=16, min_years=3) -> set[tuple[int,int]]` (0.01° cells as `(floor(lat*100), floor(lon*100))`). A hotspot is static if any cell in its 3×3 neighbourhood is in the S-NPP mask or the MODIS mask. Reason codes: `static`, `volcano:<name>`, `offshore`, `volcano:type1`.
- `VOLCANOES` (builder call, spec §11): only volcanoes thermally active in the satellite era: Etna (37.748, 14.999, 7 km) and Stromboli (38.789, 15.213, 2 km). Coordinates are verified against GVP. Product `type=1` anywhere → volcano.
  - Reason: Vesuvius, Colli Albani etc. host real vegetation fires (e.g. Vesuvius July 2017).
- `score.combine(signals: dict[str, dict[key,(int,str)]], weights) -> dict[key, Result]`. `Result` fields: `score:int, cls:str, reasons:str, signals:dict[str,int]`.

Steps:
- [ ] Step 1: tests:
  - `test_l0_levels` (high→+1, low→−1, nominal→0);
  - `test_l1_static_mask_needs_3_years` (2 years → not static);
  - `test_l1_volcano_radius`;
  - `test_l1_offshore_type3`;
  - `test_l2_isolated_is_zero`;
  - `test_l2_three_hotspots_supports`;
  - `test_l2_terra_and_aqua_supports`;
  - `test_score_all_na_is_50_unverified`;
  - `test_score_nonfire_class_override` (L1 −1 → `non_fire:static`, score 10);
  - `test_score_clamped`.
- [ ] Steps 2–4: fail → implement → pass.
- [ ] Step 5: commit `feat(harmonize): L0-L2 levels and confidence scorer`.

### Task 4: Outputs, report, end-to-end run (no network)

**Files:**
- Create: `output.py` (CSV writers), `report.py`; wire `run.py`
- Test: `tests/test_output.py`

**Interfaces:**
- `output.write_hotspots(path, hotspots, results, event_of, extra_cols: dict[key,dict])`. Columns:
  - key: `satellite,acq_date,acq_time,latitude,longitude`;
  - context: `sensor,event_id`;
  - levels: `l0..l8`;
  - result: `score,class,reasons,worldview_url`.
- `output.write_events(path, events, event_signals)`.
- `report.build(hotspots, results, events, level_coverage, report_year) -> (md:str, data:dict)`. `data` keys:
  - `levels`: per level `{evaluated, na, support, refute}`;
  - `monthly`: `{month: {total, confirmed, likely, unverified, doubtful, non_fire}}` for `report_year`;
  - `classes`: histogram;
  - `top_events`: up to 15, by Σ FRP.

Steps:
- [ ] Step 1: tests:
  - `test_csv_header_and_roundtrip`;
  - `test_report_counts_match_results`;
  - `test_report_lists_na_levels`.
- [ ] Steps 2–4: fail → implement → pass.
- [ ] Step 5: real run `python3 harmonize/confidence/run.py run --data-dir <main>/data --years all --levels L0-L2`. Check:
  - Taranto cell 40.5N 17.2E is mostly `non_fire:static`;
  - Etna summit is `non_fire:volcano`.
- [ ] Step 6: commit `feat(harmonize): confidence CSV outputs and jury report`.

### Task 5: L3 cross-sensor and L9 Worldview

**Files:** Create `levels/l3_cross_sensor.py`, `levels/l9_worldview.py`. Test: `tests/test_l3_l9.py`.

**Interfaces:**
- L3 `run(ctx)`: +1 if the other family has a detection ≤1.5 km and |Δts| ≤12 h. 0 with `n/a:no-viirs-era` before 2012-01-20.
- L9 `url(h: Hotspot) -> str`. Params:
  - `v=lon−0.25,lat−0.25,lon+0.25,lat+0.25`;
  - `l=MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth(hidden),MOPITT_CO_Daily_Total_Column_Day(hidden),{P}_CorrectedReflectance_Bands721,{P}_CorrectedReflectance_TrueColor(hidden)`, where `P`=`MODIS_Terra` for terra, else `MODIS_Aqua`;
  - `t=YYYY-MM-DD-T00:00:00Z`;
  - `l1` = same layers, `t1` = date−10 d;
  - `ca=true&cm=swipe`.
  - L9 contributes no signal; `run` returns `{}`, and the URL is used by `output`.

Steps:
- [ ] Step 1: tests:
  - `test_l3_match_within_12h`;
  - `test_l3_no_match_13h`;
  - `test_l3_pre_viirs_na`;
  - `test_l9_url_params` (parse with `urllib.parse`; assert `t`, `t1`, `ca`, layer list for terra and aqua).
- [ ] Steps 2–4, then commit `feat(harmonize): L3 VIIRS cross-check and Worldview links`.

### Task 6: Planetary Computer client + L4 land cover

**Files:**
- Create: `sources/{__init__.py,http.py,pc.py}`, `levels/l4_landcover.py`
- Test: `tests/test_pc_l4.py`

**Interfaces:**
- `http.get(url, *, headers=None, retries=4, timeout=60) -> bytes`: exponential backoff; raises `SourceDown` after the retries.
- `pc.search(collection, bbox, datetime_range) -> list[dict]` (STAC items).
- `pc.sign(href) -> str`: SAS token from `https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}`, cached until expiry.
- L4: per year (clamped 1992–2020), read the `esa-cci-lc` `lccs_class` window over `ITALY_BBOX` once. Cache `cache/confidence/L4/lc_{year}.npz` (array + transform). Sample each hotspot.
  - 190 → `urban` (−1);
  - 200–202 → `bare` (−1);
  - 210 → `water` (−1);
  - 220 → `snow` (−1);
  - 10–180 → `veg:<code>` (+1);
  - 0 or nodata → 0.
- `SourceDown` → whole level `n/a:service`.

Steps:
- [ ] Step 1: tests:
  - `test_sign_caches_token` (mock `http.get`);
  - `test_l4_classes_from_tiny_raster` (write a 4×4 GeoTIFF with rasterio into a temp dir and point the cache at it);
  - `test_l4_service_down_is_na`.
- [ ] Steps 2–4. Real check: L4 for 2008 (one download, then cached).
- [ ] Step 5: commit `feat(harmonize): L4 land cover via Planetary Computer`.

### Task 7: L5 MCD64A1 burn scar

**Files:** Create `levels/l5_mcd64.py`. Test: `tests/test_l5.py`.

**Interfaces:**
- Per (tile, month): fetch `modis-64A1-061` items over `ITALY_BBOX` and read `Burn_Date`.
  - Store sparse burned pixels `cache/confidence/L5/{tile}_{yyyymm}.npz` (rows, cols, doy) plus transform and CRS.
  - Map lon/lat → sinusoidal with pyproj and the item's CRS. Support if any pixel in 3×3 has a burn date within detection ±16 days.
  - Months consulted = the months covering date−16 … date+16. Converting doy to a date uses the composite's year.
  - Reasons: `scar:mcd64(partial)`, or `n/a:pre-2000-11`.

Steps:
- [ ] Step 1: tests:
  - `test_l5_hit_within_16_days`;
  - `test_l5_miss_20_days`;
  - `test_l5_dec30_uses_january` (synthetic sparse caches);
  - `test_l5_neighbour_pixel_counts`.
- [ ] Steps 2–4. Real check for 2008 and for Montiferru 2021.
- [ ] Step 5: commit `feat(harmonize): L5 MCD64A1 burned-area check`.

### Task 8: EFFIS client + L6

**Files:** Create `sources/effis.py`, `levels/l6_effis.py`. Test: `tests/test_effis_l6.py` + fixture `tests/fixtures/effis_small.xml` (2 polygons).

**Interfaces:**
- `effis.fetch_polygons(bbox, cache_dir) -> list[Poly]`. `Poly` fields: `id, firedate: date, finaldate: date, area_ha: float, ring: list[(lat,lon)], bbox`.
  - Queries WFS `typename=ms:modis.ba.poly` over 1°×1° tiles of `ITALY_BBOX` (lat,lon axis order), with `maxfeatures=10000`.
  - Caches `cache/confidence/L6/tile_{lat}_{lon}.json`.
- L6: +1 `effis:<id>:<area_ha>ha` if the point is inside the ring or within 1 km of it, and `firedate−2 ≤ date ≤ finaldate+2`. Before 2016 → `n/a:effis-2016+`.

Steps:
- [ ] Step 1: tests:
  - `test_parse_gml_fixture`;
  - `test_point_inside_and_date_window`;
  - `test_point_1km_outside_counts`;
  - `test_date_outside_window`;
  - `test_pre_2016_na`;
  - `test_wfs_down_is_na`.
- [ ] Steps 2–4. Real check: Montiferru polygon (13,278 ha) supports the 2021-07-24..29 hotspots.
- [ ] Step 5: commit `feat(harmonize): L6 EFFIS burned-area polygons`.

### Task 9: DB table, loader, contract section

**Files:**
- Create: `harmonize/confidence/sql/hotspot_confidence.sql`, `harmonize/confidence/load_db.py`
- Modify: `docs/contracts.md` (append section `[1b]`)
- Test: `tests/test_load_db.py`

**Interfaces:**
- Table `hotspot_confidence`:
  - key columns: `satellite TEXT, acq_date DATE, acq_time SMALLINT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION`;
  - context: `sensor TEXT, event_id TEXT`;
  - levels: `l0..l8 SMALLINT`;
  - result: `score SMALLINT, class TEXT, reasons TEXT, worldview_url TEXT`;
  - `PRIMARY KEY (satellite, acq_date, acq_time, latitude, longitude)`.
- `load_db.py` uses the psql approach of `ingest/load_hotspots.py` (`HOTSPOTS_PSQL` env, default compose `db` container): staging table + upsert.

Steps:
- [ ] Step 1: tests:
  - `test_sql_script_has_upsert`;
  - `test_rows_to_copy_format` (pure functions; no DB).
- [ ] Steps 2–4. Contract text: columns, the "proposal — owners of [2]/[3] decide" note, and the suggested API fields.
- [ ] Step 5: commit `feat(harmonize): hotspot_confidence table, loader and contract proposal`.

### Task 10: Earthdata client + L7 smoke/CO (blocked until `EARTHDATA_TOKEN`)

**Files:** Create `sources/earthdata.py`, `levels/l7_smoke_co.py`. Test: `tests/test_l7.py`.

**Interfaces:**
- `earthdata.get(url) -> bytes` with `Authorization: Bearer $EARTHDATA_TOKEN`. Cache by URL.
  - Missing token → `SourceDown('no-token')`, so L7 is `n/a:no-token`.
- L7 runs on events with Σ FRP ≥ 500 MW or n ≥ 10, in `L7_YEARS = [2007, 2008, 2017, 2021]` ∪ `--years`. For each event day, read the event's 1° cell from:
  - MOPITT `MOP03J` daily (day+night total column);
  - OMI `OMAERUVd` UVAI (2004-10+).
- Baseline = the same cell over days −15..+15 excluding the event days. Support if value > median + 2·MAD.
  - CO reason `co:+<z>`; UVAI support also requires UVAI > 1, reason `uvai:<v>`. The event signal propagates to its hotspots.
- Exact product versions and file names: verify against the ASDC / GES DISC listings with the token and write them into `config.py`.

Steps:
- [ ] Step 1: tests:
  - `test_anomaly_rule` (synthetic series);
  - `test_no_token_is_na`;
  - `test_small_event_skipped`.
- [ ] Steps 2–4. Then commit `feat(harmonize): L7 smoke and CO anomaly level`.

### Task 11: L8 Landsat dNBR for top events

**Files:** Create `levels/l8_landsat.py`. Test: `tests/test_l8.py`.

**Interfaces:**
- For the top `L8_TOP_N=30` events by Σ FRP per year in `L7_YEARS`:
  - search PC `landsat-c2-l2` over the event bbox for a pre scene (≤60 d before start) and a post scene (≤60 d after end), cloud cover <40%;
  - read `nir08`, `swir22`, `qa_pixel` windows, with SR = DN·0.0000275 − 0.2;
  - mask QA bits 0, 1, 3, 4. NBR = (NIR−SWIR2)/(NIR+SWIR2).
- dNBR = mean over valid pixels within 500 m of the event hotspots of (NBR_pre − NBR_post).
  - Support if ≥ 0.10, reason `dnbr:<v>`.
  - No scene pair → `n/a:no-clear-scene`.

Steps:
- [ ] Step 1: tests:
  - `test_nbr_math`;
  - `test_qa_mask_bits`;
  - `test_threshold` (synthetic arrays; the scene-search function is mocked).
- [ ] Steps 2–4. Real check on Montiferru 2021.
- [ ] Step 5: commit `feat(harmonize): L8 Landsat dNBR for large events`.

### Task 12: Full run, acceptance, hand-off

- [ ] Run all levels, then regenerate the report for 2008. Check the acceptance list in spec §8.
- [ ] Copy the headline numbers into the chat digest. Push branch `harmonize/fire-confidence` (rename the worktree branch). Open the PR only if the user asks.
