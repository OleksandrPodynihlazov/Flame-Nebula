import { pool } from "../db.js";
import { byClass, hotspotsSource, isNonFire } from "../lib/confidence.js";
import { buildWhere } from "../lib/query.js";

// GET /api/stats → { total, frp_sum, by_type, by_daynight, by_class } (docs/contracts.md [3]).
// frp_sum: summed fire radiative power (MW) of the matching hotspots; rows with no frp add 0.
// Keys with a zero count are left out, as the frontend requirements ask:
// empty table → { total: 0, frp_sum: 0, by_type: {}, by_daynight: {}, by_class: { non_fire: {} } }.
// non_fire points: left out of total / frp_sum / by_type / by_daynight unless include_non_fire=true, but always
// counted in by_class, so the UI can say what was hidden. One query: non_fire rows are not filtered in SQL here.
export async function getStats(filters) {
  const source = await hotspotsSource(pool);
  const { where, params } = buildWhere(filters, { confidence: source.confidence, hideNonFire: false });
  const cls = source.confidence ? "confidence_class" : "NULL::text";
  const { rows } = await pool.query(
    `SELECT type, daynight, ${cls} AS cls, COUNT(*) AS count, COALESCE(SUM(frp), 0) AS frp
       FROM ${source.from}
       ${where}
      GROUP BY type, daynight, cls`,
    params
  );

  const result = { total: 0, frp_sum: 0, by_type: {}, by_daynight: {}, by_class: byClass(rows) };
  for (const { type, daynight, cls: c, count, frp } of rows) {
    if (isNonFire(c) && !filters.includeNonFire) continue;
    result.total += count;
    result.frp_sum += frp;
    // type is NULL for FIRMS API rows (contract [2]): counted in total, not in by_type.
    if (type !== null) result.by_type[type] = (result.by_type[type] ?? 0) + count;
    if (daynight) result.by_daynight[daynight] = (result.by_daynight[daynight] ?? 0) + count;
  }
  result.frp_sum = Math.round(result.frp_sum * 10) / 10;
  return result;
}
