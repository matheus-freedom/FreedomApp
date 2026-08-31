// ══════════════════════════════════════════════════════════════
// JOURNEY TO FLUENCY — currículo e regras (fonte única da verdade)
// ──────────────────────────────────────────────────────────────
// Este arquivo descreve a trilha inteira de forma ESTÁTICA: quais
// Seasons existem, quais Steps cada Season tem, onde entram os
// Reviews e qual tema de vocabulário acompanha cada Step em cada
// Jornada. Nada aqui é gerado por IA — a IA só gera o CONTEÚDO de
// cada exercício (as questões), sempre a partir destas definições.
//
// Por que estático? Porque a trilha precisa ser IGUAL para todos os
// alunos: assim o exercício gerado para o primeiro aluno que chegar
// num Step é salvo no banco (journey_bank) e reaproveitado por todos
// os outros, sem gastar créditos de IA de novo.
//
// IMPORTANTE: os tópicos (gramática e vocabulário) moram em
// netlify/functions/lib/journey-curriculum.json, lido tanto por este
// arquivo quanto pela function journey-content.js. O id do exercício
// no banco depende só da posição (season/node/kind), não do texto:
// renomear um tópico NÃO invalida o banco; inserir/remover um Step
// desloca os seguintes e faz o conteúdo antigo cair no Step errado —
// nesse caso, apague a coleção journey_bank da Season afetada.
// ══════════════════════════════════════════════════════════════

import { Level, Theme } from './types';

export type JourneyId = 'freedom' | 'business' | 'young' | 'traveler';

