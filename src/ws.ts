import type { Server as HttpServer } from "http";
import { Server } from "socket.io";

let io: Server | null = null;

export function initWebSocket(httpServer: HttpServer) {
  const allowedOrigins =
    process.env.FRONTEND_ORIGIN?.split(",").map((s) => s.trim()) || "*";

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins, // em dev pode deixar "*"; depois limite ao frontend
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    // eslint-disable-next-line no-console
    console.log("WS connected:", socket.id);

    // AC: receber 'ping' e responder 'pong'
    socket.on("ping", () => {
      socket.emit("pong");
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
