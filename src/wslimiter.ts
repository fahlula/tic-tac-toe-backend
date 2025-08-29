// Token bucket por socket
export function attachSocketRateLimiter(socket: any, eventsPerSec = 20, burst = 40) {
  const bucket = { tokens: burst, last: Date.now() };
  socket.use((packet: any[], next: (err?: Error) => void) => {
    const now = Date.now();
    const elapsed = (now - bucket.last) / 1000;
    bucket.last = now;
    bucket.tokens = Math.min(burst, bucket.tokens + elapsed * eventsPerSec);

    if (bucket.tokens < 1) {
      socket.emit("ws_error", {
        code: "RATE_LIMIT",
        message: "Muitas mensagens por segundo; tente novamente em instantes.",
      });
      return; // bloqueia este pacote
    }
    bucket.tokens -= 1;
    return next();
  });
}
