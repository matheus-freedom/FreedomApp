// ════════════════════════════════════════════════════════════════
// SINAL DE VIDA — "o aluno ainda está aqui?"
// ────────────────────────────────────────────────────────────────
// Um único carimbo global com o horário do último sinal de atividade.
// Dois consumidores usam esse carimbo:
//
//   1. App.tsx — desloga depois de 15 min sem NENHUM sinal.
//   2. services/tracker.ts — só conta "tempo no app" enquanto houve
//      sinal recente (aba aberta e esquecida não infla o relatório).
//
// POR QUE EXISTE: o timer antigo só ouvia mouse/teclado/toque. Ouvir
// um listening, ler um texto no celular sem tocar na tela ou pensar
// numa redação contavam como "inatividade" e o aluno era deslogado
// no meio do exercício. Aqui a lista de sinais é bem mais larga, e
// qualquer parte do app pode avisar "estou vivo" com pingActivity()
// (o player de áudio faz isso a cada avanço da faixa).
// ════════════════════════════════════════════════════════════════

let lastActivityAt = Date.now();

/** Registra um sinal de vida agora. Barato: só grava um número. */
export const pingActivity = (): void => {
  lastActivityAt = Date.now();
};

/** Milissegundos desde o último sinal de vida. */
export const msSinceLastActivity = (): number => Date.now() - lastActivityAt;

const WINDOW_EVENTS = [
  'pointerdown', 'pointermove', 'mousemove', 'mousedown', 'keydown',
  'touchstart', 'touchmove', 'input', 'scroll', 'wheel', 'focus',
] as const;

/**
 * Liga os ouvintes globais. Devolve a função que desliga tudo
 * (formato exato que o useEffect do React espera como "cleanup").
 *
 * capture: true  → pega o evento antes de qualquer componente poder
 *                  interrompê-lo com stopPropagation.
 * passive: true  → promete ao navegador que não vamos bloquear a
 *                  rolagem; sem isso, ouvir scroll/touch pesa no celular.
 */
export const listenForActivity = (): (() => void) => {
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  const onEvent = () => pingActivity();
  // Voltar para a aba conta como sinal de vida; sair dela, não.
  const onVisibility = () => { if (document.visibilityState === 'visible') pingActivity(); };

  WINDOW_EVENTS.forEach(ev => window.addEventListener(ev, onEvent, opts));
  document.addEventListener('visibilitychange', onVisibility);
  pingActivity();

  return () => {
    WINDOW_EVENTS.forEach(ev => window.removeEventListener(ev, onEvent, opts));
    document.removeEventListener('visibilitychange', onVisibility);
  };
};
