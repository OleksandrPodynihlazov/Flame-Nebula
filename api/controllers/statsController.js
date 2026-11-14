import { getStats } from "../services/statsService.js";

export async function stats(req, res) {
  res.json(await getStats());
}
