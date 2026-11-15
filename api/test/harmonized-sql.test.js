import test from "node:test";
import assert from "node:assert/strict";
import { EUROPE, harmonizedSql, parseCountry } from "../lib/harmonized-sql.js";

test("country: optional (Europe), 3 upper-case letters", () => {
  assert.equal(parseCountry({}), EUROPE);
  assert.equal(parseCountry({ country: "" }), EUROPE);
  assert.equal(parseCountry({ country: "ITA" }), "ITA");
  assert.equal(parseCountry({ country: "EUR" }), "EUR");
  for (const v of ["ita", "IT", "ITAL", "1TA", ["ITA", "ESP"]]) {
    assert.throws(() => parseCountry({ country: v }), (e) => e.status === 400 && /3-letter/.test(e.message));
  }
});

test("series: one bound value, months in order, numbers as numbers", () => {
  const sql = harmonizedSql("ITA");
  assert.deepEqual(sql.values, ["ITA"]);
  assert.match(sql.text, /FROM harmonized_monthly WHERE country = \$1 ORDER BY month_start/);
  assert.match(sql.text, /to_char\(month_start, 'YYYY-MM'\) AS month/);
  assert.match(sql.text, /count_snpp_eq::numeric, 1\)::float8 AS count/);
});
