// Shared area filter for every data endpoint (docs/contracts.md [3]).
// One area per request: region | polygon | circle (lat, lon, radius_km).
// SQL fragments assume the hotspots table is aliased `h`.

export class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

export const MAX_POLYGON_VERTICES = 200;
export const ONE_AREA = "Send one area: region, polygon or circle";
const MAX_INT = 2147483647;

const present = (v) => v !== undefined && v !== "";

function parseId(value, name) {
  if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_INT) {
    throw new BadRequest(`${name} must be a positive integer id`);
  }
  return Number(value);
}

function parseNumber(value, name) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) throw new BadRequest(`${name} must be a number`);
  return n;
}

const inRange = (lon, lat) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;

function parsePolygon(value) {
  const shape = "polygon must be a JSON array of [lon, lat] pairs";
  if (typeof value !== "string") throw new BadRequest(shape);
  let ring;
  try {
    ring = JSON.parse(value);
  } catch {
    throw new BadRequest(shape);
  }
  if (!Array.isArray(ring)) throw new BadRequest(shape);
  for (const p of ring) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((x) => typeof x === "number" && Number.isFinite(x))) {
      throw new BadRequest(shape);
    }
    if (!inRange(p[0], p[1])) throw new BadRequest("polygon point out of range: lon -180..180, lat -90..90");
  }
  const last = ring[ring.length - 1];
  if (ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1]) ring = ring.slice(0, -1);
  if (ring.length < 3 || ring.length > MAX_POLYGON_VERTICES) {
    throw new BadRequest(`polygon needs 3 to ${MAX_POLYGON_VERTICES} points`);
  }
  return ring;
}

export function parseArea(query) {
  const kinds = [];
  if (present(query.region)) kinds.push("region");
  if (present(query.polygon)) kinds.push("polygon");
  if (present(query.lat) || present(query.lon) || present(query.radius_km)) kinds.push("circle");
  if (kinds.length > 1) throw new BadRequest(ONE_AREA);
  if (kinds[0] === "region") return { kind: "region", id: parseId(query.region, "region") };
  if (kinds[0] === "polygon") return { kind: "polygon", ring: parsePolygon(query.polygon) };
  if (kinds[0] === "circle") {
    if (!present(query.lat) || !present(query.lon) || !present(query.radius_km)) {
      throw new BadRequest("circle needs lat, lon and radius_km");
    }
    const lat = parseNumber(query.lat, "lat");
    const lon = parseNumber(query.lon, "lon");
    const radiusKm = parseNumber(query.radius_km, "radius_km");
    if (!inRange(lon, lat)) throw new BadRequest("lat must be -90..90 and lon -180..180");
    if (radiusKm <= 0) throw new BadRequest("radius_km must be greater than 0");
    return { kind: "circle", lat, lon, radiusKm };
  }
  return { kind: "none" };
}

// { join, where, params }: put `join` after `FROM hotspots h`, AND `where` into the WHERE clause.
export function areaSql(area, firstParam = 1) {
  const n = firstParam;
  switch (area.kind) {
    case "region":
      return { join: `JOIN hotspot_regions hr ON hr.hotspot_id = h.id AND hr.region_id = $${n}`, where: "", params: [area.id] };
    case "polygon":
      // written exactly like this so the GiST index hotspots_point_gist is used
      return {
        join: "",
        where: `point(h.longitude, h.latitude) <@ $${n}::polygon`,
        params: [`(${area.ring.map(([lon, lat]) => `(${lon},${lat})`).join(",")})`],
      };
    case "circle": {
      const c = `ll_to_earth($${n}, $${n + 1})`;
      const p = "ll_to_earth(h.latitude, h.longitude)";
      return {
        join: "",
        where: `earth_box(${c}, $${n + 2}) @> ${p} AND earth_distance(${c}, ${p}) <= $${n + 2}`,
        params: [area.lat, area.lon, area.radiusKm * 1000],
      };
    }
    default:
      return { join: "", where: "", params: [] };
  }
}

export function isMissingTable(err) {
  return err?.code === "42P01";
}

// An unknown region id is a bad parameter (400), not an empty result.
export async function checkArea(area, db) {
  if (area.kind !== "region") return;
  let rows = [];
  try {
    ({ rows } = await db.query({ text: "SELECT 1 FROM regions WHERE id = $1", values: [area.id] }));
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  if (!rows.length) throw new BadRequest(`unknown region: ${area.id}`);
}
