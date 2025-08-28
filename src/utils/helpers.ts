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
