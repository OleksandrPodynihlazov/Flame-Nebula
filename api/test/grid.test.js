import test from "node:test";
import assert from "node:assert/strict";
import { MAX_GRID_CELLS, buildGridQuery, parseCell, parseFilters } from "../lib/query.js";

const bad = (fn, re) => assert.throws(fn, (e) => e.status === 400 && re.test(e.message));

test("bbox: west,south,east,north as numbers, null when absent", () => {
  assert.equal(parseFilters({}).bbox, null);
  assert.deepEqual(parseFilters({ bbox: "6.5,36.5,18.75,47.1" }).bbox, { west: 6.5, south: 36.5, east: 18.75, north: 47.1 });
  assert.deepEqual(parseFilters({ bbox: "-180,-90,180,90" }).bbox, { west: -180, south: -90, east: 180, north: 90 });
});

test("bbox: wrong count, not numbers, reversed or out of range -> 400", () => {
  bad(() => parseFilters({ bbox: "1,2,3" }), /4 numbers/);
  bad(() => parseFilters({ bbox: "1,2,3,4,5" }), /4 numbers/);
  bad(() => parseFilters({ bbox: "a,2,3,4" }), /bbox west/);
  bad(() => parseFilters({ bbox: "1,2,,4" }), /bbox east/);
  bad(() => parseFilters({ bbox: "18,36,6,47" }), /west must be less than east/);
  bad(() => parseFilters({ bbox: "6,47,18,36" }), /south must be less than north/);
  bad(() => parseFilters({ bbox: "6,36,6,47" }), /west must be less than east/);
  bad(() => parseFilters({ bbox: "-181,36,18,47" }), /bbox west/);
  bad(() => parseFilters({ bbox: "6,-91,18,47" }), /bbox south/);
  bad(() => parseFilters({ bbox: "6,36,181,47" }), /bbox east/);
  bad(() => parseFilters({ bbox: "6,36,18,90.5" }), /bbox north/);
  bad(() => parseFilters({ bbox: "" }), /bbox/);
  bad(() => parseFilters({ bbox: ["1,2,3,4", "1,2,3,4"] }), /bbox/);
});

test("bbox combines with an area: both conditions, bbox params bound", () => {
  const f = parseFilters({ from: "2008-01-01", region: "7", bbox: "6,36,18,47" });
  const { text, values } = buildGridQuery(f, 0.5);
  assert.match(text, /latitude BETWEEN \$2 AND \$3 AND longitude BETWEEN \$4 AND \$5/);
  assert.match(text, /hr\.region_id = \$6/);
  assert.deepEqual(values, ["2008-01-01", 36, 47, 6, 18, 7, 0.5, MAX_GRID_CELLS + 1]);
});

test("cell: required, 0.01 to 10 degrees", () => {
  assert.equal(parseCell({ cell: "0.5" }), 0.5);
  assert.equal(parseCell({ cell: "0.01" }), 0.01);
  assert.equal(parseCell({ cell: "10" }), 10);
  bad(() => parseCell({}), /cell is required/);
  bad(() => parseCell({ cell: "0.009" }), /cell/);
  bad(() => parseCell({ cell: "10.5" }), /cell/);
  bad(() => parseCell({ cell: "0" }), /cell/);
  bad(() => parseCell({ cell: "-1" }), /cell/);
  bad(() => parseCell({ cell: "abc" }), /cell/);
  bad(() => parseCell({ cell: "" }), /cell/);
});

test("grid SQL: groups by floor(lat/cell), floor(lon/cell), mode() type, cap + 1 rows", () => {
  const { text, values } = buildGridQuery(parseFilters({ bbox: "6,36,18,47" }), 0.25);
  assert.match(text, /GROUP BY floor\(latitude \/ \$5::float8\), floor\(longitude \/ \$5::float8\)/);
  assert.match(text, /mode\(\) WITHIN GROUP \(ORDER BY type\) AS type/);
  assert.match(text, /COUNT\(\*\) AS count/);
  assert.match(text, /LIMIT \$6/);
  assert.deepEqual(values, [36, 47, 6, 18, 0.25, 20001]);
  assert.equal(MAX_GRID_CELLS, 20000);
});
