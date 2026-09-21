// ══════════════════════════════════════════════════════════════
// FRED EXPLICA — tipos, catálogo e helpers (lado do navegador)
// ──────────────────────────────────────────────────────────────
// Espelho em TypeScript do netlify/functions/lib/fred-core.js.
// O CATÁLOGO vem do mesmo journey-curriculum.json da Journey, então
// os temas do "Fred explica" são exatamente os que a escola trabalha
// do A1 ao C1. O slug (id da aula) é calculado com a MESMA regra do
// servidor — o teste test-fred.mjs confere que os dois batem em
// todos os temas.
// ══════════════════════════════════════════════════════════════

import { Level } from './types';
import { FredExpression } from './components/FredAvatar';
import CURRICULUM from './netlify/functions/lib/journey-curriculum.json';

export const FRED_LEVELS: Level[] = [Level.A1, Level.A2, Level.B1, Level.B2, Level.C1];

// Precisa ser igual ao LESSON_XP do servidor (só para exibição).
export const LESSON_XP = 40;
export const LESSON_PASS_PCT = 60;

export const slugify = (text: string): string =>
  String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const lessonId = (level: Level, topic: string) => `${level}_${slugify(topic)}`;

// Sem acento e sem caixa: "preposicoes" acha "In, On, At (preposições)".
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export interface CatalogEntry {
  id: string;
  level: Level;
  topic: string;
  order: number;
}

const buildCatalog = (): CatalogEntry[] => {
  const out: CatalogEntry[] = [];
  const grammar = (CURRICULUM as any).grammar as Record<string, string[]>;
  for (const level of FRED_LEVELS) {
    (grammar[level] || []).forEach((topic, order) => {
      out.push({ id: lessonId(level, topic), level, topic, order });
    });
  }
  return out;
};

export const FRED_CATALOG: CatalogEntry[] = buildCatalog();

export const findCatalogEntry = (level: Level, topic: string): CatalogEntry | undefined =>
  FRED_CATALOG.find(c => c.id === lessonId(level, topic));

// ── Casamento "aproximado" de tema ─────────────────────────────
// A prática livre usa nomes próprios de tópico (constants.ts), como
// "Verbo To Be (afirmativa, negativa, interrogativa)" ou "Past simple
// (Did, Didn't...)", que não são iguais aos do catálogo ("Verbo to be
// (presente)", "Simple Past"). Para a tela de resultados conseguir
// sugerir a aula certa, comparamos as PALAVRAS do tópico com as de
// cada tema do mesmo nível e aceitamos quando quase todas as palavras
// do tema aparecem no tópico. Só a igualdade exata deixaria a
// sugestão de fora em 3 de cada 4 exercícios de gramática.
const TOKEN_STOP = new Set(['com', 'de', 'do', 'da', 'e', 'o', 'a', 'em', 'no', 'na', 'os', 'as', 'um', 'uma', 'vs', 'and', 'the', 'of', 'para', 'for', 'students', 'intermediate', 'que', 'estao', 'modal', 'modais']);
// Inglês ↔ português: a prática livre nomeia em inglês ("Comparatives")
// o que o catálogo nomeia em português ("Comparativos"), e vice-versa.
// Os dois lados passam pela mesma normalização, então basta mapear
// para UMA forma canônica (a que sobrar depois de tirar o plural).
const TOKEN_SYNONYMS: Record<string, string> = {
  pronoun: 'pronome', possessive: 'possessivo', reflexive: 'reflexivo', demonstrative: 'demonstrativo',
  comparative: 'comparativo', superlative: 'superlativo', adverb: 'adverbio', conjunction: 'conjuncoe',
  time: 'tempo', tense: 'tempo', place: 'lugar', future: 'futuro', subjunctive: 'subjuntivo',
  inversion: 'inversoe', preposition: 'preposicoe', infinitivo: 'infinitive', verbo: 'verb',
  presente: 'present', passado: 'past', gerundio: 'gerund', ing: 'gerund', condicional: 'conditional', condicionai: 'conditional',
  objective: 'objeto', objetive: 'objeto',
};
const canonToken = (t: string): string => {
  // Plural simples: "presentes" → "presente", "pronouns" → "pronoun".
  let w = t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t;
  return TOKEN_SYNONYMS[w] || w;
};
const tokensOf = (text: string): string[] =>
  fold(text).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 2 && !TOKEN_STOP.has(t)).map(canonToken);

export const matchCatalogEntry = (level: Level, topic: string): CatalogEntry | undefined => {
  const exact = findCatalogEntry(level, topic);
  if (exact) return exact;
  // "Teste: todos os tempos..." / "Final test" misturam vários temas —
  // não há UMA aula certa para sugerir.
  if (/\b(teste?|final)\b/i.test(topic)) return undefined;
  const ft = new Set(tokensOf(topic));
  if (ft.size === 0) return undefined;
  const pool = FRED_CATALOG.filter(c => c.level === level).map(c => ({ c, ct: Array.from(new Set(tokensOf(c.topic))) }));
  // Peso de cada palavra = 1 / (em quantos temas do nível ela aparece).
  // "pronomes" aparece em vários temas e vale pouco; "demonstrativos"
  // aparece em um só e decide sozinho. Sem isso, "Demonstrative
  // pronouns" empataria entre "Pronomes reflexivos" e "Demonstrativos".
  const df = new Map<string, number>();
  for (const { ct } of pool) for (const t of ct) df.set(t, (df.get(t) || 0) + 1);
  const w = (t: string) => 1 / (df.get(t) || 1);
  let best: CatalogEntry | undefined, bestW = 0, bestHits = 0, bestPlain = 0;
  for (const { c, ct } of pool) {
    if (ct.length === 0) continue;
    const hit = ct.filter(t => ft.has(t));
    const plain = hit.length / ct.length;
    const weighted = hit.reduce((a, t) => a + w(t), 0) / ct.reduce((a, t) => a + w(t), 0);
    if (weighted > bestW || (weighted === bestW && hit.length > bestHits)) { best = c; bestW = weighted; bestHits = hit.length; bestPlain = plain; }
  }
  // Metade das palavras do tema precisa aparecer no tópico. Abaixo disso
  // a sugestão seria chute — melhor não sugerir nada.
  return bestPlain >= 0.5 ? best : undefined;
};

