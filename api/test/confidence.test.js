import test from "node:test";
import assert from "node:assert/strict";
import {
  NOT_NON_FIRE, PLAIN, WITH_CONFIDENCE, byClass, hotspotsSource, isNonFire, resetSourceCache,
} from "../lib/confidence.js";
import { buildGridQuery, buildWhere, parseFilters } from "../lib/query.js";
import { buildSummaryQuery } from "../lib/summary.js";

const bad = (query, re) =>
  assert.throws(() => parseFilters(query), (e) => e.status === 400 && re.test(e.message));

test("include_non_fire: false by default, only true or false accepted", () => {
  assert.equal(parseFilters({}).includeNonFire, false);
  assert.equal(parseFilters({ include_non_fire: "true" }).includeNonFire, true);
  assert.equal(parseFilters({ include_non_fire: "false" }).includeNonFire, false);
  bad({ include_non_fire: "1" }, /include_non_fire/);
  bad({ include_non_fire: "yes" }, /include_non_fire/);
  bad({ include_non_fire: "" }, /include_non_fire/);
  bad({ include_non_fire: ["true", "false"] }, /include_non_fire/);
});

test("min_confidence: off by default, whole number 0..100 only", () => {
  assert.equal(parseFilters({}).minConfidence, null);
  assert.equal(parseFilters({ min_confidence: "0" }).minConfidence, 0);
  assert.equal(parseFilters({ min_confidence: "60" }).minConfidence, 60);
  assert.equal(parseFilters({ min_confidence: "100" }).minConfidence, 100);
  for (const bad_ of ["101", "-1", "60.5", "abc", "", " 60", "1e2"]) bad({ min_confidence: bad_ }, /min_confidence/);
  bad({ min_confidence: ["50", "60"] }, /min_confidence/);
});

test("min_confidence becomes a score condition with its own $n, before the other params", () => {
  const { where, params } = buildWhere(parseFilters({ min_confidence: "60", from: "2008-01-01" }), { confidence: true });
  assert.match(where, /confidence_score >= \$1/);
  assert.match(where, /acq_date >= \$2/);
  assert.deepEqual(params, [60, "2008-01-01"]);
});

test("min_confidence also applies when non_fire is kept (stats, include_non_fire=true)", () => {
  const f = parseFilters({ min_confidence: "60", include_non_fire: "true" });
  assert.match(buildWhere(f, { confidence: true }).where, /confidence_score >= \$1/);
  assert.match(buildWhere(parseFilters({ min_confidence: "60" }), { confidence: true, hideNonFire: false }).where,
    /confidence_score >= \$1/);
});

test("min_confidence without the confidence source matches nothing instead of being ignored", () => {
  const { where, params } = buildWhere(parseFilters({ min_confidence: "60" }));
  assert.equal(where, "WHERE false");
  assert.deepEqual(params, []);
  assert.equal(buildWhere(parseFilters({})).where, "", "no filter, no condition");
});

test("non_fire is hidden only when the query reads the confidence view", () => {
  const f = parseFilters({ from: "2008-01-01" });
  assert.ok(!buildWhere(f).where.includes(NOT_NON_FIRE), "plain hotspots: no confidence column to filter on");
  const { where, params } = buildWhere(f, { confidence: true });
  assert.ok(where.includes(NOT_NON_FIRE));
  assert.deepEqual(params, ["2008-01-01"]); // the condition has no params, so $n numbering is unchanged
  assert.match(where, /acq_date >= \$1/);
});

test("include_non_fire=true or hideNonFire:false keeps non_fire points", () => {
  const all = parseFilters({ include_non_fire: "true" });
  assert.equal(buildWhere(all, { confidence: true }).where, "");
  const f = parseFilters({});
  assert.equal(buildWhere(f, { confidence: true, hideNonFire: false }).where, "");
});

test("grid reads the source it is given, with the same non_fire rule", () => {
  const f = parseFilters({ bbox: "6,36,18,47" });
  const plain = buildGridQuery(f, 1);
  assert.match(plain.text, /FROM hotspots\s/);
  assert.ok(!plain.text.includes(NOT_NON_FIRE));
  const scored = buildGridQuery(f, 1, WITH_CONFIDENCE);
  assert.match(scored.text, /FROM hotspots_with_confidence AS hotspots/);
  assert.ok(scored.text.includes(NOT_NON_FIRE));
});

test("selection summary reads the source it is given, with the same non_fire rule", () => {
  const f = parseFilters({ from: "2008-01-01" });
  const plain = buildSummaryQuery(f);
  assert.match(plain.text, /FROM hotspots\s/);
  assert.ok(!plain.text.includes(NOT_NON_FIRE));
  const scored = buildSummaryQuery(f, WITH_CONFIDENCE);
  assert.match(scored.text, /FROM hotspots_with_confidence AS hotspots/);
  assert.ok(scored.text.includes(NOT_NON_FIRE));
  assert.ok(!buildSummaryQuery(parseFilters({ include_non_fire: "true" }), WITH_CONFIDENCE).text.includes(NOT_NON_FIRE));
});

test("hotspotsSource: view present -> view, missing -> plain hotspots; re-checked after 30 s", async () => {
  let ok = false;
  let calls = 0;
  const db = { query: async () => { calls++; return { rows: [{ ok }] }; } };
  resetSourceCache();
  assert.equal(await hotspotsSource(db, 0), PLAIN);
  ok = true;
  assert.equal(await hotspotsSource(db, 10000), PLAIN, "cached within 30 s");
  assert.equal(calls, 1);
  assert.equal(await hotspotsSource(db, 31000), WITH_CONFIDENCE);
  assert.equal(calls, 2);
  resetSourceCache();
});

test("isNonFire", () => {
  assert.equal(isNonFire("non_fire:static"), true);
  assert.equal(isNonFire("non_fire"), true);
  assert.equal(isNonFire("confirmed"), false);
  assert.equal(isNonFire(null), false);
});

test("byClass: classes, unscored, non_fire split by reason, zeros left out", () => {
  assert.deepEqual(byClass([]), { non_fire: {} });
  const rows = [
    { cls: "confirmed", count: 5 },
    { cls: "confirmed", count: 2 }, // same class, another type/daynight group
    { cls: "likely", count: 3 },
    { cls: "doubtful", count: 0 },
    { cls: null, count: 4 },
    { cls: "non_fire:static", count: 7 },
    { cls: "non_fire:volcano", count: 1 },
    { cls: "non_fire:static", count: 1 },
  ];
  assert.deepEqual(byClass(rows), {
    confirmed: 7, likely: 3, unscored: 4, non_fire: { static: 8, volcano: 1 },
  });
});
