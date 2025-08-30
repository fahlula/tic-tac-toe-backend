import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import Room from "./models/Room";
import {
  generateRoomId,
  isValidName,
  isValidIndex,
  nextTurn,
  sameName,
  sanitizeName,
} from "./utils/helpers";
import { detectWinner } from "./logic/detectWinner";
import { attachSocketRateLimiter } from "./wslimiter";

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

export function getIO() {
  if (!io) throw new Error("Socket.IO não foi inicializado ainda");
  return io;
}

async function broadcastState(roomId: string) {
  const doc = await Room.findOne({ room_id: roomId });
  if (!doc) return;
  getIO().to(roomId).emit("room_state", serializeRoom(doc));
}

export function initWebSocket(httpServer: HttpServer) {
  const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(",").map((s) => s.trim()) || "*";

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    const eps = Number(process.env.WS_EVENTS_PER_SEC || 20);
    const burst = Number(process.env.WS_BURST || 40);
    attachSocketRateLimiter(socket, eps, burst);
    console.log("WS connected:", socket.id);

    // --- ping/pong
    socket.on("ping", () => socket.emit("pong"));

    // --- create_room
    socket.on("create_room", async (payload: any) => {
      try {
        const { playerName, roomId } = payload ?? {};
        let p1 = typeof playerName === "string" ? sanitizeName(playerName) : "Player 1";
        if (!isValidName(p1)) p1 = "Player 1";

        let rid: string = typeof roomId === "string" ? roomId.trim() : generateRoomId();
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) rid = generateRoomId();

        // evita colisões (raras)
        for (let i = 0; i < 5; i++) {
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
        console.error("create_room error:", err);
        socket.emit("ws_error", {
          code: "CREATE_ROOM_FAILED",
          message: "Falha ao criar sala",
          detail: err?.message ?? String(err),
        });
      }
    });

    // --- join_room
    /**
     * payload: { roomId: string, playerName?: string }
     */
    socket.on("join_room", async (payload: any) => {
      try {
        const { roomId, playerName } = payload ?? {};
        const rid = typeof roomId === "string" ? roomId.trim() : "";
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
          return socket.emit("ws_error", { code: "ROOM_ID_INVALID", message: "roomId inválido" });
        }

        let p2 = typeof playerName === "string" ? sanitizeName(playerName) : "Player 2";
        if (!isValidName(p2)) p2 = "Player 2";

        const updated = await Room.findOneAndUpdate(
          {
            room_id: rid,
            status: "waiting",
            $or: [
              { player2_name: { $exists: false } },
              { player2_name: null },
              { player2_name: "" },
            ],
          },
          { $set: { player2_name: p2.trim(), status: "active" } },
          { new: true },
        );

        if (!updated) {
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

        socket.emit("room_joined", { roomId: updated.room_id, assigned: "O" });
        await broadcastState(rid);
      } catch (err: any) {
        console.error("join_room error:", err);
        socket.emit("ws_error", {
          code: "JOIN_ROOM_FAILED",
          message: "Falha ao entrar na sala",
          detail: err?.message ?? String(err),
        });
      }
    });

    // --- rejoin_room
    /**
     * payload: { roomId: string, playerName: string }
     */
    socket.on("rejoin_room", async (payload: any) => {
      try {
        const { roomId, playerName } = payload ?? {};
        const rid = typeof roomId === "string" ? roomId.trim() : "";
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
          return socket.emit("ws_error", { code: "ROOM_ID_INVALID", message: "roomId inválido" });
        }
        if (!isValidName(playerName)) {
          return socket.emit("ws_error", { code: "NAME_INVALID", message: "Nome inválido" });
        }

        const doc = await Room.findOne({ room_id: rid }).lean();
        if (!doc) {
          return socket.emit("ws_error", {
            code: "ROOM_NOT_FOUND",
            message: "Sala não encontrada",
          });
        }

        let assigned: "X" | "O" | null = null;
        if (sameName(playerName, doc.player1_name)) assigned = "X";
        else if (sameName(playerName, doc.player2_name)) assigned = "O";

        if (!assigned) {
          return socket.emit("ws_error", {
            code: "NAME_NOT_MATCH",
            message: "Nome não corresponde a nenhum jogador desta sala",
          });
        }

        await socket.join(rid);
        socket.data = { roomId: rid, symbol: assigned, name: sanitizeName(playerName) };

        socket.emit("rejoined", { roomId: rid, assigned });
        await broadcastState(rid);
      } catch (err: any) {
        console.error("rejoin_room error:", err);
        socket.emit("ws_error", {
          code: "REJOIN_ERROR",
          message: "Falha ao reentrar na sala",
          detail: err?.message ?? String(err),
        });
      }
    });

    // --- make_move
    /**
     * payload: { roomId: string, index: number }
     */
    socket.on("make_move", async (payload: any) => {
      try {
        const { roomId, index } = payload ?? {};
        const rid = typeof roomId === "string" ? roomId.trim() : "";
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
          return socket.emit("illegal_move", { code: "ROOM_ID_INVALID" });
        }
        if (!isValidIndex(index)) {
          return socket.emit("illegal_move", { code: "INDEX_INVALID" });
        }

        const myRoomId = socket.data?.roomId;
        const mySymbol = socket.data?.symbol as "X" | "O" | undefined;
        if (!myRoomId || myRoomId !== rid || (mySymbol !== "X" && mySymbol !== "O")) {
          return socket.emit("illegal_move", { code: "NOT_IN_ROOM" });
        }

        const path = `board.${index}`;
        const filter: any = { room_id: rid, status: "active", turn: mySymbol };
        (filter as any)[path] = ""; // célula deve estar vazia

        const update = {
          $set: { [path]: mySymbol, turn: nextTurn(mySymbol) },
          $currentDate: { updatedAt: true },
        };

        const updated = await Room.findOneAndUpdate(filter, update, { new: true });

        if (!updated) {
          const doc = await Room.findOne({ room_id: rid }).lean();
          if (!doc) return socket.emit("illegal_move", { code: "ROOM_NOT_FOUND" });
          if (doc.status !== "active")
            return socket.emit("illegal_move", { code: "GAME_NOT_ACTIVE", status: doc.status });
          if (doc.turn !== mySymbol)
            return socket.emit("illegal_move", { code: "NOT_YOUR_TURN", expected: doc.turn });
          if (doc.board?.[index] !== "")
            return socket.emit("illegal_move", { code: "CELL_OCCUPIED" });
          return socket.emit("illegal_move", { code: "MOVE_REJECTED" });
        }

        // checa fim de jogo
        const outcome = detectWinner(updated.board as any);
        if (outcome) {
          let newStatus: "x_won" | "o_won" | "draw" = "draw";
          if (outcome === "X") newStatus = "x_won";
          else if (outcome === "O") newStatus = "o_won";

          const finished = await Room.findOneAndUpdate(
            { room_id: rid, status: "active" },
            { $set: { status: newStatus }, $currentDate: { updatedAt: true } },
            { new: true },
          );
          if (finished) {
            getIO().to(rid).emit("game_over", { status: finished.status });
          }
        }

        await broadcastState(rid);
      } catch (err: any) {
        console.error("make_move error:", err);
        socket.emit("ws_error", {
          code: "MAKE_MOVE_FAILED",
          message: "Falha ao processar jogada",
          detail: err?.message ?? String(err),
        });
      }
    });

    // --- restart
    socket.on("restart", async (payload: any) => {
      try {
        const { roomId } = payload ?? {};
        const rid = typeof roomId === "string" ? roomId.trim() : "";
        if (!/^[A-Za-z0-9_-]{4,32}$/.test(rid)) {
          return socket.emit("ws_error", { code: "ROOM_ID_INVALID", message: "roomId inválido" });
        }

        const myRoomId = socket.data?.roomId;
        if (!myRoomId || myRoomId !== rid) {
          return socket.emit("ws_error", {
            code: "NOT_IN_ROOM",
            message: "Você não está na sala informada",
          });
        }

        const exists = await Room.findOne({
          room_id: rid,
          player1_name: { $exists: true, $ne: "" },
          player2_name: { $exists: true, $ne: "" },
        }).lean();
        if (!exists) {
          return socket.emit("ws_error", {
            code: "ROOM_NOT_READY",
            message: "Sala inexistente ou sem dois jogadores",
          });
        }

        const updated = await Room.findOneAndUpdate(
          { room_id: rid },
          {
            $set: { board: Array(9).fill(""), status: "active", turn: "X" },
            $currentDate: { updatedAt: true },
          },
          { new: true },
        );
        if (!updated) {
          return socket.emit("ws_error", {
            code: "RESTART_FAILED",
            message: "Não foi possível reiniciar a sala",
          });
        }

        socket.emit("restarted", { roomId: rid });
        await broadcastState(rid);
      } catch (err: any) {
        console.error("restart error:", err);
        socket.emit("ws_error", {
          code: "RESTART_ERROR",
          message: "Erro ao reiniciar a sala",
          detail: err?.message ?? String(err),
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("WS disconnected:", socket.id, reason);
    });
  });

  return io;
}
