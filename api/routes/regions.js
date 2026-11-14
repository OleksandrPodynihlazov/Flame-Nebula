import { Router } from "express";
import { pool } from "../db.js";
import { httpError } from "../lib/query.js";
import { featureSql, isMissingTable, listSql, parseRegionsQuery } from "../lib/regions-sql.js";

const router = Router();

// Countries (no params), children (?parent=<id>) or search (?q=<text>).
// The regions table does not exist until ingest/load_regions.py runs: then the list is empty.
router.get("/regions", async (req, res) => {
  const params = parseRegionsQuery(req.query);
  try {
    const { rows } = await pool.query(listSql(params));
    res.json({ regions: rows });
  } catch (err) {
    if (isMissingTable(err)) return res.json({ regions: [] });
    throw err;
  }
});

// One region as a GeoJSON Feature with its simplified outline, for the map.
router.get("/regions/:id", async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id) || Number(id) > 2147483647) throw httpError("region id must be a positive integer");
  let rows = [];
  try {
    ({ rows } = await pool.query(featureSql(Number(id))));
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  if (!rows.length) return res.status(404).json({ error: `region not found: ${id}` });
  const { geometry, ...properties } = rows[0];
  res.json({ type: "Feature", id: properties.id, geometry, properties });
});

export default router;
