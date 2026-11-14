import { pool } from "../db.js";
import { parseFilters } from "./query.js";
import { checkRegion } from "./regions-sql.js";

// Query string -> validated filters for every data endpoint: syntax first, then (for `region`)
// that the id exists, so an unknown region is a 400 and not a silently empty answer.
export async function requestFilters(query) {
  const filters = parseFilters(query);
  await checkRegion(filters, pool);
  return filters;
}
