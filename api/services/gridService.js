import { pool } from "../db.js";
import { hotspotsSource } from "../lib/confidence.js";
import { MAX_GRID_CELLS, TOO_MANY_CELLS, buildGridQuery, httpError } from "../lib/query.js";

// GET /api/hotspots/grid → { cell, cells: [{ lat, lon, count, type }] } (docs/contracts.md [3]).
// bbox is required: without it a small cell over all loaded data could group millions of rows.
// Same non_fire rule as /api/hotspots, so zoomed-out bubbles and zoomed-in points count the same points.
export async function getGrid(filters, cell) {
  if (!filters.bbox) throw httpError("bbox is required: west,south,east,north");
  const source = await hotspotsSource(pool);
  const { rows } = await pool.query(buildGridQuery(filters, cell, source));
  if (rows.length > MAX_GRID_CELLS) throw httpError(TOO_MANY_CELLS);
  return { cell, cells: rows };
}
