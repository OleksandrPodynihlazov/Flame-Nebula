// SQL for /api/regions (docs/contracts.md [3]). Values are always bound params.
import { httpError } from "./query.js";
import { normName } from "./names.js";

export const SEARCH_LIMIT = 20;

const FIELDS = "r.id, r.name, r.level, r.country, r.parent_id, concat_ws(' › ', g.name, p.name) AS path";
const FROM = "FROM regions r LEFT JOIN regions p ON p.id = r.parent_id LEFT JOIN regions g ON g.id = p.parent_id";

// LIKE pattern body for a user query: normalized, wildcards and the escape char made literal.
export function searchPattern(q) {
  return normName(q).replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function parseRegionsQuery(query) {
  const hasQ = query.q !== undefined;
  const hasParent = query.parent !== undefined;
  if (hasQ && hasParent) throw httpError("Send q or parent, not both");
  if (hasQ) {
    const q = typeof query.q === "string" ? query.q.trim() : "";
    if (q.length < 2 || q.length > 100) throw httpError("q must be 2 to 100 characters");
    return { q };
  }
  if (hasParent) {
    if (typeof query.parent !== "string" || !/^\d+$/.test(query.parent) || Number(query.parent) > 2147483647) {
      throw httpError("parent must be a positive integer id");
    }
    return { parent: Number(query.parent) };
  }
  return {};
}

export function listSql({ q, parent } = {}) {
  if (q !== undefined) {
    return {
      text:
        `SELECT ${FIELDS} ${FROM} WHERE r.name_norm LIKE '%' || $1 || '%' ESCAPE '\\' ` +
        `ORDER BY (r.name_norm LIKE $1 || '%' ESCAPE '\\') DESC, r.level, r.name LIMIT ${SEARCH_LIMIT}`,
      values: [searchPattern(q)],
    };
  }
  if (parent !== undefined) {
    return { text: `SELECT ${FIELDS} ${FROM} WHERE r.parent_id = $1 ORDER BY r.name`, values: [parent] };
  }
  return { text: `SELECT ${FIELDS} ${FROM} WHERE r.level = 0 ORDER BY r.name`, values: [] };
}

export function featureSql(id) {
  return { text: `SELECT ${FIELDS}, r.outline::json AS geometry ${FROM} WHERE r.id = $1`, values: [id] };
}

export function isMissingTable(err) {
  return err?.code === "42P01"; // undefined_table: ingest/load_regions.py has not run on this DB yet
}

// An unknown region id is a bad parameter (400), not an empty result. `filters` come from parseFilters.
export async function checkRegion(filters, db) {
  if (!filters.region) return;
  let rows = [];
  try {
    ({ rows } = await db.query({ text: "SELECT 1 FROM regions WHERE id = $1", values: [filters.region] }));
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  if (!rows.length) throw httpError(`unknown region: ${filters.region}`);
}
