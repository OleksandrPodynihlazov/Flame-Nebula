import { requestFilters } from "../lib/filters.js";
import { parseMonth } from "../lib/patterns-sql.js";
import { getPatternSummary, getPatterns } from "../services/patternsService.js";

export async function patterns(req, res) {
  const month = parseMonth(req.query);
  res.json(await getPatterns(await requestFilters(req.query), month));
}

export async function patternSummary(req, res) {
  res.json(await getPatternSummary(await requestFilters(req.query)));
}
