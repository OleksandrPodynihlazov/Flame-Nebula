import { pool } from "../db.js";
import { confidenceJoin, hotspotsSource } from "../lib/confidence.js";
import {
  DEFAULT_BBOX_MAX_ROWS,
  DEFAULT_MAX_ROWS,
  buildWhere,
  httpError,
  parseRowCap,
  rowCapFor,
} from "../lib/query.js";

// Upper bound on rows per /api/hotspots(.csv) response. Without it a request with no date range
// loads the whole table into memory and the API dies with a heap OOM. bbox (viewport) requests use their own cap.
const CAPS = {
  maxRows: parseRowCap(process.env.HOTSPOTS_MAX_ROWS, "HOTSPOTS_MAX_ROWS", DEFAULT_MAX_ROWS),
  bboxMaxRows: parseRowCap(process.env.HOTSPOTS_BBOX_MAX_ROWS, "HOTSPOTS_BBOX_MAX_ROWS", DEFAULT_BBOX_MAX_ROWS),
};

// Field names and types follow docs/contracts.md [1] (what the frontend expects),
// not the DB schema [2]: instrument → sensor, acq_time 105 → "0105".
// Rows come from the harmonization view hotspots_canonical (db/init/hotspots-views.sql), which already
// reduces both sensors to one form: confidence_level low/nominal/high for MODIS and VIIRS, confidence_pct =
// raw MODIS 0-100 (VIIRS has none). Aliased as `hotspots` so the shared WHERE builder keeps working.
// brightness, scan, track and version are not part of the contract, so they are not selected.
// confidence_score / _class / _reasons, worldview_url: fire confidence (contract [1b]), joined in by
// confidenceJoin() (lib/confidence.js); null when the point is not scored or the DB has no confidence table.
export const SELECT_HOTSPOTS = `
  SELECT id,
         latitude,
         longitude,
         acq_date,
         LPAD(acq_time::text, 4, '0') AS acq_time,
         instrument AS sensor,
         satellite,
         daynight,
         frp,
         confidence_pct AS confidence,
         confidence_level,
         type,
         confidence_score,
         confidence_class,
         confidence_reasons,
         worldview_url
    FROM hotspots_canonical AS hotspots`;

async function queryHotspots(filters) {
  const source = await hotspotsSource(pool);
  const { where, params } = buildWhere(filters, { confidence: source.confidence });
  const { cap, message } = rowCapFor(filters, CAPS);
  // Fetch one row past the cap to tell "exactly at the cap" from "over it"; never truncate silently.
  const { rows } = await pool.query(
    `${SELECT_HOTSPOTS} ${confidenceJoin(source)} ${where} ORDER BY acq_date, acq_time, id LIMIT $${params.length + 1}`,
    [...params, cap + 1]
  );
  if (rows.length > cap) throw httpError(message);
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
export const CSV_COLUMNS = ["id", "latitude", "longitude", "acq_date", "acq_time", "sensor", "satellite", "daynight", "frp",
  "confidence", "confidence_level", "type"];

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
