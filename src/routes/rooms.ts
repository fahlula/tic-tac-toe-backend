import { Router, type Request, type Response } from "express";
import Room from "../models/Room";

const router = Router();

/** Serializador padrão para não vazar detalhes internos do Mongoose */
function serializeRoom(doc: any) {
  return {
    room_id: doc.room_id,
    player1_name: doc.player1_name ?? null,
    player2_name: doc.player2_name ?? null,
    board: doc.board,
    turn: doc.turn,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * GET /api/rooms/open
 * Lista salas com status = "waiting" (públicas)
 * Query:
 *   - limit?: number (1..100)  default: 20
 */
router.get("/rooms/open", async (req: Request, res: Response) => {
  try {
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

    const rooms = await Room.find(
      { status: "waiting" },
      { _id: 0, room_id: 1, player1_name: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ items: rooms });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("GET /rooms/open error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/rooms/:roomId
 * Retorna snapshot completo de uma sala
 */
router.get("/rooms/:roomId", async (req: Request, res: Response) => {
  try {
    const rid = String(req.params.roomId || "").trim();
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
      return res.status(400).json({ error: "ROOM_ID_INVALID" });
    }

    const doc = await Room.findOne({ room_id: rid });
    if (!doc) return res.status(404).json({ error: "ROOM_NOT_FOUND" });

    return res.json(serializeRoom(doc));
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("GET /rooms/:roomId error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