// Os cinco tipos de exercício de um Step, na ordem em que o aluno faz.
export type JourneyKind = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'writing';
export const JOURNEY_KINDS: JourneyKind[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing'];

// A cada quantos Steps entra um Review.
export const REVIEW_EVERY = 3;

// Nota mínima (média do Step) para liberar o próximo Step.
export const STEP_PASS_PCT = 60;

// Estrelas por exercício, pela nota em %.
export const starsFor = (pct: number): 1 | 2 | 3 => (pct >= 90 ? 3 : pct >= 75 ? 2 : 1);

export const KIND_META: Record<JourneyKind, { label: string; icon: string; theme: Theme }> = {
  grammar:    { label: 'Gramática',   icon: '📐', theme: Theme.Grammar },
  vocabulary: { label: 'Vocabulário', icon: '📚', theme: Theme.Vocabulary },
  reading:    { label: 'Leitura',     icon: '📖', theme: Theme.Reading },
  listening:  { label: 'Áudio',       icon: '🎧', theme: Theme.Listening },
  writing:    { label: 'Escrita',     icon: '✍️', theme: Theme.Writing },
};

export interface JourneyDef {
  id: JourneyId;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  // Cores Tailwind usadas na tela (gradiente do cartão e acentos).
  gradient: string;
  accent: string;
  ring: string;
  // Temas de vocabulário por nível. O Step i usa vocab[level][i % len].
  vocab: Record<Level, string[]>;
}

// ── Sequência gramatical da escola (enviada pelo Matheus) ─────
// Mora em netlify/functions/lib/journey-curriculum.json, que é
// compartilhado com a function journey-content.js — assim o front
// e o servidor nunca divergem sobre o que é cada Step.
import CURRICULUM from './netlify/functions/lib/journey-curriculum.json';

type VocabMap = Record<Level, string[]>;
const G = (lvl: Level): string[] => (CURRICULUM.grammar as Record<string, string[]>)[lvl];
const VOCAB = (id: JourneyId): VocabMap => (CURRICULUM.journeys as Record<string, { vocab: VocabMap }>)[id].vocab;

export const SEASONS: { index: number; level: Level; title: string; subtitle: string; grammar: string[] }[] = [
  { index: 0, level: Level.A1, title: 'Season 1', subtitle: 'First Steps',   grammar: G(Level.A1) },
  { index: 1, level: Level.A2, title: 'Season 2', subtitle: 'Building Up',   grammar: G(Level.A2) },
  { index: 2, level: Level.B1, title: 'Season 3', subtitle: 'Taking Off',    grammar: G(Level.B1) },
  { index: 3, level: Level.B2, title: 'Season 4', subtitle: 'Going Deeper',  grammar: G(Level.B2) },
  { index: 4, level: Level.C1, title: 'Season 5', subtitle: 'Mastery',       grammar: G(Level.C1) },
];

export const JOURNEYS: JourneyDef[] = [
  {
    id: 'freedom', name: 'Freedom Journey', emoji: '🦅',
    tagline: 'A trilha completa, com um pouco de tudo.',
    description: 'Assuntos variados do dia a dia, cultura, trabalho e lazer. É a jornada padrão da Freedom.',
    gradient: 'from-[#f7931e] to-[#ff5e3a]', accent: 'text-[#f7931e]', ring: 'ring-[#f7931e]',
    vocab: VOCAB('freedom'),
  },
  {
    id: 'business', name: 'Business Journey', emoji: '💼',
    tagline: 'Inglês para o trabalho, reuniões e carreira.',
    description: 'Mesma gramática, mas os textos, áudios e vocabulário vivem no escritório: e-mails, reuniões, clientes e negociações.',
    gradient: 'from-sky-500 to-indigo-600', accent: 'text-sky-400', ring: 'ring-sky-400',
    vocab: VOCAB('business'),
  },
  {
    id: 'young', name: 'Young Journey', emoji: '🎮',
    tagline: 'Para crianças e adolescentes.',
    description: 'Escola, amigos, games, animais, esportes e música — conteúdo leve, divertido e adequado para a idade.',
    gradient: 'from-fuchsia-500 to-purple-600', accent: 'text-fuchsia-400', ring: 'ring-fuchsia-400',
    vocab: VOCAB('young'),
  },
  {
    id: 'traveler', name: 'Traveler Journey', emoji: '✈️',
    tagline: 'Inglês para viajar o mundo.',
    description: 'Aeroportos, hotéis, restaurantes, direções e cultura — tudo o que você precisa na próxima viagem.',
    gradient: 'from-emerald-500 to-teal-600', accent: 'text-emerald-400', ring: 'ring-emerald-400',
    vocab: VOCAB('traveler'),
  },
];

export const getJourney = (id: JourneyId): JourneyDef => JOURNEYS.find(j => j.id === id) || JOURNEYS[0];

// ── Nós de uma Season (Steps + Reviews intercalados) ───────────
// Um "node" é uma parada na trilha. Step = 5 exercícios; Review =
// 1 quiz misto de gramática cobrindo os 3 Steps anteriores.
export interface JourneyNode {
  index: number;                 // posição na Season (0..n-1), usada no id do banco
  type: 'step' | 'review';
  stepNumber: number;            // 1..N (Steps) ou nº do review
  grammarTopic: string;          // Step: tópico; Review: tópicos unidos por " + "
  grammarTopics: string[];       // Review: os 3 tópicos revisados
  vocabTheme: string;
  kinds: JourneyKind[];          // Step: 5 tipos; Review: ['grammar']
}

export const buildSeasonNodes = (journeyId: JourneyId, seasonIndex: number): JourneyNode[] => {
  const season = SEASONS[seasonIndex];
  const journey = getJourney(journeyId);
  const vocabList = journey.vocab[season.level];
  const nodes: JourneyNode[] = [];
  let reviews = 0;
  season.grammar.forEach((topic, i) => {
    nodes.push({
      index: nodes.length, type: 'step', stepNumber: i + 1,
      grammarTopic: topic, grammarTopics: [topic],
      vocabTheme: vocabList[i % vocabList.length], kinds: JOURNEY_KINDS,
    });
    // Review após cada 3 Steps (nunca logo após o último, que já fecha a Season).
    if ((i + 1) % REVIEW_EVERY === 0 && i < season.grammar.length - 1) {
      reviews += 1;
      const topics = season.grammar.slice(i - REVIEW_EVERY + 1, i + 1);
      const vocabs = topics.map((_, k) => vocabList[(i - REVIEW_EVERY + 1 + k) % vocabList.length]);
      nodes.push({
        index: nodes.length, type: 'review', stepNumber: reviews,
        grammarTopic: topics.join(' + '), grammarTopics: topics,
        vocabTheme: vocabs.join(', '), kinds: ['grammar'],
      });
    }
  });
  return nodes;
};

// Id determinístico do exercício no banco compartilhado.
export const bankIdOf = (journeyId: JourneyId, seasonIndex: number, nodeIndex: number, kind: JourneyKind): string =>
  `${journeyId}_s${seasonIndex}_n${nodeIndex}_${kind}`;

// Chave do nó dentro do progresso do aluno.
export const nodeKeyOf = (seasonIndex: number, nodeIndex: number): string => `s${seasonIndex}_n${nodeIndex}`;

// ── Progresso do aluno (documento journey_progress/{uid}) ──────
export interface JourneyExerciseResult {
  bestPct: number;       // melhor nota em %
  attempts: number;
  stars: 1 | 2 | 3;
  completedAt: number;
}
export interface JourneyNodeProgress {
  exercises: Partial<Record<JourneyKind, JourneyExerciseResult>>;
}
export interface JourneyProgressDoc {
  activeJourney?: JourneyId;
  journeys: Partial<Record<JourneyId, {
    startedAt: number;
    nodes: Record<string, JourneyNodeProgress>;   // chave = nodeKeyOf(...)
  }>>;
}

// Contexto enviado ao servidor junto com o resultado do exercício.
export interface JourneyContext {
  journeyId: JourneyId;
  season: number;
  node: number;
  kind: JourneyKind;
}

// ── Cálculos de desbloqueio (puros, sem rede) ─────────────────
export const LEVEL_INDEX: Record<Level, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 } as any;

