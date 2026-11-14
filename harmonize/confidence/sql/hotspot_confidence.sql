-- Fire-confidence per hotspot (harmonize/confidence). Proposal for the db owner; additive, does not touch `hotspots`.
-- Join: hotspots (satellite, acq_date, acq_time, latitude, longitude) = hotspot_confidence (same columns).
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
