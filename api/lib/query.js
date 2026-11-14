// Shared query params for docs/contracts.md [3]: parse + validate, then build a parameterised WHERE.
// Every user value reaches SQL only as a $n placeholder; nothing is concatenated.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const TYPE_LIST_RE = /^\d{1,3}(,\d{1,3})*$/;
const MAX_POLYGON_VERTICES = 500;

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
  if (pts.length > MAX_POLYGON_VERTICES) {
    throw httpError(`polygon may have at most ${MAX_POLYGON_VERTICES} points`);
  }
  return pts.map((p) => {
    if (!Array.isArray(p) || p.length !== 2) throw httpError("each polygon point must be [lon,lat]");
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw httpError("polygon lon must be between -180 and 180");
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw httpError("polygon lat must be between -90 and 90");
    return [lon, lat];
  });
}

// Returns { from, to, circle, polygon, daynight, types }. Missing params are undefined / null.
// A polygon overrides a circle (the frontend never sends both).
export function parseFilters(query) {
  const f = { from: undefined, to: undefined, circle: null, polygon: null, daynight: null, types: null };

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

  const daynight = single(query, "daynight");
  if (daynight !== undefined) {
    if (daynight !== "D" && daynight !== "N") throw httpError("daynight must be D or N");
    f.daynight = daynight;
  }

  const type = single(query, "type");
  if (type !== undefined) {
    if (!TYPE_LIST_RE.test(type)) throw httpError("type must be a comma list of numbers, e.g. 0,2");
    f.types = type.split(",").map(Number);
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

  if (f.circle) {
    const { lat, lon, radiusKm } = f.circle;
    const dLat = radiusKm / 111.32;
    const latLo = add(lat - dLat);
    const latHi = add(lat + dLat);
    const c = add(lat);
    const d = add(lon);
    const r = add(radiusKm);
    // Bounding box first (cheap, indexed), then exact great-circle distance.
    conds.push(
      `latitude BETWEEN ${latLo} AND ${latHi}` +
        ` AND 2 * 6371 * asin(sqrt(power(sin(radians(latitude - ${c}) / 2), 2)` +
        ` + cos(radians(${c})) * cos(radians(latitude)) * power(sin(radians(longitude - ${d}) / 2), 2))) <= ${r}`
    );
  }

  if (f.polygon) {
    const text = "(" + f.polygon.map(([x, y]) => `(${x},${y})`).join(",") + ")";
    conds.push(`point(longitude, latitude) <@ ${add(text)}::polygon`);
  }

  return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}
