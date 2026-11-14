import { requestFilters } from "../lib/filters.js";
import { getCalendar } from "../services/calendarService.js";

export async function calendar(req, res) {
  res.json(await getCalendar(await requestFilters(req.query)));
}