// Quantas Seasons o nivelamento libera. Regra (Matheus): usa o MENOR
// nível entre as habilidades já niveladas; sem nivelamento = 0.
// As quatro habilidades do nivelamento. Uma habilidade NUNCA testada
// vale A1 — do contrário um aluno que nivelou só Reading em C1
// pularia a trilha inteira sem que a gramática dele fosse medida, e a
// Journey passaria a ser exatamente o que ela veio consertar: um
// monte de exercício fora do nível certo.
export const PLACEMENT_SKILL_KEYS = ['grammar', 'reading', 'listening', 'writing'];

export const seasonsSkippedByPlacement = (placementResults: Record<string, { level?: Level } | undefined> | undefined, legacyLevel?: Level): number => {
  const results = placementResults || {};
  const tested = PLACEMENT_SKILL_KEYS.filter(k => results[k]?.level);
  if (tested.length < PLACEMENT_SKILL_KEYS.length) {
    // Nivelamento incompleto: só o formato antigo (nível único) vale.
    return tested.length === 0 && legacyLevel ? LEVEL_INDEX[legacyLevel] : 0;
  }
  return Math.min(...PLACEMENT_SKILL_KEYS.map(k => LEVEL_INDEX[results[k]!.level!]));
};

// Quantas habilidades ainda faltam nivelar para o pulo de Season
// valer. A tela usa isto para explicar ao aluno o que fazer.
export const placementSkillsMissing = (placementResults: Record<string, { level?: Level } | undefined> | undefined): number =>
  PLACEMENT_SKILL_KEYS.filter(k => !(placementResults || {})[k]?.level).length;

export interface NodeStatus {
  node: JourneyNode;
  key: string;
  state: 'locked' | 'available' | 'current' | 'done';
  pct: number;              // média do nó (0 se nada feito)
  doneKinds: JourneyKind[];
  passed: boolean;          // todos os exercícios feitos e média >= STEP_PASS_PCT
  // Season já liberada pelo nivelamento: a ordem dos Steps e dos
  // exercícios não trava nada, é tudo revisão livre.
  freeRoam: boolean;
}

export const nodeStats = (node: JourneyNode, prog: JourneyNodeProgress | undefined): { pct: number; doneKinds: JourneyKind[]; complete: boolean; passed: boolean } => {
  const doneKinds = node.kinds.filter(k => prog?.exercises?.[k]);
  const sum = doneKinds.reduce((acc, k) => acc + (prog!.exercises![k]!.bestPct), 0);
  const pct = doneKinds.length ? Math.round(sum / node.kinds.length) : 0; // exercícios não feitos contam 0
  const complete = doneKinds.length === node.kinds.length;
  return { pct, doneKinds, complete, passed: complete && pct >= STEP_PASS_PCT };
};

