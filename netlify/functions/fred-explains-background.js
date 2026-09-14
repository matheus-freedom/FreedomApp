// ============================================================
// FREEDOMAPP — Function: fred-explains-background
// ------------------------------------------------------------
// Gera UMA aula do "Fred explica" e grava em fred_lessons/{id}.
//
// Por que em background? Uma aula completa (5-6 seções, exemplos,
// mini-quizzes, pegadinhas, resumo e checkpoint) tem 3 a 5 mil
// tokens de saída. Com o modelo Pro isso leva 40-90 segundos —
// muito além dos 26s da function síncrona. Aqui a Netlify dá 15
// minutos (sufixo "-background").
//
// Quem chama é a fred-explains, com assinatura HMAC (a URL desta
// function é pública; sem a assinatura, qualquer pessoa poderia
// disparar gerações pagas em looping).
//
// Idempotente: se a aula já está pronta (e não é um "regenerate"
// do admin), sai na hora sem gastar IA.
//
// Modelos: tenta o Pro; se falhar (erro, chave sem acesso, JSON
// inválido duas vezes), cai para o Flash. O nome do modelo usado
// fica gravado no doc — dá para saber depois qual aula veio de qual.
// ============================================================

const { GoogleGenAI } = require("@google/genai");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { verifyScoped } = require("./lib/journey-sign");
const { resolveLesson, FRED_PERSONA, buildPrompt, LESSON_SCHEMA, normalizeLesson, MODELS } = require("./lib/fred-core");

const ATTEMPTS_PER_MODEL = 2;
// Tempo máximo de UMA chamada ao Gemini. Sem isto, uma chamada travada
// segura a function até o limite de 15 min e a aula nunca sai do
// "generating" (e o aluno fica olhando o relógio).
const CALL_TIMEOUT_MS = { "gemini-3.1-pro-preview": 240000, "gemini-3.5-flash": 120000 };

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

const parseLoose = (text) => {
  let clean = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch { /* repara */ }
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a >= 0 && b > a) clean = clean.slice(a, b + 1);
  return JSON.parse(clean.replace(/,\s*([}\]])/g, "$1"));
};

// Exposto para o teste de geração real (test-fred.mjs --live).
const generateLesson = async (ai, entry, log = console.log) => {
  let lastErr = null;
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      const t0 = Date.now();
      try {
        const response = await ai.models.generateContent({
          model,
          contents: buildPrompt(entry),
          config: {
            systemInstruction: FRED_PERSONA,
            responseMimeType: "application/json",
            responseSchema: LESSON_SCHEMA,
            // Um pouco de criatividade para as analogias, sem virar caos.
            temperature: 0.8,
            httpOptions: { timeout: CALL_TIMEOUT_MS[model] || 120000 },
          },
        });
        const lesson = normalizeLesson(parseLoose(response.text));
        if (lesson) {
          log(`fred-explains-background: ${entry.id} OK com ${model} (tentativa ${attempt}, ${Math.round((Date.now() - t0) / 1000)}s)`);
          return { lesson, model };
        }
        lastErr = new Error(`Conteúdo inválido (${model}, tentativa ${attempt})`);
        log(`fred-explains-background: ${entry.id} conteúdo inválido com ${model} (tentativa ${attempt})`);
      } catch (e) {
        lastErr = e;
        log(`fred-explains-background: ${entry.id} erro com ${model} (tentativa ${attempt}): ${String(e?.message || e).slice(0, 200)}`);
        // Modelo indisponível para esta chave (404/permissão): não
        // adianta insistir nele — pula direto para o próximo.
        const msg = String(e?.message || "");
        if (/not found|NOT_FOUND|permission|PERMISSION_DENIED|not supported/i.test(msg)) break;
      }
    }
  }
  throw lastErr || new Error("Falha na geração.");
};

exports._internals = { generateLesson, parseLoose };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "" }; }

  const { id, force, signature } = body;
  if (!verifyScoped("fred-lesson", id, signature)) {
    console.error("fred-explains-background: assinatura inválida", id);
    return { statusCode: 403, body: "" };
  }
  const entry = resolveLesson({ id });
  if (!entry) return { statusCode: 400, body: "" };
  if (!process.env.GEMINI_API_KEY) { console.error("fred-explains-background: sem GEMINI_API_KEY"); return { statusCode: 500, body: "" }; }

  const db = initFirebase();
  const ref = db.collection("fred_lessons").doc(id);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
  if (current.status === "ready" && current.content && !force) return { statusCode: 200, body: "" };

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const now = Date.now();
  try {
    const { lesson, model } = await generateLesson(ai, entry);
    await ref.set({
      id, level: entry.level, topic: entry.topic,
      status: "ready", content: lesson, model,
      generatedAt: Date.now(), updatedAt: Date.now(),
      attempts: (current.attempts || 0) + 1, lastError: null,
    }, { merge: true });
    // Índice leve (só ids) para o catálogo mostrar "pronta" sem
    // baixar o conteúdo de todas as aulas.
    await db.collection("fred_meta").doc("index").set({ ready: { [id]: true }, updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.error("fred-explains-background: falhou", id, e);
    await ref.set({
      status: "error", attempts: (current.attempts || 0) + 1,
      lastError: String(e?.message || e).slice(0, 500), updatedAt: now,
    }, { merge: true }).catch(() => {});
  }
  return { statusCode: 200, body: "" };
};
