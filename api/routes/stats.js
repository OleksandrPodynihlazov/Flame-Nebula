import { Router } from "express";
import { stats } from "../controllers/statsController.js";

const router = Router();

router.get("/stats", stats);

export default router;
