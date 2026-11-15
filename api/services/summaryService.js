import { pool } from "../db.js";
import { hotspotsSource } from "../lib/confidence.js";
import { buildSummaryQuery, summarize } from "../lib/summary.js";

// GET /api/selection-summary → { total, frp, peak_month, peak_day, first, last, by_type, by_daynight }
// (docs/contracts.md [3]). Aggregated in SQL; Node only reduces the per-day rows (at most one per day).
// non_fire points are left out unless include_non_fire=true, like every other data endpoint.
export async function getSelectionSummary(filters) {
  const source = await hotspotsSource(pool);
  const { rows } = await pool.query(buildSummaryQuery(filters, source));
  return summarize(rows);
}
