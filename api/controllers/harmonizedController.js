import { parseCountry } from "../lib/harmonized-sql.js";
import { getHarmonized } from "../services/harmonizedService.js";

export async function harmonized(req, res) {
  res.json(await getHarmonized(parseCountry(req.query)));
}
