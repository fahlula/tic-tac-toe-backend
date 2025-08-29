// Tipos locais para não criar dependência do model
export type Cell = "" | "X" | "O";
export type Outcome = "X" | "O" | "draw" | null;

/**
 * Retorna:
 *  - "X" | "O"  → vitória
 *  - "draw"     → empate (todas as células preenchidas, sem vitória)
 *  - null       → jogo continua
 */
export function detectWinner(board: Cell[]): Outcome{
    if (!Array.isArray(board) || board.length !== 9) return null;
    const lines: [number, number, number][] = [
        // linhas
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        // colunas
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        //diagonais
        [0, 4, 8],
        [2, 4, 6],
    ];
    for(const [a, b, c] of lines){
        const v= board[a];
        if (v !== "" && v === board[b] && v === board[c]){
            return v; // "X" ou "O"
        }
    }
    const filled = board.every((c) => c !=="");
    if(filled) return "draw";
    return null;
}