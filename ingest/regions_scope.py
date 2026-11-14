"""Which countries load_regions.py works on. Stdlib only.

`--countries` takes `all`, or a comma list of ISO 3166-1 alpha-3 codes and/or the preset `europe`:
    europe             the 45 countries below (the default)
    europe,RUS         the preset plus Russia
    ITA,FRA            just these
    all                every country in the boundary files
"""

import re

# Whole countries in Europe, by their code in geoBoundaries CGAZ ADM0. Left out on purpose:
#   RUS TUR KAZ (mostly Asia: Russia alone has millions of Siberian detections), GEO ARM AZE (Caucasus),
#   GRL (Greenland). Add any of them with `--countries europe,RUS`. CGAZ has no separate Faroe, Åland,
#   Gibraltar, Jersey or Isle of Man: they are inside their parent countries.
EUROPE = frozenset("""
ALB AND AUT BEL BGR BIH BLR CHE CYP CZE DEU DNK ESP EST FIN FRA GBR GRC HRV HUN IRL ISL ITA LIE LTU LUX LVA
MCO MDA MKD MLT MNE NLD NOR POL PRT ROU SMR SRB SVK SVN SWE UKR VAT XKX
""".split())

PRESETS = {"europe": EUROPE}


def parse_countries(text: str):
    """None for `all` (no filter), else the set of country codes. ValueError on anything else."""
    parts = [p.strip() for p in text.split(",")]
    if len(parts) == 1 and parts[0].lower() == "all":
        return None
    codes = set()
    for p in parts:
        if p.lower() == "all":
            raise ValueError("`all` cannot be combined with other values")
        if p.lower() in PRESETS:
            codes |= PRESETS[p.lower()]
        elif re.fullmatch(r"[A-Za-z]{3}", p):
            codes.add(p.upper())
        else:
            raise ValueError(f"bad --countries value {p!r}: use `all`, `europe` or 3-letter codes like ITA,FRA")
    return codes
