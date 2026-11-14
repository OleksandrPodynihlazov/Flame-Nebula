import test from "node:test";
import assert from "node:assert/strict";
import { parseFilters } from "../lib/query.js";
import { buildSummaryQuery, summarize } from "../lib/summary.js";

const EMPTY = {
  total: 0, frp: null, peak_month: null, peak_day: null, first: null, last: null, by_type: {}, by_daynight: {},
};

const all = (count, frp_count = 0, frp_sum = null, frp_max = null) =>
  ({ kind: "all", date: null, type: null, daynight: null, count, frp_count, frp_sum, frp_max });
const day = (date, count) => ({ kind: "day", date, type: null, daynight: null, count });
const type = (t, count) => ({ kind: "type", date: null, type: t, daynight: null, count });
const dn = (d, count) => ({ kind: "daynight", date: null, type: null, daynight: d, count });

test("buildSummaryQuery: one grouping-sets scan with the shared WHERE and its params", () => {
  const { text, values } = buildSummaryQuery(
    parseFilters({ from: "2020-01-01", to: "2020-12-31", sensor: "MODIS,VIIRS", polygon: "[[1,1],[2,1],[2,2]]" })
  );
  assert.match(text, /GROUP BY GROUPING SETS \(\(acq_date\), \(type\), \(daynight\), \(\)\)/);
  assert.match(text, /CASE GROUPING\(acq_date, type, daynight\)\s+WHEN 3 THEN 'day' WHEN 5 THEN 'type' WHEN 6 THEN 'daynight' ELSE 'all'/);
  assert.match(text, /COUNT\(frp\) AS frp_count, SUM\(frp\) AS frp_sum, MAX\(frp\) AS frp_max/);
  assert.match(text, /WHERE acq_date >= \$1 AND acq_date <= \$2 AND instrument = ANY\(\$3::text\[\]\)/);
  assert.equal(values[0], "2020-01-01");
  assert.deepEqual(values[2], ["MODIS", "VIIRS"]);
  assert.match(values[values.length - 1], /^\(\(1,1\),\(2,1\),\(2,2\)\)$/);
});

test("buildSummaryQuery without filters has no WHERE and no params", () => {
  const { text, values } = buildSummaryQuery(parseFilters({}));
  assert.doesNotMatch(text, /WHERE/);
  assert.deepEqual(values, []);
});

test("summarize: no match (only the () row, count 0) → zeros and nulls", () => {
  assert.deepEqual(summarize([all(0)]), EMPTY);
  assert.deepEqual(summarize([]), EMPTY);
});

test("summarize: FRP over non-null values only; null when every value is null", () => {
  assert.equal(summarize([all(2, 0, null, null), day("2020-07-01", 2)]).frp, null);
  // 3 hotspots, 2 with FRP (30 + 10): mean divides by 2, not 3.
  assert.deepEqual(summarize([all(3, 2, 40, 30), day("2020-07-01", 3)]).frp, { sum: 40, mean: 20, max: 30 });
});

test("summarize: peak day and peak month ties go to the earliest, whatever the row order", () => {
  const s = summarize([
    all(8),
    day("2020-09-02", 2),
    day("2020-08-20", 2),
    day("2020-08-01", 1),
    day("2020-09-01", 1),
    day("2020-07-31", 2),
  ]);
  assert.deepEqual(s.peak_day, { date: "2020-07-31", count: 2 });
  // August 3, September 3, July 2.
  assert.deepEqual(s.peak_month, { month: "2020-08", count: 3 });
  assert.equal(s.first, "2020-07-31");
  assert.equal(s.last, "2020-09-02");
});

test("summarize: a strictly larger later day or month wins", () => {
  const s = summarize([all(6), day("2020-01-05", 1), day("2020-03-01", 2), day("2020-03-02", 3)]);
  assert.deepEqual(s.peak_day, { date: "2020-03-02", count: 3 });
  assert.deepEqual(s.peak_month, { month: "2020-03", count: 5 });
});

test("summarize: NULL type and NULL daynight count in total only, like /api/stats", () => {
  const s = summarize([all(5), day("2020-07-01", 5), type(0, 2), type(2, 1), type(null, 2), dn("D", 4), dn(null, 1)]);
  assert.equal(s.total, 5);
  assert.deepEqual(s.by_type, { 0: 2, 2: 1 });
  assert.deepEqual(s.by_daynight, { D: 4 });
});

test("summarize: a single hotspot", () => {
  const s = summarize([all(1, 1, 12.5, 12.5), day("2020-05-17", 1), type(0, 1), dn("N", 1)]);
  assert.deepEqual(s, {
    total: 1,
    frp: { sum: 12.5, mean: 12.5, max: 12.5 },
    peak_month: { month: "2020-05", count: 1 },
    peak_day: { date: "2020-05-17", count: 1 },
    first: "2020-05-17",
    last: "2020-05-17",
    by_type: { 0: 1 },
    by_daynight: { N: 1 },
  });
});
