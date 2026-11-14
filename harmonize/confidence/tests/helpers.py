"""Test-only factory for Hotspot records."""

import datetime as dt

from confidence.records import Hotspot


def hs(lat, lon, date="2008-07-24", hhmm="1200", sensor="MODIS", platform=None, conf="nominal",
       frp=10.0, type_=0, scan=1.0, track=1.0):
    d = dt.date.fromisoformat(date)
    platform = platform or ("terra" if sensor == "MODIS" else "snpp")
    sat = {"terra": "Terra", "aqua": "Aqua", "snpp": "N", "noaa20": "N20", "noaa21": "N21"}[platform]
    return Hotspot(
        key=(sat, date, hhmm, f"{lat:.4f}", f"{lon:.4f}"),
        sensor=sensor, platform=platform, lat=lat, lon=lon, date=d, hhmm=hhmm,
        ts=dt.datetime(d.year, d.month, d.day, int(hhmm[:2]), int(hhmm[2:]), tzinfo=dt.timezone.utc),
        conf_level=conf, frp=frp, type=type_, daynight="D", scan=scan, track=track,
    )
