import { pool } from "../db.js";
import { MAX_GRID_CELLS, TOO_MANY_CELLS, buildGridQuery, httpError } from "../lib/query.js";

// GET /api/hotspots/grid → { cell, cells: [{ lat, lon, count, type }] } (docs/contracts.md [3]).
// bbox is required: without it a small cell over all loaded data could group millions of rows.
export async function getGrid(filters, cell) {
  if (!filters.bbox) throw httpError("bbox is required: west,south,east,north");
  const { rows } = await pool.query(buildGridQuery(filters, cell));
  if (rows.length > MAX_GRID_CELLS) throw httpError(TOO_MANY_CELLS);
  return { cell, cells: rows };
}
