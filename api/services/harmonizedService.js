import { pool } from "../db.js";
import { harmonizedSql } from "../lib/harmonized-sql.js";
import { isMissingTable } from "../lib/regions-sql.js";

// 42703 undefined_column: a DB still holding the old Italy-only harmonized_monthly (a view without
// `country`), from before calibrate.py fitted per country. Re-running calibrate.py replaces it.
const UNDEFINED_COLUMN = "42703";

// harmonized_monthly missing or still in its old shape until harmonize/calibrate.py runs: answer empty, not 500.
export async function getHarmonized(country) {
  try {
    const { rows } = await pool.query(harmonizedSql(country));
    return { country, months: rows };
  } catch (err) {
    if (isMissingTable(err) || err?.code === UNDEFINED_COLUMN) return { country, months: [] };
    throw err;
  }
}
