-- Canonical per-hotspot fields (research/02 §C): MODIS and VIIRS reduced to one form, in one place, below the API.
-- Owner: harmonization. Runs after hotspots-init.sql on a fresh DB (files run in alphabetical order);
-- harmonize/canonical.py re-applies this file on an existing DB. `hotspots` itself stays raw (decision I2).
--
--   confidence_level  low | nominal | high for BOTH sensors.
--                     VIIRS: l/n/h as delivered. MODIS: FIRMS classes of the 0-100 number,
--                     low < 30 <= nominal < 80 <= high (MODIS Fire User Guide C6.1, Table 11).
--   confidence_pct    the raw MODIS number 0-100; NULL for VIIRS (it has no percentage).
--   platform          terra | aqua | snpp | noaa20 | noaa21, from every satellite spelling (archive and API).
DROP VIEW IF EXISTS hotspots_canonical;
CREATE VIEW hotspots_canonical AS
SELECT h.*,
       CASE
         WHEN lower(h.confidence) IN ('l', 'low') THEN 'low'
         WHEN lower(h.confidence) IN ('n', 'nominal') THEN 'nominal'
         WHEN lower(h.confidence) IN ('h', 'high') THEN 'high'
         WHEN h.confidence ~ '^[0-9]+$' THEN
           CASE WHEN h.confidence::int >= 80 THEN 'high'
                WHEN h.confidence::int >= 30 THEN 'nominal'
                ELSE 'low' END
       END AS confidence_level,
       CASE WHEN h.confidence ~ '^[0-9]+$' THEN h.confidence::smallint END AS confidence_pct,
       CASE h.satellite
         WHEN 'Terra' THEN 'terra' WHEN 'T' THEN 'terra'
         WHEN 'Aqua' THEN 'aqua' WHEN 'A' THEN 'aqua'
         WHEN 'N' THEN 'snpp' WHEN 'N20' THEN 'noaa20' WHEN 'N21' THEN 'noaa21'
       END AS platform
FROM hotspots h;
