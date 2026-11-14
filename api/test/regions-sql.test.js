import test from "node:test";
import assert from "node:assert/strict";
import { BadRequest } from "../lib/area.js";
import { searchPattern, listSql, featureSql, parseRegionsQuery, SEARCH_LIMIT } from "../lib/regions-sql.js";

test("searchPattern escapes wildcards", () => {
  assert.equal(searchPattern("50%_a\\"), "50\\%\\_a\\\\");
  assert.equal(searchPattern("SICÍL"), "sicil");
  assert.equal(searchPattern("d'aosta"), "d'aosta"); // quotes stay data: values are bound params
});

test("listSql: countries by default", () => {
  const { text, values } = listSql({});
  assert.match(text, /WHERE r\.level = 0/);
  assert.deepEqual(values, []);
});

test("listSql: children of a parent", () => {
  const { text, values } = listSql({ parent: 7 });
  assert.match(text, /WHERE r\.parent_id = \$1/);
  assert.deepEqual(values, [7]);
});

test("listSql: search is bound, prefix first, limited", () => {
  const { text, values } = listSql({ q: "Sicil" });
  assert.deepEqual(values, ["sicil"]);
  assert.match(text, /r\.name_norm LIKE '%' \|\| \$1 \|\| '%'/);
  assert.match(text, new RegExp(`LIMIT ${SEARCH_LIMIT}$`));
  assert.equal(SEARCH_LIMIT, 20);
});

test("every listing returns the contract fields", () => {
  for (const sql of [listSql({}), listSql({ parent: 1 }), listSql({ q: "ab" }), featureSql(1)]) {
    assert.match(sql.text, /r\.id, r\.name, r\.level, r\.country, r\.parent_id, concat_ws\(' › ', g\.name, p\.name\) AS path/);
  }
  assert.match(featureSql(1).text, /r\.outline::json AS geometry/);
});

test("parseRegionsQuery", () => {
  assert.deepEqual(parseRegionsQuery({}), {});
  assert.deepEqual(parseRegionsQuery({ q: " si " }), { q: "si" });
  assert.deepEqual(parseRegionsQuery({ parent: "12" }), { parent: 12 });
  const bad = (q, re) => assert.throws(() => parseRegionsQuery(q), (e) => e instanceof BadRequest && re.test(e.message));
  bad({ q: "a" }, /2 to 100/);
  bad({ q: "x".repeat(101) }, /2 to 100/);
  bad({ parent: "abc" }, /parent/);
  bad({ q: "si", parent: "1" }, /q or parent/);
  bad({ q: ["si", "ci"] }, /2 to 100/);
});
