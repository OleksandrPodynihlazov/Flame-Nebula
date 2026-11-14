import { Router } from "express";
import { calendar } from "../controllers/calendarController.js";

const router = Router();

router.get("/calendar", calendar);

export default router;
