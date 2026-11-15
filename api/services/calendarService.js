import { pool } from "../db.js";
import { hotspotsSource } from "../lib/confidence.js";
import { buildWhere } from "../lib/query.js";

// GET /api/calendar → { days: [{ date: "YYYY-MM-DD", count, frp }] } (docs/contracts.md [3]).
// frp: summed fire radiative power (MW) of that day's hotspots, 1 decimal.
// Days sorted ascending; days with no hotspots are simply absent (GROUP BY only returns
// days that have rows), as the frontend requirements ask. Empty table → { days: [] }.
// The frontend builds the month × day grid, month totals and peak month from this list.
// non_fire points are left out unless include_non_fire=true (lib/confidence.js).
export async function getCalendar(filters) {
  const source = await hotspotsSource(pool);
  const { where, params } = buildWhere(filters, { confidence: source.confidence });
  const { rows } = await pool.query(
    `SELECT acq_date AS date, COUNT(*) AS count, ROUND(COALESCE(SUM(frp), 0)::numeric, 1)::float8 AS frp
       FROM ${source.from}
       ${where}
      GROUP BY acq_date
      ORDER BY acq_date`,
    params
  );
  return { days: rows };
}
