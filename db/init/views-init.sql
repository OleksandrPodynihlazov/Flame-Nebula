-- Fire confidence next to every hotspot (docs/contracts.md [1b], [3]). Does not touch `hotspots`.
-- File name sorts after hotspots-init.sql and regions-init.sql: Postgres runs init scripts in name order,
-- and the view needs the `hotspots` table.
-- Idempotent: also safe to apply by hand on an existing DB (init scripts only run on an empty volume):
--   docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/init/views-init.sql

-- Same DDL as harmonize/confidence/sql/hotspot_confidence.sql (load_db.py applies that one if the table is
-- missing). Keep the two identical.
CREATE TABLE IF NOT EXISTS hotspot_confidence (
  satellite     TEXT NOT NULL,
  acq_date      DATE NOT NULL,
  acq_time      SMALLINT NOT NULL,          -- HHMM UTC
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  sensor        TEXT NOT NULL,              -- 'MODIS' | 'VIIRS'
  event_id      TEXT,
  l0 SMALLINT, l1 SMALLINT, l2 SMALLINT, l3 SMALLINT, l4 SMALLINT,
  l5 SMALLINT, l6 SMALLINT, l7 SMALLINT, l8 SMALLINT,   -- +1 supports / 0 no info / -1 refutes
  score         SMALLINT NOT NULL,          -- 0..100, 50 = no evidence
  class         TEXT NOT NULL,              -- confirmed | likely | unverified | doubtful | non_fire:<volcano|static|offshore|urban>
  reasons       TEXT,                       -- 'L1:static;L3:xsensor:snpp;...'
  worldview_url TEXT,
  PRIMARY KEY (satellite, acq_date, acq_time, latitude, longitude)
);
CREATE INDEX IF NOT EXISTS hotspot_confidence_class ON hotspot_confidence (class);

-- Every hotspot, with its confidence when scored (NULLs when not). The API reads this view as
-- `hotspots_with_confidence AS hotspots`, so its SQL keeps using the `hotspots.` prefix.
-- Join key = the loader's natural key (unique in both tables), so the join never duplicates a row.
CREATE OR REPLACE VIEW hotspots_with_confidence AS
SELECT h.*,
       c.score         AS confidence_score,
       c.class         AS confidence_class,
       c.reasons       AS confidence_reasons,
       c.worldview_url AS worldview_url
  FROM hotspots h
  LEFT JOIN hotspot_confidence c
    ON  c.satellite = h.satellite
   AND c.acq_date  = h.acq_date
   AND c.acq_time  = h.acq_time
   AND c.latitude  = h.latitude
   AND c.longitude = h.longitude;
