import { requestFilters } from "../lib/filters.js";
import { getSelectionSummary } from "../services/summaryService.js";

export async function selectionSummary(req, res) {
  res.json(await getSelectionSummary(await requestFilters(req.query)));
}
