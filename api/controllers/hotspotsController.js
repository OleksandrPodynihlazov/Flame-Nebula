import { parseFilters } from "../lib/query.js";
import { getHotspots, getHotspotsCsv } from "../services/hotspotsService.js";

export async function hotspots(req, res) {
  res.json(await getHotspots(parseFilters(req.query)));
}

export async function hotspotsCsv(req, res) {
  const filters = parseFilters(req.query);
  const body = await getHotspotsCsv(filters);
  const from = filters.from ?? "all";
  const to = filters.to ?? "all";
  res.type("text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="hotspots_${from}_${to}.csv"`);
  res.send(body);
}
