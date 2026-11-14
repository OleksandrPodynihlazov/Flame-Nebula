import { pool } from "../db.js";
import { buildWhere, httpError } from "../lib/query.js";

// Upper bound on rows per /api/hotspots(.csv) response. Without it a request with no date range
// loads the whole table into memory and the API dies with a heap OOM.
const DEFAULT_MAX_ROWS = 200000;

function parseMaxRows(raw) {
  if (raw === undefined || raw === "") return DEFAULT_MAX_ROWS;
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`HOTSPOTS_MAX_ROWS must be a positive integer, got "${raw}"`);
  }
  return Number(raw);
}

const MAX_ROWS = parseMaxRows(process.env.HOTSPOTS_MAX_ROWS);

// Field names and types follow docs/contracts.md [1] (what the frontend expects),
// not the DB schema [2]: instrument → sensor, acq_time 105 → "0105", confidence '76' → 76.
// brightness, scan, track and version are not part of the contract, so they are not selected.
const SELECT_HOTSPOTS = `
  SELECT id,
         latitude,
         longitude,
         acq_date,
         LPAD(acq_time::text, 4, '0') AS acq_time,
         instrument AS sensor,
         satellite,
         daynight,
         frp,
         CASE WHEN confidence ~ '^[0-9]+$' THEN confidence::int END AS confidence,
         type
    FROM hotspots`;

async function queryHotspots(filters) {
  const { where, params } = buildWhere(filters);
  // Fetch one row past the cap to tell "exactly at the cap" from "over it"; never truncate silently.
  const { rows } = await pool.query(
    `${SELECT_HOTSPOTS} ${where} ORDER BY acq_date, acq_time, id LIMIT $${params.length + 1}`,
    [...params, MAX_ROWS + 1]
  );
  if (rows.length > MAX_ROWS) {
    throw httpError(`Too many hotspots (more than ${MAX_ROWS}). Narrow the date range or area.`);
  }
  return rows;
}

// GET /api/hotspots → GeoJSON FeatureCollection of matching points.
// GeoJSON requires coordinates in [longitude, latitude] order.
export async function getHotspots(filters) {
  const rows = await queryHotspots(filters);
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
      properties: row,
    })),
  };
}

// GET /api/hotspots.csv → the same rows as CSV (columns from docs/contracts.md [1]).
const CSV_COLUMNS = ["id", "latitude", "longitude", "acq_date", "acq_time", "sensor", "satellite", "daynight", "frp", "confidence", "type"];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function getHotspotsCsv(filters) {
  const rows = await queryHotspots(filters);
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  return lines.join("\n") + "\n";
}
