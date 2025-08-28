import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import Room from "./models/Room";
import { generateRoomId, isValidName } from "./utils/helpers";

let io: Server | null = null;

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

async function broadcastState(roomId: string) {
  const doc = await Room.findOne({ room_id: roomId });
  if (!doc) return;
  getIO().to(roomId).emit("room_state", serializeRoom(doc));
}

export function initWebSocket(httpServer: HttpServer) {
  const allowedOrigins =
    process.env.FRONTEND_ORIGIN?.split(",").map((s) => s.trim()) || "*";

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    // eslint-disable-next-line no-console
    console.log("WS connected:", socket.id);

    // --- ping/pong (Passo 6)
    socket.on("ping", () => socket.emit("pong"));

    // --- create_room (Passo 7)
    socket.on("create_room", async (payload: any) => {
      try {
        const { playerName, roomId } = payload ?? {};
        let p1 = typeof playerName === "string" ? playerName : "Player 1";
        if (!isValidName(p1)) p1 = "Player 1";

        let rid: string = typeof roomId === "string" ? roomId.trim() : generateRoomId();
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
          rid = generateRoomId();
        }
        for (let i = 0; i < 5; i++) {
          // eslint-disable-next-line no-await-in-loop
          const exists = await Room.exists({ room_id: rid });
          if (!exists) break;
          rid = generateRoomId();
        }

        const doc = await Room.create({
          room_id: rid,
          player1_name: p1.trim(),
        });

        await socket.join(rid);
        socket.data = { roomId: rid, symbol: "X", name: p1.trim() };

        socket.emit("room_created", {
          roomId: doc.room_id,
          assigned: "X",
          state: serializeRoom(doc),
        });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("create_room error:", err);
        socket.emit("ws_error", {
          code: "CREATE_ROOM_FAILED",
          message: "Falha ao criar sala",
          detail: err?.message ?? String(err),
        });
      }
    });

    // --- join_room (Passo 8)
    /**
     * Evento: join_room
     * payload: { roomId: string, playerName?: string }
     * Regras:
     *  - Sala deve existir e estar waiting
     *  - player2_name é setado e status vira active
     *  - Jogador que entra recebe 'assigned: "O"'
     *  - Broadcast do estado inicial para a sala inteira (room_state)
     */
    socket.on("join_room", async (payload: any) => {
      try {
        const { roomId, playerName } = payload ?? {};
        const rid = typeof roomId === "string" ? roomId.trim() : "";
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
          return socket.emit("ws_error", {
            code: "ROOM_ID_INVALID",
            message: "roomId inválido",
          });
        }

        let p2 = typeof playerName === "string" ? playerName : "Player 2";
        if (!isValidName(p2)) p2 = "Player 2";

        // Atualização atômica: só entra se a sala estiver waiting e sem player2_name
        const updated = await Room.findOneAndUpdate(
          {
            room_id: rid,
            status: "waiting",
            $or: [{ player2_name: { $exists: false } }, { player2_name: null }, { player2_name: "" }],
          },
          { $set: { player2_name: p2.trim(), status: "active" } },
          { new: true }
        );

        if (!updated) {
          // sala não existe, já está ativa ou está cheia
          const exists = await Room.exists({ room_id: rid });
          if (!exists) {
            return socket.emit("ws_error", {
              code: "ROOM_NOT_FOUND",
              message: "Sala não encontrada",
            });
          }
          const doc = await Room.findOne({ room_id: rid }).lean();
          if (doc?.status !== "waiting" || doc?.player2_name) {
            return socket.emit("ws_error", {
              code: "ROOM_FULL",
              message: "Sala cheia ou já ativa",
            });
          }
          return socket.emit("ws_error", {
            code: "JOIN_FAILED",
            message: "Não foi possível entrar na sala",
          });
        }

        await socket.join(rid);
        socket.data = { roomId: rid, symbol: "O", name: p2.trim() };

        // Notifica o jogador que entrou
        socket.emit("room_joined", {
          roomId: updated.room_id,
          assigned: "O",
        });

        // Broadcast do estado inicial para os dois jogadores
        await broadcastState(rid);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("join_room error:", err);
        socket.emit("ws_error", {
          code: "JOIN_ROOM_FAILED",
          message: "Falha ao entrar na sala",
          detail: err?.message ?? String(err),
        });
      }
    });

    socket.on("disconnect", (reason) => {
      // eslint-disable-next-line no-console
      console.log("WS disconnected:", socket.id, reason);
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.IO não foi inicializado ainda");
  return io;
}
