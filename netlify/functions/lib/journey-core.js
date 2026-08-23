// ============================================================
// FREEDOMAPP — lib/journey-core
// ------------------------------------------------------------
// Regras da Journey to Fluency do lado do SERVIDOR. Usado por
// journey-content.js (entregar exercício) e award-activity.js
// (gravar progresso).
//
// Por que existe: as duas functions precisam responder à mesma
// pergunta — "esta posição da trilha existe, e este aluno pode
// estar nela agora?". Sem um lugar único, uma delas ficaria mais
// frouxa que a outra e viraria a porta dos fundos.
//
// O que isso impede na prática:
//   1) Um aluno com DevTools pedindo TODOS os exercícios da trilha
//      em sequência — o que geraria milhares de chamadas de IA
//      pagas de uma vez só.
//   2) Um aluno forjando progresso ("terminei o Step 40") para
//      pular a trilha inteira sem fazer nada.
//
// O currículo vem de journey-curriculum.json, o MESMO arquivo lido
// pelo front (journeys.ts) — front e servidor nunca divergem.
// ============================================================

const CURRICULUM = require("./journey-curriculum.json");

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const KINDS = ["grammar", "vocabulary", "reading", "listening", "writing"];
const JOURNEY_IDS = ["freedom", "business", "young", "traveler"];
const REVIEW_EVERY = 3;
const STEP_PASS_PCT = 60;
// Todas as quatro habilidades do nivelamento precisam estar testadas
// para o pulo de Season valer (ver seasonsSkipped abaixo).
const PLACEMENT_SKILLS = ["grammar", "reading", "listening", "writing"];

// ── Nós de uma Season: Steps + um Review a cada 3 Steps ───────
// Espelha buildSeasonNodes de journeys.ts. O teste
// test-journey.mjs compara os dois lados nó a nó.
const buildSeasonNodes = (journeyId, seasonIndex) => {
  const level = LEVELS[seasonIndex];
  const grammar = CURRICULUM.grammar[level];
  const vocabList = CURRICULUM.journeys[journeyId].vocab[level];
  const nodes = [];
  let reviews = 0;
  grammar.forEach((topic, i) => {
    nodes.push({
      index: nodes.length, type: "step", stepNumber: i + 1,
      grammarTopics: [topic], vocabThemes: [vocabList[i % vocabList.length]], kinds: KINDS,
    });
    if ((i + 1) % REVIEW_EVERY === 0 && i < grammar.length - 1) {
      reviews += 1;
      const topics = grammar.slice(i - REVIEW_EVERY + 1, i + 1);
      const vocabs = topics.map((_, k) => vocabList[(i - REVIEW_EVERY + 1 + k) % vocabList.length]);
      nodes.push({
        index: nodes.length, type: "review", stepNumber: reviews,
        grammarTopics: topics, vocabThemes: vocabs, kinds: ["grammar"],
      });
    }
  });
  return nodes;
};

// ── A posição existe mesmo no currículo? ─────────────────────
// Devolve o nó quando (jornada, season, nó, tipo) é uma posição
// real; null caso contrário. Repare que 'kind' é conferido contra
// o nó: um Review só tem exercício de gramática.
const resolvePosition = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const { journeyId, season, node, kind } = raw;
  if (!JOURNEY_IDS.includes(journeyId)) return null;
  if (!KINDS.includes(kind)) return null;
  if (!Number.isInteger(season) || season < 0 || season >= LEVELS.length) return null;
  if (!Number.isInteger(node) || node < 0) return null;
  const nodes = buildSeasonNodes(journeyId, season);
  const found = nodes[node];
  if (!found || !found.kinds.includes(kind)) return null;
  return { journeyId, season, node, kind, nodeDef: found, nodes, level: LEVELS[season] };
};

// ── Quantas Seasons o nivelamento libera ─────────────────────
// Regra do Matheus: MENOR nível entre as habilidades. Uma
// habilidade nunca testada conta como A1 — senão um aluno que
// nivelou só Reading em C1 pularia a trilha inteira sem que sua
// gramática ou escrita tivessem sido medidas.
const seasonsSkipped = (gamification) => {
  const results = (gamification && gamification.placementResults) || {};
  const tested = PLACEMENT_SKILLS.filter((s) => results[s] && results[s].level);
  if (tested.length < PLACEMENT_SKILLS.length) {
    // Nivelamento incompleto: cai no formato antigo (nível único), se houver.
    const legacy = gamification && gamification.lastPlacementLevel;
    const idx = LEVELS.indexOf(legacy);
    return tested.length === 0 && idx > 0 ? idx : 0;
  }
  return Math.min(...PLACEMENT_SKILLS.map((s) => Math.max(0, LEVELS.indexOf(results[s].level))));
};

// ── Média e aprovação de um nó, a partir do progresso salvo ──
const nodeAverage = (nodeDef, nodeProgress) => {
  const ex = (nodeProgress && nodeProgress.exercises) || {};
  const done = nodeDef.kinds.filter((k) => ex[k]);
  const sum = done.reduce((acc, k) => acc + (ex[k].bestPct || 0), 0);
  const pct = done.length ? Math.round(sum / nodeDef.kinds.length) : 0;
  return { pct, complete: done.length === nodeDef.kinds.length, passed: done.length === nodeDef.kinds.length && pct >= STEP_PASS_PCT };
};

// ── O aluno pode estar NESTA posição agora? ──────────────────
// Uma posição é permitida quando:
//   • a Season está liberada (é a primeira, foi liberada pelo
//     nivelamento, ou a Season anterior foi concluída); E
//   • o nó é o "atual" ou algum já aprovado (revisar é livre) —
//     ou seja, não dá para saltar por cima de um Step não feito.
// Devolve { allowed, reason } para a function traduzir em HTTP.
const canAccess = (pos, progressDoc, gamification) => {
  const skipped = seasonsSkipped(gamification);
  const journeyProgress = ((progressDoc && progressDoc.journeys) || {})[pos.journeyId] || { nodes: {} };
  const nodesProgress = journeyProgress.nodes || {};
  const keyOf = (season, node) => `s${season}_n${node}`;

  const seasonPassed = (season) => {
    const nodes = buildSeasonNodes(pos.journeyId, season);
    return nodes.every((n) => nodeAverage(n, nodesProgress[keyOf(season, n.index)]).passed);
  };

  // Season liberada?
  let unlocked = pos.season === 0 || pos.season < skipped;
  if (!unlocked) {
    // Vale a anterior concluída OU a anterior ter sido pulada pelo nivelamento.
    unlocked = pos.season - 1 < skipped || seasonPassed(pos.season - 1);
  }
  if (!unlocked) return { allowed: false, reason: "SEASON_LOCKED" };

  // Numa Season liberada pelo nivelamento, o aluno circula à vontade
  // (é conteúdo abaixo do nível dele — serve de revisão).
  if (pos.season < skipped) return { allowed: true, skipped };

  // Dentro da Season: todos os nós anteriores precisam estar aprovados.
  for (let i = 0; i < pos.node; i++) {
    const def = pos.nodes[i];
    if (!nodeAverage(def, nodesProgress[keyOf(pos.season, i)]).passed) {
      return { allowed: false, reason: "STEP_LOCKED" };
    }
  }
  return { allowed: true, skipped };
};

module.exports = {
  LEVELS, KINDS, JOURNEY_IDS, REVIEW_EVERY, STEP_PASS_PCT,
  buildSeasonNodes, resolvePosition, seasonsSkipped, nodeAverage, canAccess,
};
