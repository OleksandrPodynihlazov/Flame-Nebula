import { Router } from "express";
import { harmonized } from "../controllers/harmonizedController.js";

const router = Router();

router.get("/harmonized", harmonized);

export default router;
