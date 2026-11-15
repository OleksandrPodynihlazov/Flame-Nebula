// /api/harmonized: the burning-activity series in one unit across satellites (table harmonized_monthly,
// built by harmonize/calibrate.py; docs/contracts.md [1] and [3]). One row per month: the month's
// reference satellite, its raw detections and the S-NPP-equivalent count with its uncertainty band.

import { httpError } from "./query.js";

// ISO 3166-1 alpha-3 of a country in the harmonized scope, or EUR (sum of all countries).
export const EUROPE = "EUR";

export function parseCountry(query) {
  const raw = query.country;
  if (raw === undefined || raw === "") return EUROPE;
  if (typeof raw !== "string" || !/^[A-Z]{3}$/.test(raw)) {
    throw httpError("country must be a 3-letter ISO code like ITA, or EUR for all of Europe");
  }
  return raw;
}

export function harmonizedSql(country) {
  return {
    text:
      `SELECT to_char(month_start, 'YYYY-MM') AS month, satellite, raw_count::int AS raw, ` +
      `round(count_snpp_eq::numeric, 1)::float8 AS count, round(count_lo::numeric, 1)::float8 AS lo, ` +
      `round(count_hi::numeric, 1)::float8 AS hi, days_missing::int AS days_missing ` +
      `FROM harmonized_monthly WHERE country = $1 ORDER BY month_start`,
    values: [country],
  };
}
