import test from "node:test";
import assert from "node:assert/strict";
import { parseFilters } from "../lib/query.js";
import { LIKELY, fillMonths, parseMonth, patternsSql, summarySql } from "../lib/patterns-sql.js";

const bad = (query, re) => assert.throws(() => parseMonth(query), (e) => e.status === 400 && re.test(e.message));

test("month: required, 1-12, one value", () => {
  assert.equal(parseMonth({ month: "8" }), 8);
  assert.equal(parseMonth({ month: "12" }), 12);
  bad({}, /required/);
  bad({ month: "0" }, /1 to 12/);
  bad({ month: "13" }, /1 to 12/);
  bad({ month: "8.5" }, /1 to 12/);
  bad({ month: ["8", "9"] }, /1 to 12/);
});

test("patterns: month is the last bound value; no area means no area condition", () => {
  const sql = patternsSql(parseFilters({}), 8);
  assert.deepEqual(sql.values, [8]);
  assert.match(sql.text, /WHERE month = \$1/);
  assert.match(sql.text, /ORDER BY probability DESC, median_count DESC/);
});

test("patterns: a circle filters cell centres and keeps month last", () => {
  const sql = patternsSql(parseFilters({ lat: "37.6", lon: "14.2", radius_km: "50" }), 8);
  assert.equal(sql.values.at(-1), 8);
  assert.match(sql.text, /\(p\.cell_lat \+ 0\.5\) \/ 10\.0 AS latitude/);
  assert.match(sql.text, /asin/);
  assert.match(sql.text, new RegExp(`AND month = \\$${sql.values.length}`));
});

test("patterns: a region keeps S-NPP cells that hold one of its hotspots", () => {
  const sql = patternsSql(parseFilters({ region: "812" }), 7);
  assert.deepEqual(sql.values, [812, 7]);
  assert.match(sql.text, /hr\.region_id = \$1 AND h\.satellite = 'N'/);
});

test("summary: groups by month and counts likely cells", () => {
  const sql = summarySql(parseFilters({ bbox: "6,36,19,48" }));
  assert.equal(sql.values.length, 4);
  assert.match(sql.text, new RegExp(`probability >= ${LIKELY}`));
  assert.match(sql.text, /GROUP BY month ORDER BY month/);
});

test("fillMonths returns all 12 months, zero where there is no row", () => {
  const months = fillMonths([{ month: 8, cells: 900, likely: 300, max_probability: 1 }]);
  assert.equal(months.length, 12);
  assert.deepEqual(months[0], { month: 1, cells: 0, likely: 0, max_probability: 0 });
  assert.deepEqual(months[7], { month: 8, cells: 900, likely: 300, max_probability: 1 });
});
