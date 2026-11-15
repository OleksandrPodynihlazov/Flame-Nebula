import { requestFilters } from "../lib/filters.js";
import { parseMinProbability, parseMonth } from "../lib/patterns-sql.js";
import { getPatternSummary, getPatterns } from "../services/patternsService.js";

export async function patterns(req, res) {
  const month = parseMonth(req.query);
  const min = parseMinProbability(req.query);
  res.json(await getPatterns(await requestFilters(req.query), month, min));
}

export async function patternSummary(req, res) {
  const min = parseMinProbability(req.query);
  res.json(await getPatternSummary(await requestFilters(req.query), min));
}
