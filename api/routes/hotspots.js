import { Router } from "express";
import { hotspots, hotspotsCsv, hotspotsGrid } from "../controllers/hotspotsController.js";

const router = Router();

router.get("/hotspots", hotspots);
router.get("/hotspots.csv", hotspotsCsv);
// Express 5 matches whole paths, so "/hotspots" never catches "/hotspots/grid".
router.get("/hotspots/grid", hotspotsGrid);

export default router;
