import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPattern, listSql, featureSql, parseRegionsQuery, SEARCH_LIMIT, checkRegion, isMissingTable,
} from "../lib/regions-sql.js";

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
  const bad = (q, re) => assert.throws(() => parseRegionsQuery(q), (e) => e.status === 400 && re.test(e.message));
  bad({ q: "a" }, /2 to 100/);
  bad({ q: "x".repeat(101) }, /2 to 100/);
  bad({ parent: "abc" }, /parent/);
  bad({ q: "si", parent: "1" }, /q or parent/);
  bad({ q: ["si", "ci"] }, /2 to 100/);
});

test("checkRegion: only a region filter is checked, and an unknown id is a 400", async () => {
  const unknown = { query: async () => ({ rows: [] }) };
  const found = { query: async () => ({ rows: [{ id: 5 }] }) };
  const noTable = { query: async () => { throw Object.assign(new Error("no table"), { code: "42P01" }); } };
  const broken = { query: async () => { throw Object.assign(new Error("db down"), { code: "57P01" }); } };
  const fails = (e) => e.status === 400 && e.message === "unknown region: 5";

  await assert.rejects(checkRegion({ region: 5 }, unknown), fails);
  await assert.rejects(checkRegion({ region: 5 }, noTable), fails); // regions not loaded yet = unknown
  await assert.rejects(checkRegion({ region: 5 }, broken), /db down/); // other DB errors stay errors
  await checkRegion({ region: 5 }, found);
  await checkRegion({ region: null }, { query: async () => { throw new Error("must not query"); } });
});

test("isMissingTable", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "23505" }), false);
  assert.equal(isMissingTable(undefined), false);
});
