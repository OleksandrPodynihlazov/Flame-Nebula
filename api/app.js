import express from "express";
import healthRouter from "./routes/health.js";

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use("/api", healthRouter);

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
