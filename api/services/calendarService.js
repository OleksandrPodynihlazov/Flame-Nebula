import { pool } from "../db.js";

// GET /api/calendar → { days: [{ date: "YYYY-MM-DD", count }] } (docs/contracts.md [3]).
// Days sorted ascending; days with no hotspots are simply absent (GROUP BY only returns
// days that have rows), as the frontend requirements ask. Empty table → { days: [] }.
// The frontend builds the month × day grid, month totals and peak month from this list.
export async function getCalendar() {
  const { rows } = await pool.query(
    `SELECT acq_date AS date, COUNT(*) AS count
       FROM hotspots
      GROUP BY acq_date
      ORDER BY acq_date`
  );
  return { days: rows };
}
