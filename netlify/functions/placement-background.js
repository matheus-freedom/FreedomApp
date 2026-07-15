// ============================================================
// FREEDOMAPP — Background Function: placement-background
// ------------------------------------------------------------
// Gera UMA variação de UMA habilidade do nivelamento e grava:
//   (a) o resultado permanente em  placement_bank/{skill_quarter_vN}
//   (b) um carimbo de status em    placement_jobs/{jobId}  (efêmero)
//
// O front gera o jobId, dispara esta função, e faz polling em
// placement_jobs/{jobId} até status === "done". Aí lê a variação
// pronta do placement_bank (que a Etapa 2 já sabe ler).
//
// Padrão herdado do gemini-background.js do FreedomLPG (Admin SDK,
// upload ao Storage, carimbo de job). Adaptado para nivelamento.
// ============================================================

const { GoogleGenAI, Modality } = require("@google/genai");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

// ── Constantes do nivelamento (espelham as da fundação types.ts) ──
// Repetidas aqui porque a função roda em Node puro e não importa o
// bundle do front. Se mudar na fundação, mudar aqui também.
const QUESTIONS_PER_LEVEL = 10;
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"];
const TOTAL_QUESTIONS = QUESTIONS_PER_LEVEL * LEVEL_ORDER.length; // 50

// ── Inicialização do Firebase Admin (idêntico ao molde do LPG) ──
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

// ── Carimba o status do job (para o polling do front) ──────────
const saveJobStatus = async (db, jobId, data) => {
  await db.collection("placement_jobs").doc(jobId).set({
    ...data,
    updatedAt: Date.now(),
  });
};

// ── Grava a variação pronta no banco permanente ────────────────
const saveBankEntry = async (db, entry) => {
  await db.collection("placement_bank").doc(entry.id).set(entry);
};

// ── Envelopa PCM bruto (saída do TTS Gemini) em container WAV ───
// O TTS devolve PCM 16-bit, 24kHz, mono, SEM cabeçalho. Sem este
// envelope, o navegador não toca o arquivo. Adiciona os 44 bytes
// de cabeçalho WAV na frente do PCM.
const pcmToWav = (pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) => {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);              // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
};

// ── Gera UM áudio TTS e sobe pro Storage; devolve a URL pública ─
const generateAndUploadAudio = async (ai, bucket, script, jobId, level) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: script }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
      },
    },
  });
  const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!audioPart?.inlineData?.data) {
    throw new Error(`TTS não retornou áudio para o nível ${level}.`);
  }
  const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
  const wavBuffer = pcmToWav(pcmBuffer);

  const filePath = `placement_audio/${jobId}/${level}.wav`;
  const file = bucket.file(filePath);
  await file.save(wavBuffer, {
    metadata: { contentType: "audio/wav" },
    public: true,
  });
  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
};

// ── Prompts de geração por habilidade ──────────────────────────
// Cada um pede as 25 questões (5 por nível, dificuldade crescente),
// em JSON estrito. Reading traz um texto por nível; listening traz
// um roteiro (script) por nível para virar áudio.

const buildQuestionsPrompt = (skill) => {
  const base = `You are an expert CEFR English examiner. Generate a placement test for the "${skill}" skill.
Produce EXACTLY ${TOTAL_QUESTIONS} multiple-choice questions: ${QUESTIONS_PER_LEVEL} per CEFR level, in this order: ${LEVEL_ORDER.join(", ")}.
Difficulty MUST increase strictly and NOTICEABLY with the level. A1 = very basic, C1 = advanced/nuanced. A student at level X should find level X+1 clearly harder.
Each question has exactly 4 options and one correct answer. The 3 wrong options must be plausible distractors, not obviously wrong.

Return ONLY valid JSON (no markdown, no backticks) in this shape:
{
  "questions": [
    {
      "level": "A1",
      "question": "the question in ENGLISH",
      "options": ["opt1","opt2","opt3","opt4"],
      "correctAnswerIndex": 0,
      "explanation": "explicação da resposta correta em PORTUGUÊS BRASILEIRO"
    }
  ]
}`;

  if (skill === "grammar") {
    return base + `

This is a GRAMMAR test. CRITICAL REQUIREMENTS:
- Within EACH level, the ${QUESTIONS_PER_LEVEL} questions MUST cover AT LEAST 8 DIFFERENT grammar topics. Do NOT repeat the same tense or structure across most questions — variety is mandatory. Spread the questions across the topics listed for that level.
- Use the CEFR grammar progression below. Each level must test structures from ITS OWN band, clearly harder than the previous level:

A1 (basic): verb "to be", present simple, articles (a/an/the), personal pronouns, possessive adjectives, plural nouns, demonstratives (this/that/these/those), prepositions of place (in/on/at), "there is/there are", basic question words (what/where/who).

A2 (elementary): past simple (regular & irregular), present continuous, "going to" future, comparatives and superlatives, countable/uncountable (some/any/much/many), adverbs of frequency, "have to"/"must" (obligation), prepositions of time, object pronouns, "like/love/hate + -ing".

B1 (intermediate): present perfect (for/since/ever/never), past continuous vs past simple, first conditional, "will" vs "going to", modal verbs (should/could/might), reported speech (basic), relative clauses (who/which/that), used to, question tags, "too/enough".

B2 (upper-intermediate): second and third conditionals, passive voice (all tenses), present perfect continuous, past perfect, modals of deduction (must/can't/might have), reported speech (full), relative clauses (defining/non-defining), gerunds vs infinitives, "wish/if only", causative "have/get something done".

C1 (advanced): mixed conditionals, inversion (hardly/no sooner/not only), cleft sentences (it was... / what... ), advanced modals and speculation, subjunctive, participle clauses, ellipsis and substitution, nuanced use of articles, complex passive and reporting structures, discourse markers and cohesion.

Make the C1 questions genuinely challenging even for advanced learners. Make A1 genuinely easy for beginners. The jump in difficulty between bands must be obvious.`;
  }

  if (skill === "reading") {
    return base + `

This is a READING test. For EACH level, write a short reading passage appropriate to that level (longer and more complex as the level rises), and base that level's ${QUESTIONS_PER_LEVEL} questions on it. Put the passage text in a "readingText" field on EACH of the ${QUESTIONS_PER_LEVEL} questions of that level (same text repeated). Questions test comprehension, inference and vocabulary in context, getting harder by level.`;
  }

  // listening
  return base + `

This is a LISTENING test. For EACH level, write a short spoken-style script (a monologue or short dialogue) appropriate to that level (longer and more natural/faster as the level rises), and base that level's ${QUESTIONS_PER_LEVEL} questions on it. Put the script in a "listeningScript" field on EACH of the ${QUESTIONS_PER_LEVEL} questions of that level (same script repeated). The student will HEAR this script (not read it). Questions test listening comprehension: detail, gist, inference.`;
};

