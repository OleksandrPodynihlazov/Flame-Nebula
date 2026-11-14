import { Router } from "express";
import { hotspots, hotspotsCsv } from "../controllers/hotspotsController.js";

const router = Router();

router.get("/hotspots", hotspots);
router.get("/hotspots.csv", hotspotsCsv);

export default router;
