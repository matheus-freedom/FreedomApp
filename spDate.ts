// ════════════════════════════════════════════════════════════════
// "Que dia é hoje?" — SEMPRE no horário de Brasília
// ────────────────────────────────────────────────────────────────
// Antes, o app usava `new Date().toISOString().split('T')[0]`.
// O toISOString devolve a data em UTC (fuso de Londres), que está
// 3h à frente de Brasília. Resultado: para o app o dia virava às
// 21h, e atividades feitas à noite contavam na cota do dia seguinte
// (aluno acordava com a cota diária já parcialmente gasta).
//
// Agora todo lugar que precisa da "chave do dia" (formato
// AAAA-MM-DD) importa daqui. O servidor tem a mesma conta em
// netlify/functions/lib/sp-date.js — as duas precisam concordar.
//
// O Brasil não tem horário de verão desde 2019, então Brasília é
// UTC−3 fixo. Se um dia o horário de verão voltar, basta trocar
// esta conta (e a do servidor) por uma com Intl/timeZone.
// ════════════════════════════════════════════════════════════════

const SP_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Chave AAAA-MM-DD do dia (em Brasília) em que o instante `ts` cai. */
export const spDayKey = (ts: number = Date.now()): string =>
  new Date(ts - SP_OFFSET_MS).toISOString().slice(0, 10);

/** Chave AAAA-MM-DD de hoje, em Brasília. */
export const todayKey = (): string => spDayKey(Date.now());
