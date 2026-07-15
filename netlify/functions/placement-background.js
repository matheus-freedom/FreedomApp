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

// Temas gramaticais por nível CEFR (>= 8 por nível). Usados para
// forçar variedade e dificuldade real na geração nível-a-nível.
const GRAMMAR_TOPICS = {
  A1: 'verb "to be", present simple, articles (a/an/the), personal pronouns, possessive adjectives, plural nouns, demonstratives (this/that/these/those), prepositions of place (in/on/at), "there is/there are", basic question words (what/where/who)',
  A2: 'past simple (regular & irregular), present continuous, "going to" future, comparatives and superlatives, countable/uncountable (some/any/much/many), adverbs of frequency, "have to"/"must" (obligation), prepositions of time, object pronouns, "like/love/hate + -ing"',
  B1: 'present perfect (for/since/ever/never), past continuous vs past simple, first conditional, "will" vs "going to", modal verbs (should/could/might), reported speech (basic), relative clauses (who/which/that), used to, question tags, "too/enough"',
  B2: 'second and third conditionals, passive voice (all tenses), present perfect continuous, past perfect, modals of deduction (must/can\'t/might have), reported speech (full), relative clauses (defining/non-defining), gerunds vs infinitives, "wish/if only", causative "have/get something done"',
  C1: 'mixed conditionals, inversion (hardly/no sooner/not only), cleft sentences, advanced modals and speculation, subjunctive, participle clauses, ellipsis and substitution, nuanced use of articles, complex passive and reporting structures, discourse markers and cohesion',
};

