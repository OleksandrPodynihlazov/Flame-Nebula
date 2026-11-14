"""Tunable constants for the fire-confidence ladder (spec: docs/superpowers/specs/2026-11-14-fire-confidence-design.md)."""

# Italy, w,s,e,n (research/04).
ITALY_BBOX = (6.76, 35.49, 18.52, 46.90)

# Years each sensor archive is expected to exist (a missing file inside the range is reported as missing).
SENSOR_YEARS = {"MODIS": (2000, 2025), "VIIRS": (2012, 2025)}
RAW_FILE_PREFIX = {"MODIS": "modis", "VIIRS": "viirs-snpp"}

# Score = clamp(50 + sum(weight * signal), 0, 100). L4 has separate refute/support weights.
BASE_SCORE = 50
WEIGHTS = {
    "L0": 5,
    "L1": 40,
    "L2": 10,
    "L3": 15,
    "L4": {"refute": 10, "support": 5},
    "L5": 15,
    "L6": 25,
    "L7": 10,
    "L8": 25,
}
LEVEL_ORDER = ("L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8")
CLASS_THRESHOLDS = (("confirmed", 80), ("likely", 60), ("unverified", 40), ("doubtful", 0))

# L0: MODIS confidence 0-100 -> level.
MODIS_CONF_HIGH = 80
MODIS_CONF_LOW = 30

# L1: only volcanoes with thermal activity in the satellite era. Vesuvius, Colli Albani etc. host real
# vegetation fires (e.g. Vesuvius, July 2017), so they are NOT listed. Coordinates: Smithsonian GVP
# (https://volcano.si.edu/), summit. Radius in km.
VOLCANOES = (
    ("Etna", 37.748, 14.999, 7.0),
    ("Stromboli", 38.789, 15.213, 2.0),
)
STATIC_MIN_DAYS = 16   # detection days in one calendar year (MOD14 type=2 rule, research/03 §3)
STATIC_MIN_YEARS = 3   # separate years (decision D3/I6)

# L2: events.
EVENT_MAX_KM = 2.0
EVENT_MAX_DAYS = 1
L2_MIN_HOTSPOTS = 3
L2_MIN_DAYS = 2

# L3: cross-sensor match.
L3_MAX_KM = 1.5
L3_MAX_HOURS = 12
VIIRS_START = "2012-01-20"

# L7/L8: expensive levels run on these years by default (MVP 2008 + record/demo years).
L7_YEARS = (2007, 2008, 2017, 2021)
L7_MIN_FRP_SUM = 500.0
L7_MIN_HOTSPOTS = 10
L8_TOP_N = 30
