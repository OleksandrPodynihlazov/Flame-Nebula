import { pool } from "../db.js";
import { fillMonths, patternsSql, summarySql } from "../lib/patterns-sql.js";
import { isMissingTable } from "../lib/regions-sql.js";

// fire_patterns does not exist until harmonize/patterns.py runs: answer empty, not 500.
async function rowsOrEmpty(sql) {
  try {
    return (await pool.query(sql)).rows;
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

export async function getPatterns(filters, month) {
  return { month, cells: await rowsOrEmpty(patternsSql(filters, month)) };
}

export async function getPatternSummary(filters) {
  return { months: fillMonths(await rowsOrEmpty(summarySql(filters))) };
}
