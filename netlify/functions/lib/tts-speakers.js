// ============================================================
// FREEDOMAPP — Vozes por personagem nos áudios de listening
// ------------------------------------------------------------
// Problema que este módulo resolve: os roteiros de listening são
// muitas vezes DIÁLOGOS ("Tom: ...", "Sarah: ..."), mas o TTS era
// chamado com UMA voz só (Kore, feminina) para o texto inteiro —
// personagem homem saía com voz de mulher e os dois personagens
// soavam idênticos.
//
// O Gemini TTS tem um modo multi-speaker: dizemos qual voz usar
// para cada rótulo de personagem e ele alterna sozinho. Este
// módulo faz as três etapas:
//   1) parseSpeakers  — acha os personagens no roteiro;
//   2) genderOfName   — deduz o gênero pelo primeiro nome;
//   3) buildTts       — monta { contents, speechConfig } prontos
//      para ai.models.generateContent (multi-voz quando o roteiro
//      é um diálogo de 2 personagens; voz única caso contrário).
//
// Usado por: journey-audio-background.js (áudio da trilha),
// placement-background.js (áudio do nivelamento) e gemini.js
// (TTS gerado "no navegador" — na verdade nesta function).
// ============================================================

// Versão do formato de áudio. Ao subir este número, os áudios já
// gravados em journey_bank passam a ser considerados obsoletos:
// journey-content deixa de servi-los e journey-audio-background
// regenera (apagando o arquivo antigo do Storage).
// v2 = vozes por personagem (antes: voz única feminina).
const AUDIO_VERSION = 2;

// ── Vozes pré-construídas do Gemini TTS, por gênero e sotaque ──
// A primeira de cada lista é a voz "titular" (a mesma que o app já
// usava no getVoiceName do front); a segunda entra quando o diálogo
// tem DOIS personagens do mesmo gênero — senão soariam iguais de novo.
const VOICES = {
  Female: { American: ["Kore", "Leda"], British: ["Zephyr", "Aoede"] },
  Male: { American: ["Puck", "Charon"], British: ["Fenrir", "Orus"] },
};

// ── Nomes ingleses comuns por gênero ──────────────────────────
// A IA gera diálogos com nomes ingleses corriqueiros; estas listas
// cobrem a imensa maioria. Nome fora das listas não quebra nada:
// o personagem recebe uma voz que CONTRASTA com a do outro.
const MALE_NAMES = new Set(("james john robert michael david william richard joseph thomas charles " +
  "christopher chris daniel dan danny matthew matt anthony tony mark donald don steven steve paul andrew andy " +
  "joshua josh kenneth ken kevin brian george edward ed eddie ronald ron timothy tim jason jeffrey jeff ryan " +
  "jacob jake gary nicholas nick eric jonathan jon stephen larry justin scott brandon benjamin ben samuel sam " +
  "frank gregory greg raymond ray alexander alex patrick pat jack dennis jerry tyler aaron jose henry adam " +
  "douglas doug nathan nate peter pete zachary zach kyle noah ethan liam mason logan lucas luke jackson " +
  "sebastian carlos luis oliver oscar leo max tom tommy mike jim jimmy bob bobby bill billy dave rick rob joe " +
  "phil philip harry arthur albert bruce carl dylan travis todd shane wayne roy ralph eugene louis marcus " +
  "victor vincent walter fred freddie howard martin keith stanley leonard craig alan sean simon colin ian " +
  "neil derek roger gordon barry trevor nigel graham stuart clive").split(" "));

const FEMALE_NAMES = new Set(("mary patricia jennifer jenny linda elizabeth liz beth barbara susan sue jessica " +
  "sarah sara karen lisa nancy betty margaret sandra ashley kimberly kim emily donna michelle carol amanda " +
  "dorothy melissa deborah debbie stephanie rebecca becky sharon laura cynthia kathleen amy angela angie " +
  "shirley anna brenda pamela pam emma nicole helen samantha katherine kate katie christine chris tina debra " +
  "rachel carolyn janet catherine cathy maria heather diane ruth julie olivia joyce virginia victoria vicky " +
  "kelly lauren christina joan evelyn judith judy megan cheryl andrea hannah jacqueline jackie martha gloria " +
  "teresa ann anne annie madison alice julia grace sophia sophie chloe zoe ella mia isabella bella ava lily " +
  "charlotte lucy amelia jane clara claire rose ellen wendy tracy paula rita monica erica diana natalie " +
  "vanessa jasmine holly abigail abby audrey brooke caroline daisy eva faith fiona gina irene ivy joanna " +
  "josephine kayla leah molly naomi nina paige penny priscilla ruby stella tessa violet").split(" "));

// "chris" aparece nas duas listas (Christopher/Christine); em caso de
// empate tratamos como desconhecido para não chutar errado.
const AMBIGUOUS = new Set(["chris"]);

