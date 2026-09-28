// ============================================================
// FREEDOMAPP — Function: duel-bank-background
// ------------------------------------------------------------
// Gera uma LEVA de perguntas novas para o Duelo da Roleta quando
// alunos estão perto de esgotar as perguntas de uma categoria+nível
// (ex.: "grammar_B1"). As perguntas ficam em duel_bank/{cat_nível}
// e passam a valer para a escola inteira — mesma regra de economia
// do Fred explica: gera uma vez, todo mundo reaproveita.
//
// Quem chama é a function duel.js, com assinatura HMAC (a URL de uma
// background function é pública; sem assinatura, qualquer um
// dispararia gerações pagas em looping). Há também um teto de
// perguntas por categoria+nível (AI_BUCKET_CAP), então o gasto
// máximo desta funcionalidade é fixo.
//
// Modelo: Flash primeiro (rápido e barato — pergunta de quiz é
// curta); se falhar, tenta o Pro.
// ============================================================

const { GoogleGenAI, Type } = require("@google/genai");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { verifyScoped } = require("./lib/journey-sign");
const core = require("./lib/duel-core");
const { staticPool } = require("./lib/duel-bank");

const BATCH = 15;
const MODELS = ["gemini-3.5-flash", "gemini-3.1-pro-preview"];

const CAT_BRIEF = {
  grammar: "Grammar: fill the gap (___) or choose the correct sentence. Verb tenses, prepositions, articles, comparatives, conditionals, passive, modals, reported speech, inversion (C1).",
  vocabulary: "Vocabulary: word meaning, synonyms/antonyms, the word that completes the sentence, collocations (make/do), false friends for Brazilians, word formation at higher levels.",
  reading: "Reading: a short text in the field \"passage\" (notice, message, short e-mail, ad, news excerpt; max 280 characters) and ONE comprehension question answerable only from the text.",
  listening: "Listening: the field \"audio\" is spoken by the browser's speech synthesizer (the student does NOT see it before answering). Natural sentences, numbers written as words (\"at seven thirty\"), no abbreviations. \"q\" asks about what was heard.",
  travel: "Travel English: airport (check-in, luggage, immigration, gates, connections, delays), hotel, transport and directions, eating out and shopping abroad, money exchange, emergencies, sightseeing, signs and notices, natural tourist phrases.",
  everyday: "Everyday English: daily expressions, phrasal verbs, idioms, natural replies in situations (home, friends, shopping, social media, and everyday WORK life: e-mails, meetings, phone calls, job interviews, colleagues), current common slang at higher levels.",
};

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          q: { type: Type.STRING },
          passage: { type: Type.STRING },
          audio: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          answer: { type: Type.INTEGER },
          explain: { type: Type.STRING },
        },
        required: ["q", "options", "answer", "explain"],
      },
    },
  },
  required: ["items"],
};

const initFirebase = () => {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
};

const buildPrompt = (cat, level, avoid) => {
  const samples = staticPool(cat, level).slice(0, 3).map(({ q, passage, audio, options, answer, explain }) =>
    JSON.stringify({ q, passage, audio, options, answer, explain }));
  return [
    `Write ${BATCH} NEW multiple-choice questions for a quick English quiz game played by Brazilian students.`,
    `Category: ${CAT_BRIEF[cat]}`,
    `CEFR level: ${level}. The difficulty must really match ${level}.`,
    "Rules:",
    "- Exactly 4 short options, all different, ONE unambiguously correct answer (valid in both American and British English). The other 3 must be clearly wrong for someone who knows, but plausible for a Brazilian learner.",
    "- \"answer\" is the 0-based index of the correct option. Vary its position.",
    "- \"q\" max 160 characters. Options max 60 characters. No \"all/none of the above\".",
    "- \"explain\": ONE sentence in Brazilian Portuguese (max 150 characters) teaching WHY the answer is right. Never use the phrases \"Regra de ouro\" or \"Dica de ouro\".",
    cat === "reading" ? "- Every item MUST have \"passage\"." : "- Do NOT include \"passage\".",
    cat === "listening" ? "- Every item MUST have \"audio\" (max 200 characters)." : "- Do NOT include \"audio\".",
    "- Suitable for teenagers: no alcohol, politics, religion or violence. Vary names and topics.",
    "Examples of the expected style:",
    ...samples,
    avoid.length ? `Do NOT repeat or paraphrase these existing questions:\n${avoid.join("\n")}` : "",
    "Return JSON: {\"items\": [...]}.",
  ].join("\n");
};

