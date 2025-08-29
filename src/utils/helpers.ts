export function generateRoomId(): string {
  // ID curto e fácil de compartilhar (6 chars). Ajuste se quiser.
  return Math.random().toString(36).slice(2, 8);
}

export function isValidName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 30) return false;
  // letras, números, espaço, _ e -
  return /^[\p{L}\p{N}\s_-]+$/u.test(trimmed);
}

export function isValidIndex(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 8;
}

export function nextTurn(symbol: "X" | "O"): "X" | "O" {
  return symbol === "X" ? "O" : "X";
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .trim();
}

export function sameName(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeName(a) === normalizeName(b);
}
