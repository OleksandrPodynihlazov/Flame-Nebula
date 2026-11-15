// GET /api/selection-summary (docs/contracts.md [3]): the selection card's numbers in one small answer,
// so the browser no longer downloads every hotspot of the area to count them.
import { PLAIN } from "./confidence.js";
import { buildWhere } from "./query.js";

// One scan, four groupings: per day (peaks, first / last), per type, per day/night, and the whole set.
// GROUPING() tells a grouping-set NULL from a real NULL type or daynight. A grouping set () always
// returns one row, so an empty match still yields { kind: "all", count: 0 }.
// `source` from lib/confidence.js hotspotsSource(): same non_fire rule as /api/hotspots and /api/stats,
// so the selection card matches the stat cards for the same area.
export function buildSummaryQuery(filters, source = PLAIN) {
  const { where, params } = buildWhere(filters, { confidence: source.confidence });
  return {
    text: `SELECT CASE GROUPING(acq_date, type, daynight)
                    WHEN 3 THEN 'day' WHEN 5 THEN 'type' WHEN 6 THEN 'daynight' ELSE 'all'
                  END AS kind,
                  acq_date AS date, type, daynight,
                  COUNT(*) AS count, COUNT(frp) AS frp_count, SUM(frp) AS frp_sum, MAX(frp) AS frp_max
             FROM ${source.from}
             ${where}
            GROUP BY GROUPING SETS ((acq_date), (type), (daynight), ())`,
    values: params,
  };
}

// Rows of buildSummaryQuery → the response. Same rules as the old browser summary
// (frontend/src/utils/selectionSummary.ts): FRP over non-null values only (null when there are none);
// busiest month and day, ties to the earliest; NULL type / daynight counted in total only, like /api/stats.
export function summarize(rows) {
  const out = {
    total: 0, frp: null, peak_month: null, peak_day: null, first: null, last: null, by_type: {}, by_daynight: {},
  };
  const days = [];
  for (const r of rows) {
    if (r.kind === "all") {
      out.total = r.count;
      if (r.frp_count > 0) out.frp = { sum: r.frp_sum, mean: r.frp_sum / r.frp_count, max: r.frp_max };
    } else if (r.kind === "type") {
      if (r.type !== null) out.by_type[r.type] = r.count;
    } else if (r.kind === "daynight") {
      if (r.daynight !== null) out.by_daynight[r.daynight] = r.count;
    } else if (r.kind === "day") {
      days.push(r);
    }
  }

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const months = new Map();
  for (const { date, count } of days) {
    const month = date.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + count);
    // Strictly greater: on a tie the earlier day (rows are sorted) stays.
    if (out.peak_day === null || count > out.peak_day.count) out.peak_day = { date, count };
  }
  for (const [month, count] of months) {
    if (out.peak_month === null || count > out.peak_month.count) out.peak_month = { month, count };
  }
  if (days.length) {
    out.first = days[0].date;
    out.last = days[days.length - 1].date;
  }
  return out;
}
