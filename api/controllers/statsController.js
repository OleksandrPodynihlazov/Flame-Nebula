import { requestFilters } from "../lib/filters.js";
import { getStats } from "../services/statsService.js";

export async function stats(req, res) {
  res.json(await getStats(await requestFilters(req.query)));
}
