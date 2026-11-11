// ════════════════════════════════════════════════════════════════
// "Que dia é hoje?" no SERVIDOR — horário de Brasília
// ────────────────────────────────────────────────────────────────
// Espelho de /spDate.ts (o lado do navegador). O servidor da
// Netlify roda em UTC, então `new Date().toISOString()` dava a data
// de Londres e o dia virava às 21h de Brasília — o teto diário de
// XP zerava 3h antes da meia-noite. As duas contas precisam dar o
// mesmo resultado, senão a tela e o servidor discordam sobre o dia.
//
// Brasil sem horário de verão desde 2019 → UTC−3 fixo.
// ════════════════════════════════════════════════════════════════

const SP_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Chave AAAA-MM-DD do dia (em Brasília) em que o instante `ms` cai. */
const spDayKey = (ms = Date.now()) => new Date(ms - SP_OFFSET_MS).toISOString().slice(0, 10);

module.exports = { spDayKey };
