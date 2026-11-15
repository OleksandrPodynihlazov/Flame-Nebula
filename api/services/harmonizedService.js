import { pool } from "../db.js";
import { harmonizedSql } from "../lib/harmonized-sql.js";
import { isMissingTable } from "../lib/regions-sql.js";

// harmonized_monthly does not exist until harmonize/calibrate.py runs: answer empty, not 500.
export async function getHarmonized(country) {
  try {
    const { rows } = await pool.query(harmonizedSql(country));
    return { country, months: rows };
  } catch (err) {
    if (isMissingTable(err)) return { country, months: [] };
    throw err;
  }
}
