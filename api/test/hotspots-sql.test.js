import test from "node:test";
import assert from "node:assert/strict";
import { SELECT_HOTSPOTS, CSV_COLUMNS } from "../services/hotspotsService.js";

// Both sensors reach the API already in one form: the harmonization view hotspots_canonical
// (db/init/hotspots-views.sql) maps VIIRS l/n/h and MODIS 0-100 to one confidence_level.
// The API must not decide per sensor how to read a field.

test("hotspots are read from the canonical view, aliased so shared filters keep working", () => {
  assert.match(SELECT_HOTSPOTS, /FROM hotspots_canonical AS hotspots\b/);
});

test("confidence_level for both sensors, confidence = raw MODIS percent", () => {
  assert.match(SELECT_HOTSPOTS, /\bconfidence_level\b/);
  assert.match(SELECT_HOTSPOTS, /confidence_pct AS confidence\b/);
  assert.doesNotMatch(SELECT_HOTSPOTS, /confidence ~/); // no per-format branching in the API
});

test("CSV export carries confidence_level next to confidence", () => {
  assert.deepEqual(CSV_COLUMNS.slice(-3), ["confidence", "confidence_level", "type"]);
});
