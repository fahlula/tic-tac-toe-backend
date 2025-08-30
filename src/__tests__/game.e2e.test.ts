import { io, Socket } from "socket.io-client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

jest.setTimeout(30000); // dá folga para eventos WS

type Cell = "" | "X" | "O";
type RoomState = {
  room_id: string;
  player1_name: string | null;
  player2_name: string | null;
  board: Cell[];
  turn: "X" | "O";
  status: "waiting" | "active" | "x_won" | "o_won" | "draw";
  createdAt: string;
  updatedAt: string;
};

function once<T = any>(socket: Socket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout esperando '${event}'`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function waitStateChange(sA: Socket, sB: Socket, lastUpdatedAt: string, timeoutMs = 8000): Promise<RoomState> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout esperando room_state mudar"));
    }, timeoutMs);

    const handler = (payload: RoomState) => {
      if (payload?.updatedAt && payload.updatedAt !== lastUpdatedAt) {
        cleanup();
        resolve(payload);
      }
      // se updatedAt for igual, ignoramos e seguimos esperando
    };

    const cleanup = () => {
      clearTimeout(t);
      sA.off("room_state", handler);
      sB.off("room_state", handler);
    };

    sA.on("room_state", handler);
    sB.on("room_state", handler);
  });
}

async function expectMoveOk(
  who: Socket,
  roomId: string,
  index: number,
  sA: Socket,
  sB: Socket,
  lastUpdatedAtRef: { v: string }
): Promise<RoomState> {
  // Se a jogada for inválida, falha mostrando o motivo
  const illegalP = once<any>(who, "illegal_move", 3000).then((e) => {
    throw new Error(`illegal_move: ${e?.code ?? "unknown"} ${e ? JSON.stringify(e) : ""}`);
  });

  who.emit("make_move", { roomId, index });
  const next = waitStateChange(sA, sB, lastUpdatedAtRef.v);
  const state = (await Promise.race([illegalP, next])) as RoomState;
  lastUpdatedAtRef.v = state.updatedAt; // avança o cursor
  return state;
}

describe("E2E - dois sockets jogando até o fim", () => {
  let sockA: Socket;
  let sockB: Socket;

  afterEach(async () => {
    if (sockA?.connected) sockA.disconnect();
    if (sockB?.connected) sockB.disconnect();
  });

  test("criar sala, entrar, jogar até X ganhar, reiniciar", async () => {
    // 0) Conecta (mandando Origin permitido)
    sockA = io(BASE_URL, {
      transports: ["websocket"],
      forceNew: true,
      extraHeaders: { Origin: CLIENT_ORIGIN },
    });
    sockB = io(BASE_URL, {
      transports: ["websocket"],
      forceNew: true,
      extraHeaders: { Origin: CLIENT_ORIGIN },
    });

    // (debug opcional)
    sockA.once("connect_error", (err: any) => console.error("sockA connect_error:", err?.message || err));
    sockB.once("connect_error", (err: any) => console.error("sockB connect_error:", err?.message || err));

    await Promise.all([once(sockA, "connect"), once(sockB, "connect")]);

    // 1) Ping/pong só valida canal
    sockA.emit("ping", {});
    await once(sockA, "pong");

    // 2) A cria sala (ganha X e já entra)
    sockA.emit("create_room", { playerName: "Alice" });
    const created = await once<{ roomId: string; assigned: "X" }>(sockA, "room_created");
    expect(created.assigned).toBe("X");
    const roomId = created.roomId;

    // 3) B entra (vira O)
    sockB.emit("join_room", { roomId, playerName: "Bob" });
    const joined = await once<{ roomId: string; assigned: "O" }>(sockB, "room_joined");
    expect(joined.assigned).toBe("O");

    // 4) snapshot ativo (turn = X)
    const stateActive = await once<RoomState>(sockA, "room_state");
    expect(stateActive.status).toBe("active");
    expect(stateActive.turn).toBe("X");
    let cursor = { v: stateActive.updatedAt };

    // 5) sequência para X vencer na linha 0: X:0, O:3, X:1, O:4, X:2
    // X joga 0
    let s = await expectMoveOk(sockA, roomId, 0, sockA, sockB, cursor);
    expect(s.board[0]).toBe("X");
    expect(s.turn).toBe("O");

    // O joga 3
    s = await expectMoveOk(sockB, roomId, 3, sockA, sockB, cursor);
    expect(s.board[3]).toBe("O");
    expect(s.turn).toBe("X");

    // X joga 1
    s = await expectMoveOk(sockA, roomId, 1, sockA, sockB, cursor);
    expect(s.board[1]).toBe("X");
    expect(s.turn).toBe("O");

    // O joga 4
    s = await expectMoveOk(sockB, roomId, 4, sockA, sockB, cursor);
    expect(s.board[4]).toBe("O");
    expect(s.turn).toBe("X");

    // X joga 2 -> deve vencer
    const gameOverP = once<{ status: "x_won" | "o_won" | "draw" }>(sockA, "game_over", 8000);
    s = await expectMoveOk(sockA, roomId, 2, sockA, sockB, cursor);
    expect(s.board[2]).toBe("X");
    const over = await gameOverP;
    expect(over.status).toBe("x_won");

    // 6) reiniciar
    sockA.emit("restart", { roomId });
    await once(sockA, "restarted", 8000);
    const afterRestart = await waitStateChange(sockA, sockB, cursor.v, 8000);
    expect(afterRestart.status).toBe("active");
    expect(afterRestart.turn).toBe("X");
    expect(afterRestart.board).toEqual(["", "", "", "", "", "", "", "", ""]);
  });
});
