import { Router } from "express";
import { hotspots } from "../controllers/hotspotsController.js";

const router = Router();

router.get("/hotspots", hotspots);

export default router;
