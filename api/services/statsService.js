import { pool } from "../db.js";
import { buildWhere } from "../lib/query.js";

// GET /api/stats → { total, frp_sum, by_type, by_daynight } (docs/contracts.md [3]).
// frp_sum: summed fire radiative power (MW) of the matching hotspots; rows with no frp add 0.
// Keys with a zero count are left out, as the frontend requirements ask:
// empty table → { total: 0, frp_sum: 0, by_type: {}, by_daynight: {} }.
export async function getStats(filters) {
  const { where, params } = buildWhere(filters);
  const { rows } = await pool.query(
    `SELECT type, daynight, COUNT(*) AS count, COALESCE(SUM(frp), 0) AS frp
       FROM hotspots
       ${where}
      GROUP BY type, daynight`,
    params
  );

  const result = { total: 0, frp_sum: 0, by_type: {}, by_daynight: {} };
  for (const { type, daynight, count, frp } of rows) {
    result.total += count;
    result.frp_sum += frp;
    // type is NULL for FIRMS API rows (contract [2]): counted in total, not in by_type.
    if (type !== null) result.by_type[type] = (result.by_type[type] ?? 0) + count;
    if (daynight) result.by_daynight[daynight] = (result.by_daynight[daynight] ?? 0) + count;
  }
  result.frp_sum = Math.round(result.frp_sum * 10) / 10;
  return result;
}
