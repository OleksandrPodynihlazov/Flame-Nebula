import express from "express";
import healthRouter from "./routes/health.js";
import hotspotsRouter from "./routes/hotspots.js";
import statsRouter from "./routes/stats.js";

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use("/api", healthRouter);
app.use("/api", hotspotsRouter);
app.use("/api", statsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `not found: ${req.path}` });
});


app.use((err, req, res, next) => {
  const status = err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status < 500 ? err.message : "internal error" });
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
