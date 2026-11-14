// Shared query params for docs/contracts.md [3]: parse + validate, then build a parameterised WHERE.
// Every user value reaches SQL only as a $n placeholder; nothing is concatenated.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const TYPE_LIST_RE = /^[0-3](,[0-3])*$/;
const SENSORS = ["MODIS", "VIIRS"];
// 200 points keeps the GET url under nginx's default 8 KB header limit (docs/contracts.md [3]).
export const MAX_POLYGON_VERTICES = 200;
export const ONE_AREA = "Send one area: region, polygon or circle";
const MAX_ID = 2147483647;
// /api/hotspots/grid: cell size in degrees, and the most cells one answer may hold.
export const MIN_CELL = 0.01;
export const MAX_CELL = 10;
export const MAX_GRID_CELLS = 20000;
export const TOO_MANY_CELLS = "Too many cells, zoom in or use a bigger cell";

export function httpError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function single(query, name) {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "") {
    throw httpError(`${name} must be a single non-empty value`);
  }
  return value;
}

function parseNumber(raw, name, min, max) {
  const n = NUMBER_RE.test(raw) ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) {
    throw httpError(`${name} must be a number between ${min} and ${max}`);
  }
  return n;
}

function parseDate(raw, name) {
  if (!DATE_RE.test(raw)) throw httpError(`${name} must be a date as YYYY-MM-DD`);
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw httpError(`${name} is not a real calendar date`);
  }
  return raw;
}

function parsePolygon(raw) {
  let pts;
  try {
    pts = JSON.parse(raw);
  } catch {
    throw httpError("polygon must be JSON: [[lon,lat],[lon,lat],...]");
  }
  if (!Array.isArray(pts) || pts.length < 3) {
    throw httpError("polygon needs at least 3 [lon,lat] points");
  }
  if (pts.length > MAX_POLYGON_VERTICES + 1) { // +1: an optional closing point is not counted
    throw httpError(`polygon may have at most ${MAX_POLYGON_VERTICES} points`);
  }
  const ring = pts.map((p) => {
    if (!Array.isArray(p) || p.length !== 2) throw httpError("each polygon point must be [lon,lat]");
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw httpError("polygon lon must be between -180 and 180");
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw httpError("polygon lat must be between -90 and 90");
    return [lon, lat];
  });
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] === last[0] && first[1] === last[1]) ring.pop();
  if (ring.length < 3) throw httpError("polygon needs at least 3 [lon,lat] points");
  if (ring.length > MAX_POLYGON_VERTICES) throw httpError(`polygon may have at most ${MAX_POLYGON_VERTICES} points`);
  return ring;
}

// bbox=west,south,east,north in degrees. No antimeridian wrap: west must be < east.
function parseBbox(raw) {
  const parts = raw.split(",");
  if (parts.length !== 4) throw httpError("bbox must be 4 numbers: west,south,east,north");
  const west = parseNumber(parts[0], "bbox west", -180, 180);
  const south = parseNumber(parts[1], "bbox south", -90, 90);
  const east = parseNumber(parts[2], "bbox east", -180, 180);
  const north = parseNumber(parts[3], "bbox north", -90, 90);
  if (west >= east) throw httpError("bbox west must be less than east");
  if (south >= north) throw httpError("bbox south must be less than north");
  return { west, south, east, north };
}

// `cell` for /api/hotspots/grid: required there, degrees.
export function parseCell(query) {
  const raw = single(query, "cell");
  if (raw === undefined) throw httpError("cell is required (degrees)");
  return parseNumber(raw, "cell", MIN_CELL, MAX_CELL);
}

// Returns { from, to, circle, polygon, region, bbox, daynight, types, sensors }. Missing params are undefined / null.
// A polygon overrides a circle (the frontend never sends both). A region (id from /api/regions) cannot be
// combined with a polygon or a circle: that is a 400.
export function parseFilters(query) {
  const f = {
    from: undefined, to: undefined, circle: null, polygon: null, region: null, bbox: null, daynight: null, types: null,
    sensors: null,
  };

  const from = single(query, "from");
  const to = single(query, "to");
  if (from !== undefined) f.from = parseDate(from, "from");
  if (to !== undefined) f.to = parseDate(to, "to");
  if (f.from && f.to && f.from > f.to) throw httpError("from must not be after to");

  const latRaw = single(query, "lat");
  const lonRaw = single(query, "lon");
  const radiusRaw = single(query, "radius_km");
  const circleParts = [latRaw, lonRaw, radiusRaw].filter((v) => v !== undefined).length;
  if (circleParts > 0 && circleParts < 3) {
    throw httpError("lat, lon and radius_km must be given together");
  }
  if (circleParts === 3) {
    const radiusKm = parseNumber(radiusRaw, "radius_km", 0, 20040);
    if (radiusKm <= 0) throw httpError("radius_km must be greater than 0");
    f.circle = {
      lat: parseNumber(latRaw, "lat", -90, 90),
      lon: parseNumber(lonRaw, "lon", -180, 180),
      radiusKm,
    };
  }

  const polygonRaw = single(query, "polygon");
  if (polygonRaw !== undefined) {
    f.polygon = parsePolygon(polygonRaw);
    f.circle = null;
  }

  const regionRaw = single(query, "region");
  if (regionRaw !== undefined) {
    if (!/^\d+$/.test(regionRaw) || Number(regionRaw) < 1 || Number(regionRaw) > MAX_ID) {
      throw httpError("region must be a positive integer id (see /api/regions)");
    }
    if (circleParts === 3 || f.polygon) throw httpError(ONE_AREA);
    f.region = Number(regionRaw);
  }

  // The visible map area; combines (AND) with any area above.
  const bboxRaw = single(query, "bbox");
  if (bboxRaw !== undefined) f.bbox = parseBbox(bboxRaw);

  const daynight = single(query, "daynight");
  if (daynight !== undefined) {
    if (daynight !== "D" && daynight !== "N") throw httpError("daynight must be D or N");
    f.daynight = daynight;
  }

  const type = single(query, "type");
  if (type !== undefined) {
    if (!TYPE_LIST_RE.test(type)) throw httpError("type must be a comma list of 0, 1, 2, 3, e.g. 0,2");
    f.types = type.split(",").map(Number);
  }

  // sensor (contract [3]) = instrument column in the DB. The frontend always sends it.
  const sensor = single(query, "sensor");
  if (sensor !== undefined) {
    const sensors = sensor.split(",");
    if (!sensors.every((s) => SENSORS.includes(s))) {
      throw httpError(`sensor must be a comma list of ${SENSORS.join(", ")}`);
    }
    f.sensors = sensors;
  }

  return f;
}