const buildWritingPrompt = () => {
  return `You are an expert CEFR English examiner. Create ONE open-ended writing task for an English placement test.
The task should let a student of ANY level (A1 to C1) attempt it, producing a text you could then classify by CEFR level based on lexical and syntactic complexity.
Return ONLY valid JSON (no markdown) in this shape:
{
  "writingPrompt": "the writing task instructions in ENGLISH",
  "writingPromptPT": "as mesmas instruções em PORTUGUÊS BRASILEIRO"
}`;
};

// ── Extrai JSON de forma tolerante (remove cercas se vierem) ────
const parseJson = (text) => {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

// ── Handler ────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return;

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return;
  }

  const { jobId, skill, quarterKey, variation } = body;
  if (!jobId || !skill || !quarterKey || !variation) {
    // Sem jobId não há como sinalizar erro ao front; só encerra.
    return;
  }

  let db, bucket;
  try {
    const fb = initFirebase();
    db = fb.db;
    bucket = fb.bucket;
  } catch (e) {
    return; // Sem Firebase não há onde carimbar; a função morre e o polling expira.
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const bankId = `${skill}_${quarterKey}_v${variation}`;

  try {
    await saveJobStatus(db, jobId, { status: "working", skill, variation });

    const entry = {
      id: bankId,
      skill,
      quarterKey,
      variation: Number(variation),
      questions: [],
      createdAt: Date.now(),
    };

    if (skill === "writing") {
      // Writing: sem questões de múltipla escolha, só o enunciado.
      const resp = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: buildWritingPrompt(),
        config: { responseMimeType: "application/json" },
      });
      const data = parseJson(resp.text);
      entry.writingPrompt = data.writingPrompt || "";
      entry.writingPromptPT = data.writingPromptPT || "";
    } else {
      // Grammar / Reading / Listening: 25 questões.
      const resp = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: buildQuestionsPrompt(skill),
        config: { responseMimeType: "application/json" },
      });
      const data = parseJson(resp.text);
      let questions = Array.isArray(data.questions) ? data.questions : [];

      // Normaliza id sequencial e garante o campo level.
      questions = questions.map((q, i) => ({
        id: i + 1,
        level: q.level || LEVEL_ORDER[Math.floor(i / QUESTIONS_PER_LEVEL)] || "A1",
        question: q.question || "",
        questionPT: q.questionPT || "",
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswerIndex: typeof q.correctAnswerIndex === "number" ? q.correctAnswerIndex : 0,
        explanation: q.explanation || "",
        ...(skill === "reading" ? { readingText: q.readingText || "" } : {}),
        ...(skill === "listening" ? { listeningScript: q.listeningScript || "" } : {}),
      }));

      entry.questions = questions;

      // Listening: gera 1 áudio por nível (5 no total) e monta o mapa.
      if (skill === "listening") {
        const levelAudios = {};
        for (const level of LEVEL_ORDER) {
          // Pega o script do primeiro item daquele nível.
          const q = questions.find(x => x.level === level && x.listeningScript);
          const script = q?.listeningScript;
          if (script) {
            levelAudios[level] = await generateAndUploadAudio(ai, bucket, script, jobId, level);
          }
        }
        entry.levelAudios = levelAudios;
      }
    }

    // Grava a variação permanente e carimba o job como concluído.
    await saveBankEntry(db, entry);
    await saveJobStatus(db, jobId, { status: "done", bankId });

  } catch (error) {
    try {
      await saveJobStatus(db, jobId, {
        status: "error",
        error: error?.message || "Erro desconhecido na geração.",
      });
    } catch {
      // se nem o carimbo de erro salvar, o polling do front expira sozinho
    }
  }
};
