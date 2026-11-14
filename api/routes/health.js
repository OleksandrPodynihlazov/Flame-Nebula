import { Router } from "express";
import net from "node:net";

const router = Router();


function checkDb() {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(process.env.DATABASE_URL);
    } catch {
      return resolve(false); 
    }
    const socket = net.connect({ host: url.hostname, port: Number(url.port) || 5432 });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

router.get("/health", async (req, res) => {
  const dbOk = await checkDb();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    version: process.env.APP_VERSION ?? "dev",
    db: dbOk ? "ok" : "down",
  });
});

export default router;
