# Challenge

Source: <https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/?tab=details>
Title: **Harmonization of MODIS and VIIRS Hot Spots** (Earth Science, Software).

## The problem in one line

Satellites have mapped fire hotspots for 20+ years, but the record is split between MODIS (2000–, ending) and VIIRS (2012–, its replacement). The two cannot be compared directly, so fire managers lack one consistent history.

## What the challenge asks

1. **Harmonize** MODIS and VIIRS hotspots so "the sensor of origin no longer matters" and patterns, trends, and anomalies become the focus.
2. **Web app** that takes harmonized hotspots as input. A user selects a **region** and a **date range**, then downloads **analytics and visualizations**.
3. **Burning activity calendar**: hotspot counts from the early 2000s to the present. It answers: which months see more fires, which years had more burning, how the current month compares with the historical median.

Suggested, not required:

- Color ramps (accessible) to show differences in hotspot counts across months.
- Downloadable CSV of the hotspots found by a search.
- Interactive map: draw the area of interest, or enter latitude/longitude.
- Key indices: anomalies against multi-year averages, number of fires detected.
- Audience: early warning and emergency responders, scientists, land managers, firefighters.

Official data resource: [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms). Details in `data-sources.md`.

## Our scope — MoSCoW

MVP = Italy · 2008 · MODIS only. This skips harmonization on purpose to get a working app first. The challenge's core is harmonization, so the **Should** list brings it back.

### Must

1. One region: Italy.
2. One-year timeline: 2008.
3. MODIS data.
4. Fire type shown by color (gradient / color ramp).
5. Statistics: number of hotspots.

### Should

1. Location picker: point (lat, lon) + radius, OR polygon (array of points) drawn on a map.
2. Clustering of hotspots on the map.
3. Burning calendar (month × day or year × month heatmap).
4. Add VIIRS and harmonize with MODIS (method TBD — see `contracts.md`).

### Could

1. Sensor of origin no longer matters (full harmonization, multi-year).
2. CSV download with active filters applied.
3. Download of visualizations (format TBD: PNG / GeoJSON / JSON).
4. Key indices: anomalies vs multi-year average, fires detected per period.
5. Day / Night filter (`daynight` column).

### Open format question

Shapefiles (`.shp/.shx/.dbf`) are heavy to generate. Current plan: **GeoJSON** (opens in QGIS/ArcGIS) + **CSV** (raw points) + **PNG/JSON** (calendar summary). Confirm with a mentor.
