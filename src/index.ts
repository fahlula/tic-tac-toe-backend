import express, { type Request, type Response } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import { createServer } from "http";

import { connectMongo } from "./db";
import { initWebSocket } from "./ws";
import roomsRouter from "./routes/rooms";
import Room from "./models/Room"; // opcional: para syncIndexes()

/**
 * Utilitário: transforma FRONTEND_ORIGIN= "http://a,https://b"
 * em ["http://a","https://b"]
 */
function parseOrigins(list?: string | null): string[] {
  if (!list) return [];
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const app = express();

// Em Render/NGINX, permite que Express veja o IP real do cliente
app.set("trust proxy", 1);

/**
 * CORS
 * - Se ALLOW_ALL_ORIGINS=true => libera tudo (apenas para testes)
 * - Caso contrário, somente domínios listados em FRONTEND_ORIGIN
 * - Em dev, requests SEM Origin (Postman/cURL) são aceitas
 */
const allowAll = String(process.env.ALLOW_ALL_ORIGINS || "").toLowerCase() === "true";
const allowedOrigins = parseOrigins(process.env.FRONTEND_ORIGIN);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (allowAll) return callback(null, true);

    // Sem origin (Postman/cURL/healthchecks) -> permite em dev
    if (!origin) return callback(null, process.env.NODE_ENV !== "production");

    const ok = allowedOrigins.includes(origin);
    return ok ? callback(null, true) : callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());

/**
 * Rate limit HTTP (por IP)
 * RATE_WINDOW_MS: janela (ms)
 * RATE_MAX: máximo de requisições por janela
 */
const windowMs = Number(process.env.RATE_WINDOW_MS || 1000);
const max = Number(process.env.RATE_MAX || 20);

app.use(
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  })
);

app.use(express.json());

// Healthcheck simples
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// (Opcional) checar estado do Mongo
app.get("/dbcheck", (_req: Request, res: Response) => {
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

    // opcional: garantir índices (ex.: unique room_id)
    try {
      await Room.syncIndexes();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("syncIndexes falhou (não é crítico em dev):", (e as Error).message);
    }

    // eslint-disable-next-line no-console
    console.log("MongoDB conectado com sucesso.");

    // Inicializa o WebSocket em cima do mesmo HTTP server
    initWebSocket(httpServer);

    httpServer.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`HTTP/WS ouvindo em http://localhost:${PORT}`);
      // eslint-disable-next-line no-console
      if (allowAll) {
        console.log("CORS: ALLOW_ALL_ORIGINS=TRUE (apenas para testes)");
      } else if (allowedOrigins.length) {
        console.log("CORS liberado para:", allowedOrigins.join(", "));
      } else {
        console.log("CORS: nenhuma origem configurada (FRONTEND_ORIGIN vazia).");
      }
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
