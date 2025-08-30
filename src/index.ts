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

// -------- CORS com fallback seguro --------
const isProd = process.env.NODE_ENV === "production";
const allowAll = String(process.env.ALLOW_ALL_ORIGINS || "").toLowerCase() === "true";

// normaliza (minúsculas, sem barra final)
const normalize = (s?: string) => (s ? s.toLowerCase().replace(/\/$/, "") : s);

// se FRONTEND_ORIGIN faltar:
//  - em DEV: libera localhost:5173 e 127.0.0.1:5173
//  - em PROD: não libera nada (a menos que ALLOW_ALL_ORIGINS=true)
const defaultDevOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const rawOrigins =
  process.env.FRONTEND_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean) ||
  (!isProd ? defaultDevOrigins : []);

const allowedSet = new Set(rawOrigins.map(normalize));

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (allowAll) {
      // Libera tudo (use só para teste!)
      return callback(null, true);
    }
    // Sem Origin (Postman/cURL/healthcheck): permite em dev, bloqueia em prod
    if (!origin) {
      return callback(null, !isProd);
    }
    const norm = normalize(origin);
    // aceita equivalência localhost <-> 127.0.0.1
    const candidates = new Set<string>();
    if (norm) {
      candidates.add(norm);
      candidates.add(norm.replace("127.0.0.1", "localhost"));
      candidates.add(norm.replace("localhost", "127.0.0.1"));
    }
    const ok = [...candidates].some((v) => allowedSet.has(v));
    // não lança erro (evita 500); só omite os headers se não ok
    return callback(null, ok);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(helmet());

// -------- Rate limit HTTP --------
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

      if (allowAll) {
        console.warn("CORS: ALLOW_ALL_ORIGINS=true (tudo liberado) — use apenas em teste!");
      } else {
        const list = [...allowedSet];
        if (list.length) {
          console.log("CORS liberado para:", list.join(", "));
        } else if (!isProd) {
          console.log("CORS (dev fallback): liberado para", defaultDevOrigins.join(", "));
        } else {
          console.warn(
            "CORS: FRONTEND_ORIGIN não definido em produção — nenhuma origem liberada (navegadores serão bloqueados)."
          );
        }
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
