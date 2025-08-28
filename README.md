- Tic-Tac-Toe – Backend

Backend do jogo da velha em Node.js + TypeScript, com WebSocket (Socket.IO) e MongoDB (Atlas).
Fornece API/WS para criar salas, entrar, fazer jogadas e acompanhar o estado do jogo.

Stack
- Node.js + TypeScript
- Express
- Socket.IO
- MongoDB (Atlas) + Mongoose
- ESLint + Prettier
- Jest (testes)

Scripts (planejados)
- `npm run dev` – desenvolvimento com reload
- `npm run build` – compila TypeScript
- `npm run start` – roda build
- `npm run lint` / `npm run format` – estilo
- `npm test` – testes

Healthcheck
`GET /healthz` → `{ "status": "ok" }`
