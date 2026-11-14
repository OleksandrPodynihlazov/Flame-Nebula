# Flame Nebula

Harmonized MODIS + VIIRS burning-activity calendar (NASA Space Apps 2026).

## Raw data sources: quick usage

### 1. FIRMS yearly country archive (primary source, no key needed)

**Request**

```
GET https://firms.modaps.eosdis.nasa.gov/data/country/zips/{sensor}_{year}_all_countries.zip
```

| Parameter | Values |
|---|---|
| `sensor` | `modis` (2000-2025), `viirs-snpp` (2012-2025) |
| `year` | 4-digit year. 2026 returns 404. |

No API key and no login. The server supports HTTP `Range` (responds `206`), so a single file can be extracted from the zip without downloading all of it.

**Response**

`200` with a ZIP (`modis_2001_all_countries.zip` is about 31 MB) containing one CSV per country (199 files):

```
modis/2001/modis_2001_Italy.csv
```

Country names are English with underscores (e.g. `Bosnia_and_Herzegovina`).

Italy 2001 has **3,257 rows**. Comma-separated, header included:

```
latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type
37.9843,14.1981,302.6,1.2,1.1,2001-01-07,1024,Terra,MODIS,53,6.2,289.9,6.8,D,0
```

Things to watch:

- `acq_time` is a zero-padded string (`0127`), not a number.
- `confidence` is 0-100 for MODIS, but `l` / `n` / `h` for VIIRS.
- `type`: `0` vegetation fire, `1` volcano, `2` static land source, `3` offshore.
- MODIS and VIIRS have different brightness columns (`brightness`/`bright_t31` vs `bright_ti4`/`bright_ti5`).

### 2. FIRMS REST API (for recent data)

**Request**

```
GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{DAY_RANGE}/{YYYY-MM-DD}
```

Example (Italy bounding box):

```
.../api/area/csv/YOUR_KEY/MODIS_SP/6.76,35.49,18.52,46.90/5/2001-07-01
```

| Parameter | Notes |
|---|---|
| `MAP_KEY` | Free, requested by email on the FIRMS API page |
| `SOURCE` | `MODIS_NRT`, `MODIS_SP`, `VIIRS_SNPP_NRT`, `VIIRS_SNPP_SP`. `SP` = standard quality, `NRT` = near real-time |
| area | Bounding box, order is **west,south,east,north** |
| `DAY_RANGE` | 1 to 5 (maximum is 5) |
| date | Optional. Omit it to get the most recent days. |

**Response:** CSV for `[date .. date + DAY_RANGE - 1]`.

Limits and caveats:

- 5000 transactions per 10 minutes; larger requests count as several.
- A bounding box is a rectangle, so the response includes neighbouring countries and sea. A polygon filter is needed for the exact Italy outline.
- NRT data has no `type` field.

**Check available dates**

```
GET https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{MAP_KEY}/ALL
```

Returns the columns `data_id,min_date,max_date`.

### Not yet verified

The yearly archive (source 1) was downloaded and inspected. The REST API (source 2) has **not** been called yet because no `MAP_KEY` was available, so its exact response columns and error format are unconfirmed. Check this once the key is issued.

## Sources

- FIRMS Area API: <https://firms.modaps.eosdis.nasa.gov/api/area/>
- FIRMS Data Availability API: <https://firms.modaps.eosdis.nasa.gov/api/data_availability/>
- FIRMS Archive Download: <https://firms.modaps.eosdis.nasa.gov/download/>
