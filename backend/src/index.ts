import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import authRoutes from "./routes/authRoutes";
import radarRoutes from "./routes/radarRoutes";
import { attachWebSocketServer } from "./services/whaleWatcher";
import { initTelegramBot } from "./services/telegramBot";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "whale-radar-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/radar", radarRoutes);

const PORT = Number(process.env.PORT) || 4000;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

attachWebSocketServer(wss);
initTelegramBot();

server.listen(PORT, () => {
  console.log(`[WhaleRadar] Server + WS listening on http://localhost:${PORT}`);
});