// Estado de cada nó de uma Season, respeitando a ordem: um nó só
// abre quando o anterior foi aprovado (>= 60%).
export const seasonStatus = (journeyId: JourneyId, seasonIndex: number, doc: JourneyProgressDoc | null, unlockedByPlacement: boolean, previousSeasonPassed: boolean): { nodes: NodeStatus[]; pct: number; passed: boolean; unlocked: boolean } => {
  const nodes = buildSeasonNodes(journeyId, seasonIndex);
  const progNodes = doc?.journeys?.[journeyId]?.nodes || {};
  const unlocked = seasonIndex === 0 || unlockedByPlacement || previousSeasonPassed;
  // Season liberada pelo nivelamento é ZONA LIVRE: o aluno já provou
  // que domina esse nível, então pode abrir qualquer Step para
  // revisar, na ordem que quiser. Sem isto a tela prometia "revise
  // quando quiser" e entregava tudo cadeado menos o primeiro Step.
  const freeRoam = unlockedByPlacement;
  let prevPassed = true;
  let currentMarked = false;
  const out: NodeStatus[] = nodes.map(node => {
    const key = nodeKeyOf(seasonIndex, node.index);
    const s = nodeStats(node, progNodes[key]);
    let state: NodeStatus['state'];
    if (!unlocked || (!prevPassed && !freeRoam)) state = 'locked';
    else if (s.passed) state = 'done';
    else if (!currentMarked && !freeRoam) { state = 'current'; currentMarked = true; }
    else state = 'available';
    prevPassed = prevPassed && s.passed;
    return { node, key, state, pct: s.pct, doneKinds: s.doneKinds, passed: s.passed, freeRoam };
  });
  const passedCount = out.filter(n => n.passed).length;
  return { nodes: out, pct: Math.round((passedCount / nodes.length) * 100), passed: passedCount === nodes.length, unlocked };
};

export const journeyOverview = (journeyId: JourneyId, doc: JourneyProgressDoc | null, skipped: number) => {
  const seasons: ReturnType<typeof seasonStatus>[] = [];
  let prevPassed = true;
  SEASONS.forEach((_, i) => {
    const st = seasonStatus(journeyId, i, doc, i < skipped, prevPassed);
    seasons.push(st);
    prevPassed = st.passed || i < skipped;
  });
  // Percentual geral: Seasons puladas pelo nivelamento contam como 100%.
  const overall = Math.round(seasons.reduce((acc, s, i) => acc + (i < skipped ? 100 : s.pct), 0) / SEASONS.length);
  // Próximo exercício: primeiro nó "current" a partir da primeira Season não pulada.
  let next: { season: number; node: JourneyNode; kind: JourneyKind } | null = null;
  const progNodes = doc?.journeys?.[journeyId]?.nodes || {};
  for (let i = skipped; i < SEASONS.length && !next; i++) {
    const cur = seasons[i].nodes.find(n => n.state === 'current');
    if (cur) {
      // Primeiro exercício ainda não feito. Se TODOS já foram feitos e
      // o Step mesmo assim não passou (média < 60%), aponta para o de
      // PIOR nota — refazer esse é o caminho mais curto para liberar o
      // próximo Step, e mandar o aluno de volta para o exercício 1 seria
      // fazê-lo repetir justamente o que ele já domina.
      const pending = cur.node.kinds.find(k => !cur.doneKinds.includes(k));
      let kind = pending || cur.node.kinds[0];
      if (!pending) {
        const ex = progNodes[cur.key]?.exercises || {};
        kind = [...cur.node.kinds].sort((a, b) => (ex[a]?.bestPct ?? 0) - (ex[b]?.bestPct ?? 0))[0];
      }
      next = { season: i, node: cur.node, kind };
    }
  }
  return { seasons, overall, next };
};