const parseLoose = (text) => {
  let clean = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch { /* repara */ }
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a >= 0 && b > a) clean = clean.slice(a, b + 1);
  return JSON.parse(clean.replace(/,\s*([}\]])/g, "$1"));
};

// Limpa e valida o que veio da IA. Descarta o que não passa na mesma
// validação do banco fixo e o que repete enunciado já existente.
const cleanItems = (raw, cat, level, existingStems, stamp) => {
  const out = [];
  const stems = new Set(existingStems);
  (raw || []).forEach((it, i) => {
    const item = {
      id: `ai-${cat.slice(0, 2)}-${level.toLowerCase()}-${stamp}-${i}`,
      cat, level,
      q: String(it.q || "").trim(),
      options: Array.isArray(it.options) ? it.options.map((o) => String(o).trim()) : [],
      answer: Number(it.answer),
      explain: String(it.explain || "").trim(),
    };
    if (cat === "reading") item.passage = String(it.passage || "").trim();
    if (cat === "listening") item.audio = String(it.audio || "").trim();
    const stem = `${item.passage || item.audio || ""}|${item.q}`.toLowerCase();
    if (core.validateItem(item, cat, level).length || stems.has(stem)) return;
    stems.add(stem);
    out.push(item);
  });
  return out;
};

exports._internals = { buildPrompt, cleanItems, parseLoose };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "" }; }
  const { bucket, signature } = body;
  if (!verifyScoped("duel-bank", bucket, signature)) { console.error("duel-bank: assinatura inválida", bucket); return { statusCode: 403, body: "" }; }
  const [cat, level] = String(bucket).split("_");
  if (!core.CATEGORIES.includes(cat) || !core.LEVELS.includes(level)) return { statusCode: 400, body: "" };
  if (!process.env.GEMINI_API_KEY) { console.error("duel-bank: sem GEMINI_API_KEY"); return { statusCode: 500, body: "" }; }

  const db = initFirebase();
  const ref = db.collection("duel_bank").doc(bucket);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data().items || []) : [];
  if (existing.length >= core.AI_BUCKET_CAP) { await ref.set({ generatingSince: null }, { merge: true }); return { statusCode: 200, body: "" }; }

  const all = [...staticPool(cat, level), ...existing];
  const existingStems = all.map((q) => `${q.passage || q.audio || ""}|${q.q}`.toLowerCase());
  const avoid = all.slice(-60).map((q) => `- ${q.q}`);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let fresh = [], model = null;
  for (const m of MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model: m,
        contents: buildPrompt(cat, level, avoid),
        config: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.9, httpOptions: { timeout: 120000 } },
      });
      fresh = cleanItems(parseLoose(resp.text).items, cat, level, existingStems, Date.now().toString(36));
      if (fresh.length) { model = m; break; }
    } catch (e) {
      console.error(`duel-bank: ${bucket} erro com ${m}:`, String(e?.message || e).slice(0, 200));
    }
  }

  // Grava com transação: outra geração do mesmo bucket pode ter
  // terminado no meio tempo.
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const cur = s.exists ? (s.data().items || []) : [];
    const ids = new Set(cur.map((x) => x.id));
    const merged = [...cur, ...fresh.filter((x) => !ids.has(x.id))].slice(0, core.AI_BUCKET_CAP);
    tx.set(ref, { items: merged, count: merged.length, generatingSince: null, lastModel: model, updatedAt: Date.now() }, { merge: true });
  });
  console.log(`duel-bank: ${bucket} +${fresh.length} perguntas (${model || "falhou"})`);
  return { statusCode: 200, body: "" };
};
