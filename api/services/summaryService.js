import { pool } from "../db.js";
import { buildSummaryQuery, summarize } from "../lib/summary.js";

// GET /api/selection-summary → { total, frp, peak_month, peak_day, first, last, by_type, by_daynight }
// (docs/contracts.md [3]). Aggregated in SQL; Node only reduces the per-day rows (at most one per day).
export async function getSelectionSummary(filters) {
  const { rows } = await pool.query(buildSummaryQuery(filters));
  return summarize(rows);
}
