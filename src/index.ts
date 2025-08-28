import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectMongo } from "./db";
import { createServer } from "http";
import { initWebSocket } from "./ws";
import roomsRouter from "./routes/rooms";

const app = express();
app.use(express.json());
app.use(cors());

// Healthcheck simples
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// (Opcional) checar estado do Mongo
app.get("/dbcheck", (_req, res) => {
  const state = (require("mongoose") as typeof import("mongoose")).connection.readyState;
  res.json({ mongoState: state });
});

// Rotas REST
app.use("/api", roomsRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const httpServer = createServer(app);

async function bootstrap() {
  try {
    const uri = process.env.MONGODB_URI || "";
    await connectMongo(uri);
    // eslint-disable-next-line no-console
    console.log("MongoDB conectado com sucesso.");

    // Inicializa o WebSocket em cima do mesmo HTTP server
    initWebSocket(httpServer);

    httpServer.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`HTTP/WS ouvindo em http://localhost:${PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Falha ao iniciar:", err);
    process.exit(1);
  }
}

bootstrap();

process.on("SIGINT", async () => {
  // eslint-disable-next-line no-console
  console.log("Encerrando (SIGINT)...");
  const { disconnectMongo } = await import("./db");
  await disconnectMongo();
  process.exit(0);
});
