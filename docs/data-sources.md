# Data sources

## Where to get the data

**FIRMS yearly country files** — public, no login, one CSV per sensor/year/country.

| File | URL | Size |
|---|---|---|
| MODIS, Italy, 2008 (MVP) | <https://firms.modaps.eosdis.nasa.gov/data/country/modis/2008/modis_2008_Italy.csv> | ~0.5 MB, 6,689 rows |
| VIIRS S-NPP, Italy, `<YEAR>` | `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/<YEAR>/viirs-snpp_<YEAR>_Italy.csv` | — |

Pattern: `/data/country/<sensor>/<year>/<sensor>_<year>_<Country>.csv`. Index page: <https://firms.modaps.eosdis.nasa.gov/country/>.

Fetch into `data/raw/` (gitignored):

```sh
mkdir -p data/raw
curl -fL -o data/raw/modis_2008_Italy.csv \
  https://firms.modaps.eosdis.nasa.gov/data/country/modis/2008/modis_2008_Italy.csv
```

Other sources:

- FIRMS archive download (custom area/dates, needs Earthdata login): <https://firms.modaps.eosdis.nasa.gov/download/>
- FIRMS overview: <https://www.earthdata.nasa.gov/data/tools/firms>
- Attribute docs: <https://www.earthdata.nasa.gov/data/tools/firms/faq>

## Sensors

| | MODIS | VIIRS |
|---|---|---|
| Satellites | Terra (from Nov 2000), Aqua (from Jul 2002) | S-NPP (from Jan 2012), NOAA-20, NOAA-21 |
| Pixel size | ~1 km | ~375 m |
| Status | Near end of life | Replacement |
| Sees | Fewer, larger fires | More, smaller fires (many more points for the same area) |

Overpass times (local solar time): **Terra ~10:30 / 22:30**, **Aqua ~13:30 / 01:30**. Using both catches morning and afternoon fire peaks.

## CSV columns

Same 15 columns in both sensors, except the brightness pair and `confidence`.

| Column | MODIS | VIIRS | Meaning |
|---|---|---|---|
| `latitude`, `longitude` | ✓ | ✓ | Pixel center, WGS84 degrees |
| `brightness` | ✓ | — | Brightness temp, Kelvin (MODIS band 21/22) |
| `bright_ti4` | — | ✓ | Brightness temp, Kelvin (VIIRS I-4) |
| `scan`, `track` | ✓ | ✓ | Real pixel size in km (grows at swath edge) |
| `acq_date` | ✓ | ✓ | `YYYY-MM-DD`, UTC |
| `acq_time` | ✓ | ✓ | `HHMM`, UTC, 4 digits (`0030`) |
| `satellite` | `Terra` / `Aqua` | `N` (S-NPP), `1` (NOAA-20), `2` (NOAA-21) | Platform |
| `instrument` | `MODIS` | `VIIRS` | Sensor |
| `confidence` | integer 0–100 | `l` / `n` / `h` (low/nominal/high) | Detection confidence — **different types** |
| `version` | e.g. `6.2` | e.g. `2` | Product collection |
| `bright_t31` | ✓ | — | Kelvin, band 31 |
| `bright_ti5` | — | ✓ | Kelvin, I-5 |
| `frp` | ✓ | ✓ | Fire Radiative Power, MW — fire intensity |
| `daynight` | ✓ | ✓ | `D` / `N` |
| `type` | ✓ | ✓ | Source class, see below (archive files only) |

### `type` codes

| Code | Meaning | Italy 2008 rows |
|---|---|---|
| `0` | Presumed vegetation fire | 6,473 |
| `1` | Active volcano | 3 |
| `2` | Other static land source (industry, gas flares) | 204 |
| `3` | Offshore | 9 |

Plan: `0` = wildfire/burn; `1–3` = noise. Confirm with a mentor before relying on it.

### Italy 2008 MODIS — quick facts

- Dates: 2008-01-02 → 2008-12-24.
- Aqua: 3,025 day / 327 night. Terra: 2,796 day / 541 night.
