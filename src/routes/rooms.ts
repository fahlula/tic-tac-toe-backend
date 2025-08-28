import { Router } from "express";
import Room from "../models/Room";

const router = Router();

function generateRoomId(): string {
  // ID curto amigável (6-8 chars). Ajuste como quiser.
  return Math.random().toString(36).slice(2, 8);
}

function isValidName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 30) return false;
  // letras, números, espaço, _ e -
  return /^[\p{L}\p{N}\s_-]+$/u.test(trimmed);
}

/**
 * POST /api/rooms
 * body: { player1_name?: string, room_id?: string }
 * Rejeita campos proibidos (board/status/turn/player2_name) → 400
 * Gera room_id se não informado.
 * Cria sala com board vazio, status=waiting, turn=X.
 */
router.post("/rooms", async (req, res) => {
  const { room_id, player1_name, ...rest } = req.body ?? {};

  // Proibir manipular campos críticos na criação (AC: rejeitar dados errados)
  const forbidden = ["board", "status", "turn", "player2_name"];
  const invalidKeys = Object.keys(rest).filter((k) => forbidden.includes(k));
  if (invalidKeys.length) {
    return res
      .status(400)
      .json({ error: `Campos não permitidos: ${invalidKeys.join(", ")}` });
  }

  let roomId = typeof room_id === "string" ? room_id.trim() : generateRoomId();
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(roomId)) {
    return res
      .status(400)
      .json({ error: "room_id inválido (use 4–32 chars: letras, números, _ e -)" });
  }

  let p1 = typeof player1_name === "string" ? player1_name : "Player 1";
  if (!isValidName(p1)) {
    return res
      .status(400)
      .json({ error: "player1_name inválido (1–30, caracteres simples)" });
  }

  try {
    const existing = await Room.findOne({ room_id: roomId }).lean();
    if (existing) {
      return res.status(409).json({ error: "room_id já existe" });
    }

    const doc = await Room.create({
      room_id: roomId,
      player1_name: p1.trim(),
      // board/status/turn virão dos defaults e pre-validate
    });

    return res.status(201).json({
      room_id: doc.room_id,
      player1_name: doc.player1_name,
      board: doc.board,
      turn: doc.turn,
      status: doc.status,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: "Falha ao criar sala" });
  }
});

/** GET /api/rooms/:roomId — útil para depurar */
router.get("/rooms/:roomId", async (req, res) => {
  const doc = await Room.findOne({ room_id: req.params.roomId }).lean();
  if (!doc) return res.status(404).json({ error: "Sala não encontrada" });
  return res.json(doc);
});

export default router;
