import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(express.json());
app.use(cors());

// rota simples provisória (só para validar que o servidor sobe)
app.get("/", (_req, res) => {
  res.send({ ok: true, message: "Tic-Tac-Toe backend running" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
