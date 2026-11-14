// /api/patterns and /api/patterns/summary: recurring fires per 0.1° cell × month (table fire_patterns,
// built by harmonize/patterns.py; docs/contracts.md [1] and [3]). A cell is inside the area when its
// centre is; for a region, when it holds at least one S-NPP hotspot of that region.

import { buildWhere, httpError } from "./query.js";

// Probability at or above this counts as a "likely" cell.
export const LIKELY = 0.5;

export function parseMonth(query) {
  const raw = query.month;
  if (raw === undefined) throw httpError("month is required (1-12)");
  if (typeof raw !== "string" || !/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 12) {
    throw httpError("month must be a whole number from 1 to 12");
  }
  return Number(raw);
}

// Cell centres as `latitude` / `longitude`, so buildWhere's bbox, circle and polygon apply to them.
function source(filters) {
  const area = buildWhere({ bbox: filters.bbox, circle: filters.circle, polygon: filters.polygon });
  const params = [...area.params];
  let regionCond = "";
  if (filters.region) {
    params.push(filters.region);
    regionCond =
      ` AND (p.cell_lat, p.cell_lon) IN (` +
      `SELECT DISTINCT floor(h.latitude * 10)::int, floor(h.longitude * 10)::int FROM hotspots h ` +
      `JOIN hotspot_regions hr ON hr.hotspot_id = h.id ` +
      `WHERE hr.region_id = $${params.length} AND h.satellite = 'N')`;
  }
  const text =
    `(SELECT p.*, (p.cell_lat + 0.5) / 10.0 AS latitude, (p.cell_lon + 0.5) / 10.0 AS longitude ` +
    `FROM fire_patterns p WHERE true${regionCond}) c ${area.where}`;
  return { text, params, hasWhere: area.where !== "" };
}

export function patternsSql(filters, month) {
  const src = source(filters);
  const params = [...src.params, month];
  const text =
    `SELECT round(latitude::numeric, 2)::float8 AS lat, round(longitude::numeric, 2)::float8 AS lon, ` +
    `years_burned, years_observed, round(probability::numeric, 3)::float8 AS probability, ` +
    `median_count::float8 AS median_count ` +
    `FROM ${src.text} ${src.hasWhere ? "AND" : "WHERE"} month = $${params.length} ` +
    `ORDER BY probability DESC, median_count DESC`;
  return { text, values: params };
}

export function summarySql(filters) {
  const src = source(filters);
  const text =
    `SELECT month, COUNT(*)::int AS cells, ` +
    `COUNT(*) FILTER (WHERE probability >= ${LIKELY})::int AS likely, ` +
    `round(COALESCE(MAX(probability), 0)::numeric, 3)::float8 AS max_probability ` +
    `FROM ${src.text} GROUP BY month ORDER BY month`;
  return { text, values: src.params };
}

// All 12 months, zero-filled: fire_patterns is sparse (no row = no fire that month).
export function fillMonths(rows) {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return Array.from({ length: 12 }, (_, i) => {
    const r = byMonth.get(i + 1);
    return { month: i + 1, cells: r?.cells ?? 0, likely: r?.likely ?? 0, max_probability: r?.max_probability ?? 0 };
  });
}
