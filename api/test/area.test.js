import test from "node:test";
import assert from "node:assert/strict";
import {
  BadRequest, MAX_POLYGON_VERTICES, ONE_AREA, parseArea, areaSql, checkArea, isMissingTable,
} from "../lib/area.js";

const ring = (n) => Array.from({ length: n }, (_, i) => [12 + Math.cos(i) / 10, 41 + Math.sin(i) / 10]);
const bad = (query, re) => assert.throws(() => parseArea(query), (e) => e instanceof BadRequest && e.status === 400 && re.test(e.message));

test("no area", () => {
  assert.deepEqual(parseArea({ from: "2008-01-01" }), { kind: "none" });
  assert.deepEqual(areaSql({ kind: "none" }), { join: "", where: "", params: [] });
});

test("region", () => {
  assert.deepEqual(parseArea({ region: "812" }), { kind: "region", id: 812 });
  bad({ region: "abc" }, /region/);
  bad({ region: "0" }, /region/);
  bad({ region: "99999999999" }, /region/);
});

test("polygon", () => {
  const area = parseArea({ polygon: "[[12.1,41.8],[12.9,41.8],[12.5,42.2]]" });
  assert.deepEqual(area, { kind: "polygon", ring: [[12.1, 41.8], [12.9, 41.8], [12.5, 42.2]] });
});

test("circle", () => {
  assert.deepEqual(parseArea({ lat: "41.9", lon: "12.5", radius_km: "50" }),
    { kind: "circle", lat: 41.9, lon: 12.5, radiusKm: 50 });
  bad({ lat: "41.9", lon: "12.5" }, /lat, lon and radius_km/);
  bad({ lat: "41.9", lon: "12.5", radius_km: "0" }, /radius_km/);
  bad({ lat: "95", lon: "12.5", radius_km: "5" }, /lat/);
});

test("two areas are rejected with the contract message", () => {
  for (const q of [
    { region: "1", polygon: "[[1,1],[2,1],[2,2]]" },
    { region: "1", lat: "1", lon: "1", radius_km: "1" },
    { polygon: "[[1,1],[2,1],[2,2]]", lat: "1", lon: "1", radius_km: "1" },
  ]) {
    assert.throws(() => parseArea(q), (e) => e instanceof BadRequest && e.message === ONE_AREA);
  }
  assert.equal(ONE_AREA, "Send one area: region, polygon or circle");
});

test("parseArea rejects malformed polygons", () => {
  bad({ polygon: "x" }, /polygon/);
  bad({ polygon: "[[1,2],[3,4]]" }, /3 to 200/);
  bad({ polygon: JSON.stringify(ring(MAX_POLYGON_VERTICES + 1)) }, /3 to 200/);
  bad({ polygon: '[["a",1],[2,2],[3,3]]' }, /polygon/);
  bad({ polygon: "[[200,1],[2,2],[3,3]]" }, /range/);
  bad({ polygon: '{"a":1}' }, /polygon/);
  bad({ polygon: "[[1,1,1],[2,2],[3,3]]" }, /polygon/);
  bad({ polygon: ["[[1,1],[2,1],[2,2]]", "[[1,1],[2,1],[2,2]]"] }, /polygon/); // repeated param
});

test("a closed ring of 200 points + closing point is accepted", () => {
  const r = ring(MAX_POLYGON_VERTICES);
  const area = parseArea({ polygon: JSON.stringify([...r, r[0]]) });
  assert.equal(area.ring.length, MAX_POLYGON_VERTICES);
});

test("areaSql numbers params from firstParam", () => {
  const region = areaSql({ kind: "region", id: 7 }, 3);
  assert.equal(region.join, "JOIN hotspot_regions hr ON hr.hotspot_id = h.id AND hr.region_id = $3");
  assert.deepEqual(region.params, [7]);

  const poly = areaSql({ kind: "polygon", ring: [[1, 2], [3, 4], [5, 6]] }, 2);
  assert.equal(poly.where, "point(h.longitude, h.latitude) <@ $2::polygon");
  assert.deepEqual(poly.params, ["((1,2),(3,4),(5,6))"]);

  const circle = areaSql({ kind: "circle", lat: 41.9, lon: 12.5, radiusKm: 50 }, 4);
  assert.match(circle.where, /earth_box\(ll_to_earth\(\$4, \$5\), \$6\) @> ll_to_earth\(h\.latitude, h\.longitude\)/);
  assert.match(circle.where, /earth_distance\(ll_to_earth\(\$4, \$5\), ll_to_earth\(h\.latitude, h\.longitude\)\) <= \$6/);
  assert.deepEqual(circle.params, [41.9, 12.5, 50000]);
});

test("checkArea rejects an unknown region", async () => {
  const empty = { query: async () => ({ rows: [] }) };
  await assert.rejects(checkArea({ kind: "region", id: 5 }, empty), (e) => e instanceof BadRequest && e.message === "unknown region: 5");
  const noTable = { query: async () => { throw Object.assign(new Error("no table"), { code: "42P01" }); } };
  await assert.rejects(checkArea({ kind: "region", id: 5 }, noTable), (e) => e instanceof BadRequest);
  const found = { query: async () => ({ rows: [{ id: 5 }] }) };
  await checkArea({ kind: "region", id: 5 }, found);
  await checkArea({ kind: "none" }, empty);
});

test("isMissingTable", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "23505" }), false);
  assert.equal(isMissingTable(undefined), false);
});
