import test from "node:test";
import assert from "node:assert/strict";
import { parseFilters, buildWhere, MAX_POLYGON_VERTICES, ONE_AREA } from "../lib/query.js";

const bad = (query, re) =>
  assert.throws(() => parseFilters(query), (e) => e.status === 400 && re.test(e.message));

const ring = (n) => Array.from({ length: n }, (_, i) => [12 + Math.cos(i) / 10, 41 + Math.sin(i) / 10]);

test("region: a positive integer id, null when absent", () => {
  assert.equal(parseFilters({}).region, null);
  assert.equal(parseFilters({ region: "812" }).region, 812);
  bad({ region: "abc" }, /region/);
  bad({ region: "0" }, /region/);
  bad({ region: "-3" }, /region/);
  bad({ region: "99999999999" }, /region/);
  bad({ region: "" }, /region/);
  bad({ region: ["1", "2"] }, /region/); // repeated param
});

test("region cannot be combined with a polygon or a circle", () => {
  assert.equal(ONE_AREA, "Send one area: region, polygon or circle");
  bad({ region: "1", polygon: "[[1,1],[2,1],[2,2]]" }, /^Send one area: region, polygon or circle$/);
  bad({ region: "1", lat: "1", lon: "1", radius_km: "1" }, /^Send one area: region, polygon or circle$/);
});

test("polygon is limited to 200 points; a closing point equal to the first is dropped before counting", () => {
  assert.equal(MAX_POLYGON_VERTICES, 200);
  assert.equal(parseFilters({ polygon: JSON.stringify(ring(200)) }).polygon.length, 200);
  bad({ polygon: JSON.stringify(ring(201)) }, /at most 200 points/);
  const r = ring(200);
  assert.equal(parseFilters({ polygon: JSON.stringify([...r, r[0]]) }).polygon.length, 200);
  const triangle = [[1, 1], [2, 1], [2, 2]];
  assert.equal(parseFilters({ polygon: JSON.stringify([...triangle, triangle[0]]) }).polygon.length, 3);
  bad({ polygon: "[[1,1],[2,2],[1,1]]" }, /at least 3/); // closes onto 2 distinct points
});

test("buildWhere: region is a bound EXISTS on hotspot_regions, numbered after the other params", () => {
  const { where, params } = buildWhere(parseFilters({ from: "2008-01-01", region: "7" }));
  assert.match(
    where,
    /EXISTS \(SELECT 1 FROM hotspot_regions hr WHERE hr\.hotspot_id = hotspots\.id AND hr\.region_id = \$2\)/
  );
  assert.deepEqual(params, ["2008-01-01", 7]);
});

test("buildWhere without a region never mentions the regions tables", () => {
  const { where } = buildWhere(parseFilters({ from: "2008-01-01", to: "2008-12-31", type: "0" }));
  assert.doesNotMatch(where, /hotspot_regions|regions/);
});

test("buildWhere: polygon keeps the exact form that uses the GiST index", () => {
  const { where } = buildWhere(parseFilters({ polygon: "[[1,1],[2,1],[2,2]]" }));
  assert.match(where, /point\(longitude, latitude\) <@ \$1::polygon/);
});
