import { pool } from "../db.js";

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
    FROM hotspots
   ORDER BY acq_date, acq_time, id`;

// GET /api/hotspots → GeoJSON FeatureCollection of all points.
// GeoJSON requires coordinates in [longitude, latitude] order.
export async function getHotspots() {
  const { rows } = await pool.query(SELECT_HOTSPOTS);
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
      properties: row,
    })),
  };
}
