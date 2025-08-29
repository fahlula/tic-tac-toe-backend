import { detectWinner } from "../logic/detectWinner";

type Cell = "" | "X" | "O";

describe("detectWinner", () => {
  test("vitória por linha (0,1,2)", () => {
    const board: Cell[] = ["X", "X", "X", "", "", "", "", "", ""];
    expect(detectWinner(board)).toBe("X");
  });

  test("vitória por linha (6,7,8)", () => {
    const board: Cell[] = ["", "", "", "", "", "", "O", "O", "O"];
    expect(detectWinner(board)).toBe("O");
  });

  test("vitória por coluna (0,3,6)", () => {
    const board: Cell[] = ["X", "", "", "X", "", "", "X", "", ""];
    expect(detectWinner(board)).toBe("X");
  });

  test("vitória por coluna (2,5,8)", () => {
    const board: Cell[] = ["", "", "O", "", "", "O", "", "", "O"];
    expect(detectWinner(board)).toBe("O");
  });

  test("vitória por diagonal (0,4,8)", () => {
    const board: Cell[] = ["X", "", "", "", "X", "", "", "", "X"];
    expect(detectWinner(board)).toBe("X");
  });

  test("vitória por diagonal (2,4,6)", () => {
    const board: Cell[] = ["", "", "O", "", "O", "", "O", "", ""];
    expect(detectWinner(board)).toBe("O");
  });

  test("empate (tabuleiro cheio, sem vencedor)", () => {
    // X O X
    // X O O
    // O X X
    const board: Cell[] = ["X","O","X","X","O","O","O","X","X"];
    expect(detectWinner(board)).toBe("draw");
  });

  test("jogo em andamento (sem vencedor, com casas vazias)", () => {
    const board: Cell[] = ["X", "", "", "", "O", "", "", "", ""];
    expect(detectWinner(board)).toBe(null);
  });
});
