import mongoose, { Schema, Document, Model } from "mongoose";

export type Cell = "" | "X" | "O";
export type Status = "waiting" | "active" | "x_won" | "o_won" | "draw";
export type Turn = "X" | "O";

/** Interface do documento */
export interface IRoom extends Document {
  room_id: string;
  player1_name?: string;
  player2_name?: string;
  board: Cell[]; // sempre 9 células
  turn: Turn;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
}

const cellValidator = (v: unknown): v is Cell =>
  v === "" || v === "X" || v === "O";

const boardValidator = (arr: unknown): arr is Cell[] =>
  Array.isArray(arr) && arr.length === 9 && arr.every(cellValidator);

const RoomSchema = new Schema<IRoom>(
  {
    room_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^[A-Za-z0-9_-]{4,32}$/, // simples e amigável para compartilhar
    },
    player1_name: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 30,
    },
    player2_name: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 30,
    },
    board: {
      type: [String],
      required: true,
      validate: {
        validator: boardValidator,
        message: "board deve ter 9 células contendo '', 'X' ou 'O'.",
      },
      default: Array(9).fill(""),
    },
    turn: {
      type: String,
      required: true,
      enum: ["X", "O"],
      default: "X", // criador começa como X
    },
    status: {
      type: String,
      required: true,
      enum: ["waiting", "active", "x_won", "o_won", "draw"],
      default: "waiting",
    },
  },
  { timestamps: true }
);

// Rejeita tentativa de criar sala com board/status inválidos
RoomSchema.pre("validate", function (next) {
  if (this.isNew) {
    // no ato da criação, forçamos as condições dos AC
    if (!boardValidator(this.board)) {
      this.board = Array(9).fill("");
    }
    if (this.status !== "waiting") {
      this.status = "waiting";
    }
    if (this.turn !== "X" && this.turn !== "O") {
      this.turn = "X";
    }
  }
  next();
});

export const Room: Model<IRoom> =
  mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);
export default Room;
