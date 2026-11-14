import { getHotspots } from "../services/hotspotsService.js";

export async function hotspots(req, res) {
  res.json(await getHotspots());
}
