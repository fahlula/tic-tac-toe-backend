import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectMongo } from "./db";

const app = express();
app.use(express.json());
app.use(cors());

// Healthcheck sem dependências externas
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// (Opcional) checar status do Mongo
app.get("/dbcheck", (_req, res) => {
  // usamos o estado global do mongoose
  const state = (require("mongoose") as typeof import("mongoose")).connection.readyState;
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  res.json({ mongoState: state });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function bootstrap() {
  try {
    // Conecta no Mongo antes de subir o servidor
    const uri = process.env.MONGODB_URI || "";
    await connectMongo(uri);
    // eslint-disable-next-line no-console
    console.log("MongoDB conectado com sucesso.");

    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Falha ao conectar no MongoDB:", err);
    process.exit(1); // não sobe sem DB em dev; opcional
  }
}

bootstrap();

// Encerramento gracioso
process.on("SIGINT", async () => {
  // eslint-disable-next-line no-console
  console.log("Encerrando (SIGINT)...");
  const { disconnectMongo } = await import("./db");
  await disconnectMongo();
  process.exit(0);
});
