"""Read raw FIRMS archive CSVs into canonical Hotspot records.

This is the only module that knows how MODIS and VIIRS rows differ. Everything above it is sensor-neutral.
"""

import csv
import datetime as dt
from dataclasses import dataclass
from pathlib import Path

from confidence import config

PLATFORMS = {"terra": "terra", "t": "terra", "aqua": "aqua", "a": "aqua",
             "n": "snpp", "n20": "noaa20", "n21": "noaa21"}
VIIRS_CONF = {"h": "high", "n": "nominal", "l": "low"}


@dataclass(frozen=True)
class Hotspot:
    key: tuple          # (satellite, acq_date, acq_time HHMM, latitude text, longitude text)
    sensor: str         # 'MODIS' | 'VIIRS'
    platform: str       # 'terra' | 'aqua' | 'snpp' | 'noaa20' | 'noaa21'
    lat: float
    lon: float
    date: dt.date
    hhmm: str
    ts: dt.datetime     # UTC
    conf_level: str     # 'high' | 'nominal' | 'low'
    frp: float | None
    type: int | None
    daynight: str
    scan: float | None
    track: float | None


def _float(s):
    s = (s or "").strip()
    return float(s) if s else None


def _conf_level(raw):
    raw = (raw or "").strip().lower()
    if raw in VIIRS_CONF:
        return VIIRS_CONF[raw]
    value = int(float(raw))
    if value >= config.MODIS_CONF_HIGH:
        return "high"
    if value < config.MODIS_CONF_LOW:
        return "low"
    return "nominal"


def _row(r):
    hhmm = r["acq_time"].strip().zfill(4)
    date = dt.date.fromisoformat(r["acq_date"].strip())
    sensor = "VIIRS" if r["instrument"].strip().upper() == "VIIRS" else "MODIS"
    type_raw = (r.get("type") or "").strip()
    return Hotspot(
        key=(r["satellite"].strip(), r["acq_date"].strip(), hhmm, r["latitude"].strip(), r["longitude"].strip()),
        sensor=sensor,
        platform=PLATFORMS[r["satellite"].strip().lower()],
        lat=float(r["latitude"]),
        lon=float(r["longitude"]),
        date=date,
        hhmm=hhmm,
        ts=dt.datetime(date.year, date.month, date.day, int(hhmm[:2]), int(hhmm[2:]), tzinfo=dt.timezone.utc),
        conf_level=_conf_level(r["confidence"]),
        frp=_float(r.get("frp")),
        type=int(type_raw) if type_raw else None,
        daynight=(r.get("daynight") or "").strip(),
        scan=_float(r.get("scan")),
        track=_float(r.get("track")),
    )


def raw_dir(data_dir):
    return Path(data_dir) / "raw" / "firms_archive"


def _available_years(data_dir, sensor, country):
    prefix = config.RAW_FILE_PREFIX[sensor] + "_"
    years = []
    for p in raw_dir(data_dir).glob(f"{prefix}*_{country}.csv"):
        year = p.name[len(prefix):len(prefix) + 4]
        if year.isdigit():
            years.append(int(year))
    return sorted(years)


def _inside(h, clip):
    w, s, e, n = clip
    return w <= h.lon <= e and s <= h.lat <= n


def load(data_dir, years=None, country="Italy"):
    """Return (hotspots, missing) where missing = {sensor: [years expected but without a file]}.

    years=None loads every file present. Countries listed in config.COUNTRY_CLIP keep only points inside that box
    (e.g. metropolitan France, without overseas territories).
    """
    clip = config.COUNTRY_CLIP.get(country)
    hotspots, missing = [], {}
    for sensor, (first, last) in config.SENSOR_YEARS.items():
        wanted = _available_years(data_dir, sensor, country) if years is None else list(years)
        missing[sensor] = []
        for year in wanted:
            path = raw_dir(data_dir) / f"{config.RAW_FILE_PREFIX[sensor]}_{year}_{country}.csv"
            if not path.exists():
                if first <= year <= last:
                    missing[sensor].append(year)
                continue
            with path.open(newline="") as f:
                rows = (_row(r) for r in csv.DictReader(f))
                hotspots.extend(h for h in rows if clip is None or _inside(h, clip))
    return hotspots, missing


def bbox(hotspots, pad=0.1):
    """(w, s, e, n) of the points, padded by `pad` degrees and rounded to 4 decimals."""
    lats, lons = [h.lat for h in hotspots], [h.lon for h in hotspots]
    return tuple(round(v, 4) for v in (min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad))
