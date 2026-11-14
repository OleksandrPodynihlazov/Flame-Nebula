import { pool } from "../db.js";
import { buildWhere } from "../lib/query.js";

// GET /api/stats → { total, by_type, by_daynight } (docs/contracts.md [3]).
// Keys with a zero count are left out, as the frontend requirements ask:
// empty table → { total: 0, by_type: {}, by_daynight: {} }.
export async function getStats(filters) {
  const { where, params } = buildWhere(filters);
  const { rows } = await pool.query(
    `SELECT type, daynight, COUNT(*) AS count
       FROM hotspots
       ${where}
      GROUP BY type, daynight`,
    params
  );

  const result = { total: 0, by_type: {}, by_daynight: {} };
  for (const { type, daynight, count } of rows) {
    result.total += count;
    result.by_type[type] = (result.by_type[type] ?? 0) + count;
    if (daynight) result.by_daynight[daynight] = (result.by_daynight[daynight] ?? 0) + count;
  }
  return result;
}
