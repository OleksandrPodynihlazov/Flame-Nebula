import { requestFilters } from "../lib/filters.js";
import { parseCell } from "../lib/query.js";
import { getGrid } from "../services/gridService.js";
import { getHotspots, getHotspotsCsv } from "../services/hotspotsService.js";

export async function hotspots(req, res) {
  res.json(await getHotspots(await requestFilters(req.query)));
}

export async function hotspotsGrid(req, res) {
  const cell = parseCell(req.query);
  res.json(await getGrid(await requestFilters(req.query), cell));
}

export async function hotspotsCsv(req, res) {
  const filters = await requestFilters(req.query);
  const body = await getHotspotsCsv(filters);
  const from = filters.from ?? "all";
  const to = filters.to ?? "all";
  res.type("text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="hotspots_${from}_${to}.csv"`);
  res.send(body);
}
