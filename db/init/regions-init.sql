-- Regions (geoBoundaries CGAZ ADM0-2) and the region of every hotspot.
-- Idempotent: ingest/load_regions.py applies it on every run, after `hotspots` exists.
-- Design: docs/superpowers/specs/2026-11-14-region-filter-design.md §2.

CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

CREATE TABLE IF NOT EXISTS regions (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level      SMALLINT NOT NULL,          -- 0 = country, 1, 2 (meaning varies by country)
  country    CHAR(3)  NOT NULL,          -- ISO 3166-1 alpha-3 (shapeGroup)
  name       TEXT     NOT NULL,          -- as in the dataset, local spelling
  name_norm  TEXT     NOT NULL,          -- search key: NFKD, marks dropped, lower-case
  parent_id  INTEGER  REFERENCES regions(id),
  source_id  TEXT     NOT NULL UNIQUE,   -- geoBoundaries shapeID; ADM0: '<ISO3>-ADM0'
  outline    TEXT     NOT NULL           -- simplified GeoJSON geometry, for the map only
);
CREATE INDEX IF NOT EXISTS regions_parent ON regions (parent_id);

CREATE TABLE IF NOT EXISTS hotspot_regions (   -- one row per hotspot per level it has
  region_id  INTEGER NOT NULL REFERENCES regions(id)  ON DELETE CASCADE,
  hotspot_id BIGINT  NOT NULL REFERENCES hotspots(id) ON DELETE CASCADE,
  how        CHAR(1) NOT NULL,                 -- 'i' = inside, 'n' = nearest (coast / sea)
  PRIMARY KEY (region_id, hotspot_id)
);
CREATE INDEX IF NOT EXISTS hotspot_regions_hotspot ON hotspot_regions (hotspot_id);

-- drawn polygons: point(longitude, latitude) <@ polygon
CREATE INDEX IF NOT EXISTS hotspots_point_gist ON hotspots USING gist (point(longitude, latitude));