// ── "E agora?" — o destino após terminar um exercício ─────────
// Usado pela tela de RESULTADOS para oferecer o próximo passo sem
// obrigar o aluno a voltar ao mapa a cada exercício. É um cálculo
// puro (sem rede): recebe o progresso já gravado pelo servidor —
// incluindo o exercício que acabou de terminar — e responde qual é
// a continuação natural:
//   exercise → ainda faltam exercícios neste Step (vai ao próximo tipo)
//   step     → Step completo e aprovado (>= 60%) → oferece o Step seguinte
//   season   → era o último Step da Season e ela foi concluída → Season seguinte
//   redo     → Step completo mas média < 60% → aponta o exercício de PIOR
//              nota (o caminho mais curto para destravar o próximo Step)
//   journey_end → acabou a última Season: não há para onde ir, só comemorar
export interface NextJourneyTarget {
  type: 'exercise' | 'step' | 'season' | 'redo' | 'journey_end';
  season: number;
  nodeIndex: number;
  kind: JourneyKind;
  label: string;   // texto pronto para o botão/mensagem da tela de resultados
  pct?: number;    // média do Step (usada na mensagem do 'redo')
}

export const getNextJourneyTarget = (
  journeyId: JourneyId,
  seasonIndex: number,
  nodeIndex: number,
  doc: JourneyProgressDoc | null,
  skipped: number,
): NextJourneyTarget | null => {
  const nodes = buildSeasonNodes(journeyId, seasonIndex);
  const node = nodes[nodeIndex];
  if (!node) return null;
  const progNodes = doc?.journeys?.[journeyId]?.nodes || {};
  const stats = nodeStats(node, progNodes[nodeKeyOf(seasonIndex, nodeIndex)]);

  // 1) Ainda há exercício por fazer neste Step → próximo tipo, na ordem.
  const pending = node.kinds.find(k => !stats.doneKinds.includes(k));
  if (pending) {
    return {
      type: 'exercise', season: seasonIndex, nodeIndex, kind: pending,
      label: KIND_META[pending].label,
    };
  }

  // 2) Step completo mas reprovado. Em Season liberada pelo nivelamento
  //    (zona livre) nada tranca, então segue adiante mesmo assim; nas
  //    demais, o próximo Step está trancado — refazer é o único caminho.
  const freeRoam = seasonIndex < skipped;
  if (!stats.passed && !freeRoam) {
    const ex = progNodes[nodeKeyOf(seasonIndex, nodeIndex)]?.exercises || {};
    const worst = [...node.kinds].sort((a, b) => (ex[a]?.bestPct ?? 0) - (ex[b]?.bestPct ?? 0))[0];
    return {
      type: 'redo', season: seasonIndex, nodeIndex, kind: worst,
      label: KIND_META[worst].label, pct: stats.pct,
    };
  }

  // 3) Step concluído → oferece o próximo nó da Season (Step ou Review).
  const nextNode = nodes[nodeIndex + 1];
  if (nextNode) {
    const nextStats = nodeStats(nextNode, progNodes[nodeKeyOf(seasonIndex, nextNode.index)]);
    const kind = nextNode.kinds.find(k => !nextStats.doneKinds.includes(k)) || nextNode.kinds[0];
    const label = nextNode.type === 'review'
      ? `Review ${nextNode.stepNumber} · ${nextNode.grammarTopic}`
      : `Step ${nextNode.stepNumber} · ${nextNode.vocabTheme}`;
    return { type: 'step', season: seasonIndex, nodeIndex: nextNode.index, kind, label };
  }

  // 4) Era o último nó da Season. A Season seguinte só abre se ESTA
  //    Season inteira foi aprovada (ou se o nivelamento já a liberou).
  const seasonDone = seasonStatus(journeyId, seasonIndex, doc, freeRoam, true).passed;
  const nextSeason = seasonIndex + 1;
  if (nextSeason < SEASONS.length && (seasonDone || nextSeason < skipped)) {
    const first = buildSeasonNodes(journeyId, nextSeason)[0];
    const firstStats = nodeStats(first, progNodes[nodeKeyOf(nextSeason, 0)]);
    const kind = first.kinds.find(k => !firstStats.doneKinds.includes(k)) || first.kinds[0];
    return {
      type: 'season', season: nextSeason, nodeIndex: 0, kind,
      label: `${SEASONS[nextSeason].title} (${SEASONS[nextSeason].level})`,
    };
  }

  // 5) Última Season concluída (ou Season atual incompleta em pontos
  //    anteriores — nesse caso o mapa é quem orienta melhor).
  if (nextSeason >= SEASONS.length && seasonDone) {
    return { type: 'journey_end', season: seasonIndex, nodeIndex, kind: node.kinds[0], label: '' };
  }
  return null;
};
