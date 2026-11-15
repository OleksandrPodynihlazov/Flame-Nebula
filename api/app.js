import express from "express";
import healthRouter from "./routes/health.js";
import hotspotsRouter from "./routes/hotspots.js";
import statsRouter from "./routes/stats.js";
import calendarRouter from "./routes/calendar.js";
import regionsRouter from "./routes/regions.js";
import patternsRouter from "./routes/patterns.js";
import summaryRouter from "./routes/summary.js";
import { errorHandler } from "./lib/errors.js";

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use("/api", healthRouter);
app.use("/api", hotspotsRouter);
app.use("/api", statsRouter);
app.use("/api", calendarRouter);
app.use("/api", regionsRouter);
app.use("/api", patternsRouter);
app.use("/api", summaryRouter);

app.use((req, res) => {
  res.status(404).json({ error: `not found: ${req.path}` });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
