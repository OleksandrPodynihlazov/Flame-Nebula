import { Router } from "express";
import { patternSummary, patterns } from "../controllers/patternsController.js";

const router = Router();

router.get("/patterns", patterns);
router.get("/patterns/summary", patternSummary);

export default router;
