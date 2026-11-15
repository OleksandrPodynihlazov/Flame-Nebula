import { Router } from "express";
import { selectionSummary } from "../controllers/summaryController.js";

const router = Router();

// Own path, outside /hotspots: the gateway's /api/hotspots concurrency limit does not apply.
router.get("/selection-summary", selectionSummary);

export default router;