// ── Prompt para gerar ${QUESTIONS_PER_LEVEL} questões de UM nível ──
// Gerar nível a nível (5 chamadas de 10) é muito mais confiável que
// pedir as 50 de uma vez, onde o modelo corta a resposta no meio.
const buildLevelQuestionsPrompt = (skill, level) => {
  const base = `You are an expert CEFR English examiner. Generate EXACTLY ${QUESTIONS_PER_LEVEL} multiple-choice questions for the "${skill}" skill, ALL at CEFR level ${level}.
Each question has exactly 4 options and one correct answer. The 3 wrong options must be plausible distractors, not obviously wrong.
The questions must be clearly at ${level} level — not easier, not harder.

Return ONLY valid JSON (no markdown, no backticks) in this shape:
{
  "questions": [
    {
      "question": "the question in ENGLISH",
      "options": ["opt1","opt2","opt3","opt4"],
      "correctAnswerIndex": 0,
      "explanation": "explicação da resposta correta em PORTUGUÊS BRASILEIRO"
    }
  ]
}`;

  if (skill === "grammar") {
    return base + `

This is a GRAMMAR test at level ${level}. CRITICAL:
- The ${QUESTIONS_PER_LEVEL} questions MUST cover AT LEAST 8 DIFFERENT grammar topics from the list below. Do NOT repeat the same tense/structure across most questions — variety is mandatory.
- Topics for ${level}: ${GRAMMAR_TOPICS[level] || "level-appropriate grammar"}.
- Make them genuinely at ${level} difficulty.`;
  }

  if (skill === "reading") {
    return base + `

This is a READING test at level ${level}. Write ONE short reading passage appropriate to ${level} (more complex for higher levels), and base all ${QUESTIONS_PER_LEVEL} questions on it. Put the SAME passage text in a "readingText" field on EACH question. Test comprehension, inference and vocabulary in context.`;
  }

  // listening
  return base + `

This is a LISTENING test at level ${level}. Write ONE short spoken-style script (monologue or dialogue) appropriate to ${level} (more natural/faster for higher levels), and base all ${QUESTIONS_PER_LEVEL} questions on it. Put the SAME script in a "listeningScript" field on EACH question. The student will HEAR this (not read it). Test detail, gist, inference.`;
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

// ── Extrai JSON de forma tolerante e reparadora ────────────────
// LLMs às vezes devolvem JSON levemente quebrado (vírgula final,
// texto antes/depois, cercas de markdown). Esta função tenta o
// parse direto e, se falhar, aplica reparos comuns antes de desistir.
const parseJson = (text) => {
  let clean = String(text || "").replace(/```json|```/g, "").trim();

  // 1ª tentativa: parse direto.
  try {
    return JSON.parse(clean);
  } catch (e) { /* segue para reparo */ }

  // Reparo: recorta do primeiro { ao último } (remove lixo em volta).
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }

  // Reparo: remove vírgulas finais antes de } ou ] (trailing commas).
  clean = clean.replace(/,\s*([}\]])/g, "$1");

  // 2ª tentativa após reparos.
  try {
    return JSON.parse(clean);
  } catch (e) {
    // 3ª tentativa: tenta recuperar apenas o array "questions" completo,
    // truncando na última questão bem-formada (fecha em "}" seguido de "]").
    const qStart = clean.indexOf('"questions"');
    if (qStart >= 0) {
      const arrStart = clean.indexOf("[", qStart);
      if (arrStart >= 0) {
        // Encontra o último "}" antes de um "]" ou fim — fecha o array ali.
        const lastObj = clean.lastIndexOf("}");
        if (lastObj > arrStart) {
          const salvaged = clean.slice(arrStart, lastObj + 1) + "]";
          try {
            const arr = JSON.parse(salvaged);
            if (Array.isArray(arr)) return { questions: arr };
          } catch (e2) { /* desiste */ }
        }
      }
    }
    throw e;
  }
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
      // Grammar / Reading / Listening: gera NÍVEL POR NÍVEL.
      // Pedir 50 questões num JSON só faz o modelo cortar a resposta.
      // 5 chamadas de 10 questões cada são muito mais confiáveis, e a
      // Background Function tem 15 min de folga para isso.
      let allQuestions = [];
      for (let li = 0; li < LEVEL_ORDER.length; li++) {
        const level = LEVEL_ORDER[li];

        // Retry: até 3 tentativas por nível. LLM pode devolver JSON
        // quebrado; em vez de derrubar o teste inteiro, tenta de novo.
        let levelQs = [];
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const resp = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: buildLevelQuestionsPrompt(skill, level),
              config: {
                responseMimeType: "application/json",
                maxOutputTokens: 8192,
              },
            });
            const data = parseJson(resp.text);
            const parsed = Array.isArray(data.questions) ? data.questions : [];
            // Só aceita se veio uma quantidade razoável (>= metade do pedido).
            if (parsed.length >= Math.ceil(QUESTIONS_PER_LEVEL / 2)) {
              levelQs = parsed;
              break;
            }
            lastErr = new Error(`Nível ${level}: veio só ${parsed.length} questões.`);
          } catch (e) {
            lastErr = e;
          }
        }

        // Se após 3 tentativas ainda falhou, aborta a geração inteira
        // com erro claro (melhor que gravar um banco incompleto).
        if (levelQs.length === 0) {
          throw new Error(`Falha ao gerar o nível ${level} após 3 tentativas. ${lastErr?.message || ""}`);
        }

        // Normaliza, forçando o nível correto (o desta iteração).
        levelQs = levelQs.slice(0, QUESTIONS_PER_LEVEL).map((q) => ({
          level,
          question: q.question || "",
          questionPT: q.questionPT || "",
          options: Array.isArray(q.options) ? q.options : [],
          correctAnswerIndex: typeof q.correctAnswerIndex === "number" ? q.correctAnswerIndex : 0,
          explanation: q.explanation || "",
          ...(skill === "reading" ? { readingText: q.readingText || "" } : {}),
          ...(skill === "listening" ? { listeningScript: q.listeningScript || "" } : {}),
        }));

        allQuestions = allQuestions.concat(levelQs);
      }

      // Atribui ids sequenciais no fim.
      const questions = allQuestions.map((q, i) => ({ id: i + 1, ...q }));
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