const genderOfName = (name) => {
  const first = String(name || "").trim().toLowerCase().split(/[\s.'-]+/)[0];
  if (!first || AMBIGUOUS.has(first)) return null;
  if (MALE_NAMES.has(first)) return "Male";
  if (FEMALE_NAMES.has(first)) return "Female";
  return null;
};

// ── Extrai os personagens do roteiro ──────────────────────────
// Uma "fala" é uma linha no formato "Nome: texto". O rótulo precisa
// parecer nome próprio (1 a 3 palavras iniciadas em maiúscula, sem
// dígitos) para não confundir com "https:", "Note:" no meio de frase
// etc. Devolve os rótulos na ordem de primeira aparição, com a
// contagem de falas de cada um.
const parseSpeakers = (script) => {
  const counts = new Map();
  for (const raw of String(script || "").split(/\n/)) {
    const m = raw.trim().match(/^([A-Z][A-Za-z'.-]*(?: [A-Z][A-Za-z'.-]*){0,2}):\s+\S/);
    if (!m) continue;
    const label = m[1].trim();
    if (label.length > 30) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([speaker, lines]) => ({ speaker, lines }));
};

// ── Decide a voz de cada personagem ───────────────────────────
// Regras, na ordem:
//   1) nome de gênero conhecido → voz daquele gênero (é o pedido
//      do Matheus: homem com voz de homem, mulher com voz de mulher);
//   2) nome desconhecido → gênero OPOSTO ao do outro personagem,
//      para os dois nunca soarem iguais;
//   3) dois desconhecidos → primeiro feminino, segundo masculino;
//   4) dois do MESMO gênero → segunda voz do mesmo gênero (vozes
//      diferentes, gênero certo).
const assignVoices = (speakers, accent) => {
  const acc = accent === "British" ? "British" : "American";
  const g1 = genderOfName(speakers[0].speaker);
  const g2 = genderOfName(speakers[1].speaker);
  const gender1 = g1 || (g2 ? (g2 === "Male" ? "Female" : "Male") : "Female");
  const gender2 = g2 || (gender1 === "Male" ? "Female" : "Male");
  const voice1 = VOICES[gender1][acc][0];
  const voice2 = gender2 === gender1 ? VOICES[gender2][acc][1] : VOICES[gender2][acc][0];
  return [
    { speaker: speakers[0].speaker, voiceName: voice1 },
    { speaker: speakers[1].speaker, voiceName: voice2 },
  ];
};

// ── Monta a chamada de TTS pronta ─────────────────────────────
// Multi-voz só quando o roteiro tem EXATAMENTE 2 personagens (limite
// do modo multi-speaker do Gemini). Qualquer outra coisa — narração,
// anúncio, mini-podcast, 3+ vozes — segue com a voz única de sempre
// (fallbackVoice), que era o comportamento anterior.
const buildTts = (script, { accent = "American", fallbackVoice = "Kore" } = {}) => {
  const speakers = parseSpeakers(script);
  // Proteção contra falso positivo: "Visit: ..." ou "Note: ..." no
  // começo da linha também casam com o formato "Nome: fala". Um
  // diálogo de verdade alterna falas (2+ por personagem) ou usa
  // nomes reconhecíveis — se nenhum dos dois sinais aparece, é mais
  // seguro ler com voz única do que inventar personagens.
  const looksLikeDialogue = speakers.length === 2 &&
    ((speakers[0].lines >= 2 && speakers[1].lines >= 2) ||
      genderOfName(speakers[0].speaker) !== null || genderOfName(speakers[1].speaker) !== null);
  if (!looksLikeDialogue) {
    return {
      multi: false,
      contents: [{ parts: [{ text: script }] }],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: fallbackVoice } } },
    };
  }
  const assigned = assignVoices(speakers, accent);
  return {
    multi: true,
    speakers: assigned,
    // O prefixo segue o formato recomendado na documentação do modo
    // multi-speaker; ele é tratado como instrução, não é lido no áudio.
    contents: [{ parts: [{ text: `TTS the following conversation between ${assigned[0].speaker} and ${assigned[1].speaker}:\n${script}` }] }],
    speechConfig: {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: assigned.map(({ speaker, voiceName }) => ({
          speaker,
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        })),
      },
    },
  };
};

// Sotaque implícito na voz única escolhida pelo aluno no front —
// permite ao gemini.js manter o par de vozes coerente com o sotaque.
const accentOfVoice = (voiceName) =>
  ["Fenrir", "Zephyr", "Orus", "Aoede"].includes(voiceName) ? "British" : "American";

module.exports = { AUDIO_VERSION, parseSpeakers, genderOfName, assignVoices, buildTts, accentOfVoice, VOICES };
