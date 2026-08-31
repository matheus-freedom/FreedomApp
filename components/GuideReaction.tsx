import React, { useEffect, useMemo, useState } from 'react';
import { GuideCharacter } from '../types';
import FredAvatar, { FredExpression } from './FredAvatar';

// ══════════════════════════════════════════════════════════════
// REAÇÃO DO GUIA (Fred / Frida)
// ──────────────────────────────────────────────────────────────
// Balãozinho que aparece no canto durante o exercício, do jeito que
// a coruja do Duolingo faz: elogia sequências de acerto e levanta o
// astral no erro. É pura interface — não chama IA, não gasta token.
//
// Por que as frases são sorteadas de listas fixas em vez de vir da
// IA? Porque a reação precisa ser INSTANTÂNEA (o aluno acabou de
// clicar) e acontece dezenas de vezes por exercício. Uma chamada de
// IA aqui atrasaria o feedback e multiplicaria o custo por nada.
// ══════════════════════════════════════════════════════════════

// Frases por situação. O nome do aluno entra no lugar de {name}.
const PRAISE_1 = [
  'Boa, {name}! 🎯', 'Isso mesmo! ✅', 'Perfeito! 👏', 'Acertou em cheio! 🎉', 'Muito bem! 💪',
];
const PRAISE_3 = [
  '3 seguidas! Você está voando, {name}! 🚀',
  'Sequência de 3! Continua assim! 🔥',
  'Três em três! Isso é fluência chegando! ⭐',
];
const PRAISE_5 = [
  '5 seguidas! {name}, você está IMPARÁVEL! 🔥🔥',
  'Cinco acertos seguidos! Nível profissional! 🏆',
  'Uau! 5 na sequência — o Fred está orgulhoso! 🤩',
];
const PRAISE_ALL = [
  'PERFEIÇÃO! Nem uma errada! 👑',
  'Gabaritou! Isso é domínio total do tópico! 🏅',
];
const ENCOURAGE = [
  'Quase! Errar faz parte — lê a explicação e segue. 💡',
  'Sem problema, {name}. É assim que se aprende! 🌱',
  'Essa foi difícil! Olha a explicação, faz sentido. 🤔',
  'Calma, você está indo bem. Bora pra próxima! 💛',
  'Errou? Ótimo: agora você nunca mais esquece. ✨',
];
const ENCOURAGE_STREAK = [
  'Respira, {name}. Lê com calma e tenta de novo. 🧘',
  'Esse tópico é osso duro. Revisa a explicação com atenção! 📖',
  'Todo mundo trava aqui. Você vai pegar o jeito! 💪',
];

const pick = (list: string[], name: string) =>
  list[Math.floor(Math.random() * list.length)].replace('{name}', name);

export type ReactionEvent = {
  // Contador que muda a cada resposta — é o que dispara o balão.
  seq: number;
  correct: boolean;
  correctStreak: number;
  wrongStreak: number;
  isLast?: boolean;
  perfect?: boolean;
} | null;

interface GuideReactionProps {
  // Mantido na interface para as telas que já passam o guia; hoje só o
  // Fred está ativo (Frida chega depois), então o visual é sempre dele.
  guide?: GuideCharacter;
  userName: string;
  event: ReactionEvent;
}

const GuideReaction: React.FC<GuideReactionProps> = ({ userName, event }) => {
  const [visible, setVisible] = useState(false);
  const firstName = (userName || '').split(' ')[0] || 'você';

  const message = useMemo(() => {
    if (!event) return '';
    if (event.correct) {
      if (event.isLast && event.perfect) return pick(PRAISE_ALL, firstName);
      if (event.correctStreak >= 5 && event.correctStreak % 5 === 0) return pick(PRAISE_5, firstName);
      if (event.correctStreak === 3) return pick(PRAISE_3, firstName);
      return pick(PRAISE_1, firstName);
    }
    return event.wrongStreak >= 2 ? pick(ENCOURAGE_STREAK, firstName) : pick(ENCOURAGE, firstName);
    // A dependência é o seq: cada resposta nova sorteia uma frase nova.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.seq]);

  // O balão some sozinho para não cobrir a explicação.
  useEffect(() => {
    if (!event) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), event.correct ? 2600 : 4200);
    return () => clearTimeout(t);
  }, [event?.seq]);

  // ── Qual "cara" o Fred faz em cada situação? ──────────────────
  // A ordem das checagens importa: os casos mais especiais (5 seguidas,
  // 2+ erros seguidos) vêm ANTES dos casos genéricos (acertou/errou),
  // senão o genérico "engoliria" o especial.
  const expression: FredExpression = useMemo(() => {
    if (!event) return 'perfil';
    if (event.correct) {
      // 5 acertos seguidos (ou 10, 15...) → Fred de queixo caído
      if (event.correctStreak >= 5 && event.correctStreak % 5 === 0) return 'surpreso';
      // Acertou → Fred comemorando com confetes
      return 'feliz';
    }
    // 2+ erros seguidos → Fred motivador ("respira, você consegue")
    if (event.wrongStreak >= 2) return 'motivado';
    // Errou uma → Fred tristinho
    return 'triste';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.seq]);

  if (!event || !message) return null;

  const good = event.correct;

  return (
    <div
      className={`fixed z-[220] left-1/2 -translate-x-1/2 bottom-24 md:bottom-28 md:left-auto md:right-8 md:translate-x-0 transition-all duration-300 pointer-events-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-2 pl-1 pr-5 py-1.5 rounded-full backdrop-blur-xl border-2 shadow-2xl max-w-[92vw] md:max-w-sm ${
          good
            ? 'bg-green-500/15 border-green-400/60 shadow-green-500/20'
            : 'bg-[#f7931e]/15 border-[#f7931e]/60 shadow-[#f7931e]/20'
        }`}
      >
        {/* O Fred aparece "inteiro", maior que a pílula, estilo Duolingo.
            A animação de pulinho só toca no acerto para não parecer que
            ele está comemorando um erro. */}
        <FredAvatar
          expression={expression}
          className={`w-16 h-20 -my-3 shrink-0 drop-shadow-lg ${good ? 'animate-bounce' : ''}`}
        />
        <p className={`text-sm font-black leading-tight ${good ? 'text-green-200' : 'text-[#ffd9a8]'}`}>{message}</p>
      </div>
    </div>
  );
};

export default GuideReaction;
