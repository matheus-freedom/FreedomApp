// ════════════════════════════════════════════════════════════════
// RASTREAMENTO DE USO — o que cada aluno faz dentro do app
// ────────────────────────────────────────────────────────────────
// Cada ACESSO do aluno vira UM documento na coleção `sessions`:
//
//   sessions/{userId}_{início}
//     startedAt / lastSeenAt   quando começou e o último sinal
//     activeMs                 tempo ATIVO (ver abaixo)
//     screens  { tela: ms }    tempo gasto em cada tela
//     visits   { tela: n  }    quantas vezes entrou em cada tela
//     events   { nome: n  }    contadores (exercício iniciado,
//                              concluído, abandonado, limite etc.)
//     day / hour / weekday     no fuso de São Paulo, para os gráficos
//     device                   mobile | tablet | desktop
//
// POR QUE UM DOCUMENTO POR ACESSO (e não um por clique)?
// O Firestore cobra por leitura e por escrita. Gravar cada clique
// geraria milhares de documentos por dia, e o painel teria que ler
// todos para montar um gráfico. Com um documento por acesso, o app
// grava no máximo 1 vez por minuto por aluno ativo, e o painel lê
// uma fração disso — cabe com muita folga no plano gratuito.
//
// O QUE É "TEMPO ATIVO"
// Só conta enquanto a aba está visível E houve algum sinal de vida
// (toque, rolagem, digitação, áudio tocando) nos últimos 2 minutos.
// Aba esquecida aberta não infla o tempo de permanência.
//
// O QUE É "UM ACESSO"
// Recarregar a página ou voltar em menos de 30 min continua o MESMO
// acesso (o celular recarrega abas o tempo todo; contar cada recarga
// como acesso novo deixaria o número sem sentido). Passou de 30 min
// parado, o próximo uso abre um acesso novo.
//
// PRIVACIDADE: nenhuma resposta, texto digitado ou conteúdo é
// gravado aqui — só telas, tempos e contadores. Admin não é rastreado.
// ════════════════════════════════════════════════════════════════

import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { msSinceLastActivity } from './activity';
import { spParts } from './analytics';

export interface SessionDoc {
  v: 1;
  id: string;
  userId: string;
  username: string;
  fullName: string;
  startedAt: number;
  lastSeenAt: number;
  day: string;
  hour: number;
  weekday: number;
  activeMs: number;
  screens: Record<string, number>;
  visits: Record<string, number>;
  events: Record<string, number>;
  device: 'mobile' | 'tablet' | 'desktop';
}

const TICK_MS = 5_000;               // de quanto em quanto tempo soma o tempo ativo
const FLUSH_MS = 60_000;             // de quanto em quanto tempo grava no Firestore
const IDLE_CUTOFF_MS = 2 * 60_000;   // sem sinal há mais que isso → para de contar
const SESSION_GAP_MS = 30 * 60_000;  // parado mais que isso → acesso novo
const localKey = (userId: string) => `freedom_session_${userId}`;

let session: SessionDoc | null = null;
let currentScreen: string | null = null;
let lastTickAt = 0;
let dirty = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let listenersOn = false;

// Chaves de mapa do Firestore não podem ter ponto nem barra.
const safeKey = (k: string) => k.replace(/[.\/\[\]*`~]/g, '_').slice(0, 60);

const detectDevice = (): SessionDoc['device'] => {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
  return 'desktop';
};

const persistLocal = () => {
  if (!session) return;
  try { localStorage.setItem(localKey(session.userId), JSON.stringify(session)); } catch { /* sem espaço: segue só em memória */ }
};

const flush = async () => {
  if (!session || !dirty) return;
  dirty = false;
  const snapshot = { ...session, screens: { ...session.screens }, visits: { ...session.visits }, events: { ...session.events } };
  try {
    await setDoc(doc(db, 'sessions', snapshot.id), snapshot);
  } catch (e) {
    // Rastreamento NUNCA pode atrapalhar o aluno: falhou, tenta de
    // novo no próximo ciclo e o app segue como se nada tivesse havido.
    dirty = true;
    console.warn('[tracker] não consegui gravar a sessão:', e);
  }
};

const tick = () => {
  if (!session) return;
  const now = Date.now();
  const elapsed = Math.min(now - lastTickAt, TICK_MS * 2); // teto: aba "congelada" pelo celular não soma horas de uma vez
  lastTickAt = now;
  const visible = document.visibilityState === 'visible';
  if (!visible || msSinceLastActivity() > IDLE_CUTOFF_MS || elapsed <= 0) return;
  session.activeMs += elapsed;
  session.lastSeenAt = now;
  if (currentScreen) session.screens[currentScreen] = (session.screens[currentScreen] || 0) + elapsed;
  dirty = true;
  persistLocal();
};

const onHide = () => {
  if (document.visibilityState === 'hidden') { tick(); void flush(); }
};
const onPageHide = () => { tick(); void flush(); };

const newSession = (user: { userId: string; username: string; fullName: string }): SessionDoc => {
  const now = Date.now();
  const p = spParts(now);
  return {
    v: 1, id: `${user.userId}_${now}`, userId: user.userId, username: user.username, fullName: user.fullName,
    startedAt: now, lastSeenAt: now, day: p.day, hour: p.hour, weekday: p.weekday,
    activeMs: 0, screens: {}, visits: {}, events: {}, device: detectDevice(),
  };
};

export const tracker = {
  /** Chamar quando o aluno entra (login ou restauração do login). */
  start(user: { userId: string; username: string; fullName: string; isAdmin?: boolean }) {
    if (user.isAdmin || user.username.toLowerCase() === 'admin') return; // admin não entra nas estatísticas
    if (session && session.userId === user.userId) return;               // já rodando para este aluno

    // Tenta continuar o acesso anterior (recarga de página / volta rápida).
    let resumed: SessionDoc | null = null;
    try {
      const raw = localStorage.getItem(localKey(user.userId));
      if (raw) {
        const old = JSON.parse(raw) as SessionDoc;
        if (old && old.v === 1 && old.userId === user.userId && Date.now() - old.lastSeenAt < SESSION_GAP_MS) resumed = old;
      }
    } catch { /* rascunho corrompido: começa um acesso novo */ }

    session = resumed || newSession(user);
    lastTickAt = Date.now();
    dirty = true;
    persistLocal();
    void flush();

    if (!tickTimer) tickTimer = setInterval(tick, TICK_MS);
    if (!flushTimer) flushTimer = setInterval(() => void flush(), FLUSH_MS);
    if (!listenersOn) {
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onPageHide);
      listenersOn = true;
    }
  },

  /** Chamar a cada troca de tela (o `status` do App). */
  screen(name: string) {
    if (!session || !name || name === currentScreen) return;
    tick(); // fecha a conta da tela anterior antes de trocar
    currentScreen = safeKey(name);
    session.visits[currentScreen] = (session.visits[currentScreen] || 0) + 1;
    session.lastSeenAt = Date.now();
    dirty = true;
    persistLocal();
  },

  /** Conta +1 num evento (ex.: 'ex_start', 'ex_finish', 'limit_hit'). */
  event(name: string) {
    if (!session || !name) return;
    const k = safeKey(name);
    session.events[k] = (session.events[k] || 0) + 1;
    session.lastSeenAt = Date.now();
    dirty = true;
    persistLocal();
  },

  /** Chamar no logout. Grava o que falta e encerra o acesso. */
  async stop() {
    if (!session) return;
    tick();
    await flush();
    session = null;
    currentScreen = null;
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  },
};