// Builds `WHERE ...` (or '') and its params for the hotspots table. Column names are fixed here.
export function buildWhere(f) {
  const conds = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (f.from) conds.push(`acq_date >= ${add(f.from)}`);
  if (f.to) conds.push(`acq_date <= ${add(f.to)}`);
  if (f.daynight) conds.push(`daynight = ${add(f.daynight)}`);
  if (f.types) conds.push(`type = ANY(${add(f.types)}::smallint[])`);
  if (f.sensors) conds.push(`instrument = ANY(${add(f.sensors)}::text[])`);

  if (f.bbox) {
    // Same shape as the circle's box: uses the (latitude, longitude) index.
    const { west, south, east, north } = f.bbox;
    conds.push(
      `latitude BETWEEN ${add(south)} AND ${add(north)} AND longitude BETWEEN ${add(west)} AND ${add(east)}`
    );
  }

  if (f.circle) {
    const { lat, lon, radiusKm } = f.circle;
    const dLat = radiusKm / 111.32;
    const latLo = add(lat - dLat);
    const latHi = add(lat + dLat);
    const c = add(lat);
    const d = add(lon);
    const r = add(radiusKm);
    // Longitude box too, but only while it stays inside ±180 (no wrap at the antimeridian).
    const dLon = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
    const lonBox =
      lon - dLon >= -180 && lon + dLon <= 180
        ? ` AND longitude BETWEEN ${add(lon - dLon)} AND ${add(lon + dLon)}`
        : "";
    // Bounding box first (cheap, indexed), then exact great-circle distance.
    // LEAST(1, ...) keeps asin() in range when float rounding gives 1.0000000001.
    conds.push(
      `latitude BETWEEN ${latLo} AND ${latHi}${lonBox}` +
        ` AND 2 * 6371 * asin(sqrt(LEAST(1, power(sin(radians(latitude - ${c}) / 2), 2)` +
        ` + cos(radians(${c})) * cos(radians(latitude)) * power(sin(radians(longitude - ${d}) / 2), 2)))) <= ${r}`
    );
  }

  if (f.polygon) {
    const text = "(" + f.polygon.map(([x, y]) => `(${x},${y})`).join(",") + ")";
    conds.push(`point(longitude, latitude) <@ ${add(text)}::polygon`);
  }

  if (f.region) {
    // Assigned once at load time (ingest/load_regions.py): a plain index lookup, no geometry here.
    conds.push(
      `EXISTS (SELECT 1 FROM hotspot_regions hr WHERE hr.hotspot_id = hotspots.id AND hr.region_id = ${add(f.region)})`
    );
  }

  return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

// GET /api/hotspots/grid: one row per non-empty cell of `cell` degrees. lat/lon = average position,
// rounded to 4 decimals (~10 m). type = most common non-NULL type (mode() skips NULLs: FIRMS API rows
// have none), lowest on a tie (mode() keeps the first of equally frequent values in ORDER BY order);
// NULL only when every point in the cell has no type. One row past the cap tells "over" from "at".
export function buildGridQuery(filters, cell) {
  const { where, params } = buildWhere(filters);
  const c = `$${params.length + 1}`;
  const limit = `$${params.length + 2}`;
  return {
    text: `SELECT round(avg(latitude)::numeric, 4)::float8 AS lat,
                  round(avg(longitude)::numeric, 4)::float8 AS lon,
                  COUNT(*) AS count,
                  mode() WITHIN GROUP (ORDER BY type) AS type
             FROM hotspots
             ${where}
            GROUP BY floor(latitude / ${c}::float8), floor(longitude / ${c}::float8)
            LIMIT ${limit}`,
    values: [...params, cell, MAX_GRID_CELLS + 1],
  };
}
