import { Router } from "express";
import { pool } from "../db.js";

async function checkDb() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}


const router = Router();

router.get("/health", async (req, res) => {
  const dbOk = await checkDb();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    version: process.env.APP_VERSION ?? "dev",
    db: dbOk ? "ok" : "down",
  });
});

export default router;
