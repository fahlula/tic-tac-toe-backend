import express from "express";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import { connectMongo } from "./db";
import { createServer } from "http";
import { initWebSocket } from "./ws";
import roomsRouter from "./routes/rooms";
import Room from "./models/Room"; // opcional: para syncIndexes()

const app = express();

// Em Render/NGINX, permite que Express veja o IP real do cliente
app.set("trust proxy", 1);

/**
 * CORS: somente os domínios informados em FRONTEND_ORIGIN podem acessar via browser.
 * Em dev, requisições SEM Origin (ex.: Postman/cURL) são permitidas.
 * Implementação resiliente: não lança erro (evita 500); apenas omite os headers CORS.
 */
const rawOrigins =
  process.env.FRONTEND_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean) || [];

// normaliza (minúsculas, sem barra final)
const normalize = (s?: string) => (s ? s.toLowerCase().replace(/\/$/, "") : s);
const allowedSet = new Set(rawOrigins.map(normalize));

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Sem Origin (Postman, cURL, healthchecks): permite em DEV, bloqueia em PROD
    if (!origin) {
      const allowNoOrigin = process.env.NODE_ENV !== "production";
      return callback(null, allowNoOrigin);
    }

    const norm = normalize(origin);

    // aceita equivalência localhost <-> 127.0.0.1
    const variants = new Set<string>();
    if (norm) {
      variants.add(norm);
      variants.add(norm.replace("127.0.0.1", "localhost"));
      variants.add(norm.replace("localhost", "127.0.0.1"));
    }

    // se qualquer variante estiver na lista permitida, libera
    const ok = [...variants].some((v) => allowedSet.has(v));

    // NÃO lançar erro: ok => adiciona headers; !ok => sem headers (navegador bloqueia)
    return callback(null, ok);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 204, // melhor para preflight antigo
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
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// (Opcional) checar estado do Mongo
app.get("/dbcheck", (_req, res) => {
  const state =
    (require("mongoose") as typeof import("mongoose")).connection.readyState;
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

    // opcional: garantir índices únicos em produção (room_id)
    try {
      await Room.syncIndexes();
    } catch (e) {
      console.warn("syncIndexes falhou (não é crítico em dev):", (e as Error).message);
    }

    console.log("MongoDB conectado com sucesso.");

    // Inicializa o WebSocket em cima do mesmo HTTP server
    initWebSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`HTTP/WS ouvindo em http://localhost:${PORT}`);
      const list = [...allowedSet];
      if (list.length) {
        console.log("CORS liberado para:", list.join(", "));
      } else {
        console.log("CORS: nenhuma origem configurada (FRONTEND_ORIGIN vazia).");
      }
    });
  } catch (err) {
    console.error("Falha ao iniciar:", err);
    process.exit(1);
  }
}

bootstrap();

process.on("SIGINT", async () => {
  console.log("Encerrando (SIGINT)...");
  const { disconnectMongo } = await import("./db");
  await disconnectMongo();
  process.exit(0);
});
