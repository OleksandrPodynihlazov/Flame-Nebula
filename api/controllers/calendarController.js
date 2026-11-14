import { getCalendar } from "../services/calendarService.js";

export async function calendar(req, res) {
  res.json(await getCalendar());
}
