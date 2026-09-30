// ============================================================
// FREEDOMAPP — Function: duel-audio-background
// ------------------------------------------------------------
// Gera o ÁUDIO de verdade das perguntas de Listening do Duelo da
// Roleta (Gemini TTS) e guarda no Firebase Storage. Cada pergunta é
// gerada UMA vez e todos os alunos tocam o mesmo arquivo.
//
// Por que existe: a primeira versão usava a voz do próprio navegador
// (speechSynthesis). No teste real do Matheus (30/09) o áudio não
// saiu — essa voz falha em silêncio em vários aparelhos (iPhone no
// modo silencioso, Chrome logo depois de um cancel(), vozes que não
// carregaram). Um arquivo de áudio comum toca em qualquer aparelho e
// ainda avisa com precisão quando terminou, que é o momento em que o
// tempo de resposta começa a contar.
//
// Dois modos (sempre com assinatura HMAC — a URL é pública):
//   { qid }   → gera o áudio de UMA pergunta (pedido pela duel.js
//               quando a pergunta sai sem áudio pronto).
//   { warm }  → gera, em lote, os áudios das perguntas de listening
//               do banco fixo que ainda não têm (dispara uma vez,
//               na primeira abertura da aba Desafios).
// ============================================================

const { GoogleGenAI, Modality } = require("@google/genai");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { verifyScoped } = require("./lib/journey-sign");
const { FILES } = require("./lib/duel-bank");

const MODEL = "gemini-2.5-flash-preview-tts";
const VERSION = 1;
// Vozes americanas do Gemini TTS (2 femininas, 2 masculinas). A voz
// de cada pergunta sai do próprio id, então é sempre a mesma.
const VOICES = ["Kore", "Puck", "Leda", "Charon"];
const CONCURRENCY = 3;

const initFirebase = () => {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
    });
  }
  return { db: getFirestore(), bucket: getStorage().bucket() };
};

// PCM 16-bit/24kHz/mono (o que o Gemini devolve) → WAV tocável.
const pcmToWav = (pcm, sampleRate = 24000) => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

const voiceFor = (qid) => {
  let h = 0;
  for (const c of String(qid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return VOICES[h % VOICES.length];
};

// Acha o texto do áudio: banco fixo ou perguntas geradas pela IA.
const STATIC = new Map(FILES.listening.map((q) => [q.id, q]));
const findText = async (db, qid) => {
  if (STATIC.has(qid)) return STATIC.get(qid).audio;
  const m = /^ai-li-(a1|a2|b1|b2|c1)-/.exec(qid);
  if (!m) return null;
  const doc = await db.collection("duel_bank").doc(`listening_${m[1].toUpperCase()}`).get();
  const item = ((doc.data() || {}).items || []).find((x) => x.id === qid);
  return item ? item.audio : null;
};

const generateOne = async (ai, db, bucket, qid) => {
  const ref = db.collection("duel_audio").doc(qid);
  const cur = (await ref.get()).data() || {};
  if (cur.status === "ready" && cur.url) return "já existe";
  const text = await findText(db, qid);
  if (!text) { await ref.set({ status: "error", error: "texto não encontrado", fails: 3 }, { merge: true }); return "sem texto"; }
  try {
    const voice = voiceFor(qid);
    const resp = await ai.models.generateContent({
      model: MODEL,
      // Instrução curta para a leitura sair clara e num ritmo de
      // prova de listening (é tratada como instrução, não é lida).
      contents: [{ parts: [{ text: `Say clearly, at a natural but unhurried pace: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const part = resp.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData?.data) throw new Error("TTS não retornou áudio.");
    const path = `duel_audio/v${VERSION}/${qid}.wav`;
    await bucket.file(path).save(pcmToWav(Buffer.from(part.inlineData.data, "base64")), {
      metadata: { contentType: "audio/wav", cacheControl: "public, max-age=31536000" },
      public: true,
    });
    const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
    await ref.set({ status: "ready", url, voice, version: VERSION, readyAt: Date.now(), lockAt: null }, { merge: true });
    return "ok";
  } catch (e) {
    console.error("duel-audio:", qid, String(e?.message || e).slice(0, 200));
    await ref.set({ status: "error", lockAt: null, fails: FieldValue.increment(1), error: String(e?.message || e).slice(0, 300) }, { merge: true }).catch(() => {});
    return "erro";
  }
};

exports._internals = { pcmToWav, voiceFor };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "" }; }
  if (!process.env.GEMINI_API_KEY || !process.env.FIREBASE_PROJECT_ID) return { statusCode: 500, body: "config" };
  const { db, bucket } = initFirebase();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  if (body.warm) {
    if (!verifyScoped("duel-audio", "warm", body.signature)) return { statusCode: 403, body: "" };
    const ids = [...STATIC.keys()];
    const snaps = await db.getAll(...ids.map((id) => db.collection("duel_audio").doc(id)));
    // Pula as prontas e as que já falharam 3 vezes (evita gastar em looping).
    const todo = ids.filter((id, i) => { const a = snaps[i].exists ? snaps[i].data() : {}; return a.status !== "ready" && (a.fails || 0) < 3; });
    let ok = 0, fail = 0;
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const res = await Promise.all(todo.slice(i, i + CONCURRENCY).map((id) => generateOne(ai, db, bucket, id)));
      res.forEach((r) => (r === "erro" ? fail++ : ok++));
    }
    await db.collection("duel_meta").doc("audio").set(
      fail === 0 ? { warmDoneAt: Date.now(), version: VERSION, lastFails: 0 } : { warmStartedAt: null, lastFails: fail, lastRunAt: Date.now() },
      { merge: true });
    console.log(`duel-audio warm: ${ok} ok, ${fail} falhas, ${ids.length - todo.length} já existiam`);
    return { statusCode: 200, body: "" };
  }

  const qid = String(body.qid || "");
  if (!/^(li-(a1|a2|b1|b2|c1)-\d{2}|ai-li-[a-z0-9-]+)$/.test(qid)) return { statusCode: 400, body: "" };
  if (!verifyScoped("duel-audio", qid, body.signature)) return { statusCode: 403, body: "" };
  const r = await generateOne(ai, db, bucket, qid);
  console.log("duel-audio:", qid, r);
  return { statusCode: 200, body: "" };
};
