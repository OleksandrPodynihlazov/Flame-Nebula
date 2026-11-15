import test from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "../lib/errors.js";

function run(err) {
  const req = { method: "GET", path: "/api/hotspots" };
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  const logged = [];
  const orig = console.error;
  console.error = (line) => logged.push(line);
  try {
    errorHandler(err, req, res, () => {});
  } finally {
    console.error = orig;
  }
  return { res, logged };
}

test("errorHandler: 500 -> generic body, one JSON log line with pg code", () => {
  const err = Object.assign(new Error('relation "hotspots_canonical" does not exist'), { code: "42P01" });
  const { res, logged } = run(err);
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { error: "internal error" });
  assert.equal(logged.length, 1);
  assert.deepEqual(JSON.parse(logged[0]), {
    level: "error", method: "GET", path: "/api/hotspots", status: 500,
    message: 'relation "hotspots_canonical" does not exist', code: "42P01",
  });
});

test("errorHandler: 4xx -> message in body, nothing logged", () => {
  const { res, logged } = run(Object.assign(new Error("bad from"), { status: 400 }));
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, { error: "bad from" });
  assert.equal(logged.length, 0);
});

test("errorHandler: non-Error throw -> 500, code null", () => {
  const { res, logged } = run("boom");
  assert.equal(res.code, 500);
  assert.equal(JSON.parse(logged[0]).code, null);
  assert.equal(JSON.parse(logged[0]).message, "boom");
});
