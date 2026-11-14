import test from "node:test";
import assert from "node:assert/strict";
import { normName } from "../lib/names.js";

// same pairs as ingest/tests/test_regions_geo.py::NormName: JS and Python must agree
test("normName matches the Python search key", () => {
  for (const [raw, want] of [
    ["Sicilia", "sicilia"],
    ["Île-de-France", "ile-de-france"],
    ["Łódź", "łodz"],
    ["Valle d'Aosta", "valle d'aosta"],
  ]) {
    assert.equal(normName(raw), want);
  }
});