// ── Conteúdo da aula (como o servidor grava) ──────────────────
export interface LessonQuiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export interface LessonExample { en: string; pt: string; note: string }
export interface LessonSection {
  heading: string;
  mood: FredExpression;
  body: string;
  examples: LessonExample[];
  ptAnalogy: string;
  tip: string;
  quiz: LessonQuiz[]; // 0 ou 1
}
export interface LessonMistake { wrong: string; right: string; why: string }
export interface FredLesson {
  title: string;
  hook: string;
  sections: LessonSection[];
  mistakes: LessonMistake[];
  summary: string[];
  finalQuiz: LessonQuiz[];
}

// Progresso do aluno numa aula (fred_progress/{uid}.lessons[id]).
export interface LessonProgress {
  openedAt?: number;
  completedAt?: number;
  attempts?: number;
  bestPct?: number;
  lastPct?: number;
  lastAt?: number;
  xpAwarded?: number;
}
export interface FredProgressDoc {
  lessons?: Record<string, LessonProgress>;
  updatedAt?: number;
}

// Origem da aula quando aberta a partir de um Step da Journey. Guarda o
// suficiente para o App reconstruir o nó e iniciar o exercício certo.
export interface FredOrigin {
  journeyId: import('./journeys').JourneyId;
  season: number;
  nodeIndex: number;
  // Próximo exercício do Step ainda não feito (normalmente 'grammar').
  nextKind: import('./journeys').JourneyKind;
  // Rótulos prontos para a tela: "Season 1 · Step 1" e "Gramática".
  stepLabel: string;
  nextLabel: string;
}

// Estado do documento fred_lessons/{id}, como o front o enxerga.
export type LessonDocStatus = 'generating' | 'ready' | 'error' | 'failed';

// ── Busca do catálogo ─────────────────────────────────────────

// Sinônimos que o aluno digita e que não estão no nome do tema.
// Ex.: quem procura "passado" quer achar Simple Past / Was-Were.
const SEARCH_ALIASES: Array<[RegExp, string[]]> = [
  [/\b(passado|past)\b/, ['Simple Past', 'Was / Were', 'Past Continuous', 'Past Perfect', 'Used to']],
  [/\b(futuro|future)\b/, ['Will', 'Going to', 'Futuro', 'Future']],
  [/\b(presente|present)\b/, ['Simple Present', 'Present Continuous', 'Present Perfect']],
  [/\b(condicional|condicionais|if)\b/, ['Conditional', 'Condicionais', 'Wish', 'If only']],
  [/\b(modal|modais)\b/, ['Can', 'Could', 'Must', 'Should', 'Would', 'Might', 'May', 'Have to', 'Need', 'Had better']],
  [/\b(preposi[cç][aã]o|preposi[cç][oõ]es)\b/, ['In, On, At', 'Preposições']],
  [/\b(pronome|pronomes)\b/, ['Pronomes', 'Possessivos', 'Demonstrativos', 'Relative']],
  [/\b(passiva|passive)\b/, ['Passive', 'Passiva']],
  [/\b(ger[uú]ndio|ing)\b/, ['Gerúndio', 'ING']],
  [/\b(compara[cç][aã]o|comparar|comparativo|superlativo)\b/, ['Comparativos', 'Superlativos', 'Comparações', 'as...as']],
  [/\b(quantidade|quantificador|quantificadores)\b/, ['Some and Any', 'Little / Few', 'How much', 'Much, Many', 'All, Most', 'Both', 'Each', 'No, None']],
  [/\b(discurso|reported|indireto)\b/, ['Reported', 'Reporting']],
];

export const searchCatalog = (query: string, level: Level | 'ALL'): CatalogEntry[] => {
  const q = fold(query.trim());
  const base = level === 'ALL' ? FRED_CATALOG : FRED_CATALOG.filter(c => c.level === level);
  if (!q) return base;
  const aliasHits = new Set<string>();
  for (const [re, targets] of SEARCH_ALIASES) {
    if (re.test(q)) targets.forEach(t => aliasHits.add(fold(t)));
  }
  return base.filter(c => {
    const t = fold(c.topic);
    if (t.includes(q)) return true;
    for (const a of aliasHits) if (t.includes(a)) return true;
    return false;
  });
};

// ── Texto do Fred com **negrito** → pedaços para renderizar ───
// Só negrito é aceito (o prompt proíbe o resto do markdown). Parsear
// à mão evita puxar uma biblioteca de markdown inteira para isso.
export type TextPiece = { text: string; bold: boolean };
export const parseBold = (text: string): TextPiece[] => {
  const out: TextPiece[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
};

export const splitParagraphs = (text: string): string[] =>
  text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);

// Nota local do checkpoint (para a tela reagir na hora). O XP quem
// decide é o servidor, que corrige de novo com o gabarito dele.
export const scoreLocally = (quiz: LessonQuiz[], answers: number[]) => {
  let score = 0;
  quiz.forEach((q, i) => { if (answers[i] === q.correctIndex) score++; });
  const total = quiz.length;
  const pct = total ? Math.round((score / total) * 100) : 0;
  return { score, total, pct, passed: pct >= LESSON_PASS_PCT };
};
