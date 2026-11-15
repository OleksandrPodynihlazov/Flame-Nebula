-- Must be safe to re-run: deploy applies every file on every deploy (infra/apply-db-schema.sh).
-- Use IF NOT EXISTS / CREATE OR REPLACE and explicit index names; never DROP TABLE, TRUNCATE, DELETE or ALTER ... DROP.

CREATE TABLE IF NOT EXISTS hotspots (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  brightness  REAL,              -- MODIS: brightness, VIIRS: bright_ti4 (Kelvin)
  scan        REAL,
  track       REAL,
  acq_date    DATE NOT NULL,
  acq_time    SMALLINT NOT NULL, -- HHMM in UTC, e.g. 105 = 01:05
  satellite   TEXT NOT NULL,     -- Terra/Aqua, N/N20/N21
  instrument  TEXT NOT NULL,     -- 'MODIS' or 'VIIRS'
  confidence  TEXT,              -- MODIS: '0'-'100', VIIRS: 'l'/'n'/'h'
  version     TEXT,
  frp         DOUBLE PRECISION,              -- MW
  daynight    CHAR(1),           -- 'D' or 'N'
  type        SMALLINT                   -- 0-3; NULL in NRT/API files (they have no type)
);

-- Explicit names = the names Postgres gave the old unnamed indexes, so existing DBs get no duplicates.
CREATE INDEX IF NOT EXISTS hotspots_acq_date_idx ON hotspots (acq_date);
CREATE INDEX IF NOT EXISTS hotspots_instrument_acq_date_idx ON hotspots (instrument, acq_date);
CREATE INDEX IF NOT EXISTS hotspots_latitude_longitude_idx ON hotspots (latitude, longitude);
-- hotspots_natural_key (unique) is created by ingest/load_hotspots.py, hotspots_point_gist by regions-init.sql.
