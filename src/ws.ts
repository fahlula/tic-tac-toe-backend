import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import Room from "./models/Room";
import { generateRoomId, isValidName } from "./utils/helpers";

let io: Server | null = null;

function serializeRoom(doc: any) {
  return {
    room_id: doc.room_id,
    player1_name: doc.player1_name,
    player2_name: doc.player2_name,
    board: doc.board,
    turn: doc.turn,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
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

    // AC do Passo 6 (já implementado)
    socket.on("ping", () => socket.emit("pong"));

    /**
     * Evento: create_room
     * payload: { playerName?: string, roomId?: string }
     * - Gera room_id se não vier
     * - Criador é sempre 'X'
     * - Persiste no Mongo
     * - Responde com 'room_created' ou 'ws_error'
     */
    socket.on("create_room", async (payload: any) => {
      try {
        const { playerName, roomId } = payload ?? {};
        let p1 = typeof playerName === "string" ? playerName : "Player 1";
        if (!isValidName(p1)) p1 = "Player 1";

        // Gera/valida ID e garante unicidade
        let rid: string = typeof roomId === "string" ? roomId.trim() : generateRoomId();
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
          rid = generateRoomId();
        }
        // evita colisão (muito raro, mas melhor garantir)
        // tenta até achar um que não exista
        for (let i = 0; i < 5; i++) {
          // eslint-disable-next-line no-await-in-loop
          const exists = await Room.exists({ room_id: rid });
          if (!exists) break;
          rid = generateRoomId();
        }

        // cria documento com defaults do schema (board vazio, status=waiting, turn='X')
        const doc = await Room.create({
          room_id: rid,
          player1_name: p1.trim(),
        });

        // coloca o criador na "room" do Socket.IO e salva alguns dados na sessão
        await socket.join(rid);
        socket.data = { roomId: rid, symbol: "X", name: p1.trim() };

        // responde ao cliente
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
