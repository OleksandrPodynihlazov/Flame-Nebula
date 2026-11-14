import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BBOX_MAX_ROWS, parseFilters, parseRowCap, rowCapFor } from "../lib/query.js";

const caps = { maxRows: 500000, bboxMaxRows: 20000 };

test("parseRowCap: unset or empty -> fallback, positive integer -> number", () => {
  assert.equal(parseRowCap(undefined, "X", 20000), 20000);
  assert.equal(parseRowCap("", "X", 20000), 20000);
  assert.equal(parseRowCap("1", "X", 20000), 1);
  assert.equal(parseRowCap("35000", "X", 20000), 35000);
  assert.equal(DEFAULT_BBOX_MAX_ROWS, 20000);
});

test("parseRowCap: anything else fails with the env name and value", () => {
  for (const raw of ["0", "-5", "1.5", "abc", " 10", "10 ", "1e4", "007", "99999999999999999999"]) {
    assert.throws(
      () => parseRowCap(raw, "HOTSPOTS_BBOX_MAX_ROWS", 20000),
      (e) => e.message === `HOTSPOTS_BBOX_MAX_ROWS must be a positive integer, got "${raw}"`
    );
  }
});

test("rowCapFor: bbox -> viewport cap and Zoom in message", () => {
  const f = parseFilters({ from: "2020-01-01", bbox: "-180,-90,180,90" });
  assert.deepEqual(rowCapFor(f, caps), {
    cap: 20000,
    message: "Too many hotspots in view (more than 20000). Zoom in.",
  });
});

test("rowCapFor: no bbox -> main cap, also with an area", () => {
  const expected = { cap: 500000, message: "Too many hotspots (more than 500000). Narrow the date range or area." };
  assert.deepEqual(rowCapFor(parseFilters({}), caps), expected);
  assert.deepEqual(rowCapFor(parseFilters({ region: "7" }), caps), expected);
});

test("rowCapFor: bbox with an area still uses the viewport cap", () => {
  assert.equal(rowCapFor(parseFilters({ region: "7", bbox: "6,36,18,47" }), caps).cap, 20000);
});
