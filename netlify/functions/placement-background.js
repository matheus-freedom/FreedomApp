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

// ── Trava por variação (evita gerar a mesma coisa duas vezes) ───
// Quando dois alunos abriam a mesma habilidade ao mesmo tempo, os
// dois disparavam a geração da MESMA variação: trabalho e cota de
// IA em dobro, e um sobrescrevendo o outro. create() falha se o
// documento já existe, então quem chega primeiro leva a trava.
// Uma trava velha (função morreu no meio) é considerada abandonada.
const LOCK_STALE_MS = 20 * 60 * 1000;

const acquireLock = async (db, bankId) => {
  const ref = db.collection("placement_locks").doc(bankId);
  try {
    await ref.create({ startedAt: Date.now() });
    return true;
  } catch {
    // Já existe: só assume se estiver abandonada.
    try {
      const snap = await ref.get();
      const startedAt = snap.exists ? snap.data().startedAt || 0 : 0;
      if (Date.now() - startedAt > LOCK_STALE_MS) {
        await ref.set({ startedAt: Date.now() });
        return true;
      }
    } catch { /* trata como ocupada */ }
    return false;
  }
};

const releaseLock = async (db, bankId) => {
  try { await db.collection("placement_locks").doc(bankId).delete(); } catch { /* ignora */ }
};

// Aguarda a variação que OUTRO processo está gerando aparecer no
// banco. Usado quando a trava está ocupada: em vez de devolver erro
// ao aluno, esperamos o trabalho do outro terminar e aproveitamos.
const waitForBankEntry = async (db, bankId, timeoutMs = 10 * 60 * 1000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snap = await db.collection("placement_bank").doc(bankId).get();
    if (snap.exists) return true;
    // Dorme só o que ainda resta do prazo: dormir 10s fixos fazia a
    // espera passar do tempo limite combinado.
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(10_000, remaining)));
  }
  return false;
};

// ── Limpa carimbos de job órfãos ───────────────────────────────
// O carimbo é apagado pelo front quando ele lê o resultado. Se o
// aluno fechou a tela antes, o documento fica para trás. Esta
// varredura leve remove os que já passaram de uma hora.
const cleanupOldJobs = async (db) => {
  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const snap = await db.collection("placement_jobs").where("updatedAt", "<", cutoff).limit(50).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete().catch(() => {})));
  } catch { /* limpeza é oportunista; nunca derruba a geração */ }
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

// ── Variedade de personagens (espelha services/geminiService.ts) ─
// Sem isto o modelo repete Sarah/Mark/Leo em todos os textos e
// áudios do nivelamento. Sorteia um elenco a cada nível gerado.
const NAME_POOL = [
  "Ethan", "Olivia", "Marcus", "Chloe", "Nathan", "Grace", "Dylan", "Naomi",
  "Trevor", "Harper", "Caleb", "Vivian", "Spencer", "Ruby", "Damon", "Paige",
  "Jerome", "Colette", "Wesley", "Imani", "Preston", "Delia", "Malik", "Sloane",
  "Thiago", "Larissa", "Rafael", "Beatriz", "Gustavo", "Camila", "Bruno", "Juliana",
  "Vinícius", "Priscila", "Rodrigo", "Tatiana", "Fernando", "Renata", "Caio", "Bianca",
  "Matheus", "Aline", "Otávio", "Letícia", "Igor", "Sabrina", "Murilo", "Carla",
  "Santiago", "Valentina", "Mateo", "Lucía", "Joaquín", "Camilo", "Ximena", "Emiliano",
  "Álvaro", "Daniela", "Nicolás", "Paloma", "Esteban", "Mariana", "Andrés",
  "Rocío", "Facundo", "Gabriela", "Ignacio", "Antonella", "Tomás", "Selena", "Hugo",
];

const SETTING_POOL = [
  "a coworking space in São Paulo", "a night bus in Buenos Aires", "a food truck festival in Austin",
  "a rooftop garden in Bogotá", "a hardware store in Chicago", "a beach kiosk in Recife",
  "a mountain hostel in Cusco", "a recording studio in Los Angeles", "a farmers market in Guadalajara",
  "a startup office in Florianópolis", "a train station in Seattle", "a family bakery in Montevideo",
  "a dive shop in Fortaleza", "a university lab in Boston", "a car repair shop in Medellín",
  "a community radio in Porto Alegre", "a ski lodge in Denver", "a bookshop in Santiago",
];

const pickRandom = (arr, n) => {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
};

const buildVarietyInstruction = () => {
  const names = pickRandom(NAME_POOL, 6);
  const setting = pickRandom(SETTING_POOL, 1)[0];
  return `CHARACTER AND SETTING VARIETY (mandatory):
- If the content has characters, use ONLY names from this list: ${names.join(", ")}.
- NEVER use the names Sarah, Mark, Leo, John, Mary, Anna, Emily, Michael, Tom or David.
- Suggested setting for the context: ${setting}.
- Naturally mix characters of different backgrounds (American, Brazilian, Latino).`;
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

${buildVarietyInstruction()}

This is a READING test at level ${level}. Write ONE short reading passage appropriate to ${level} (more complex for higher levels), and base all ${QUESTIONS_PER_LEVEL} questions on it. Put the SAME passage text in a "readingText" field on EACH question. Test comprehension, inference and vocabulary in context.`;
  }

  // listening
  return base + `

${buildVarietyInstruction()}

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

  // wait !== false significa que existe alguém esperando o resultado
  // (o aluno na tela de carregamento). Disparos em segundo plano mandam
  // wait: false e encerram assim que veem que outro processo já cuida
  // desta variação — sem isso, cada aluno que abrisse o nivelamento
  // ocuparia uma função por até 10 minutos consultando o Firestore à toa.
  const { jobId, skill, quarterKey, variation, wait } = body;
  const someoneIsWaiting = wait !== false;
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

  let holdsLock = false;

  try {
    await saveJobStatus(db, jobId, { status: "working", skill, variation });
    cleanupOldJobs(db); // oportunista, sem await: não atrasa a geração

    // Se esta variação já existe, não há nada a fazer — evita regerar
    // (e sobrescrever) uma prova boa quando dois disparos se cruzam.
    const already = await db.collection("placement_bank").doc(bankId).get();
    if (already.exists) {
      await saveJobStatus(db, jobId, { status: "done", bankId });
      return;
    }

    // Trava: se outro processo já está gerando esta variação, espera
    // o resultado dele em vez de duplicar o trabalho.
    holdsLock = await acquireLock(db, bankId);
    if (!holdsLock) {
      if (!someoneIsWaiting) {
        // Disparo de bastidor: outro processo já está gerando. Encerra.
        await saveJobStatus(db, jobId, { status: "done", bankId, note: "já estava sendo gerada" });
        return;
      }
      const arrived = await waitForBankEntry(db, bankId);
      await saveJobStatus(db, jobId, arrived
        ? { status: "done", bankId }
        : { status: "error", error: "A geração deste teste está demorando. Tente novamente em alguns minutos." });
      return;
    }

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
            // Só aceita se veio uma quantidade razoável (>= metade do pedido)
            // E, para reading/listening, se as questões trazem o material-base
            // (texto ou roteiro). Sem isso, a variação nasceria capenga: o
            // reading sem texto para ler, o listening sem script para o TTS.
            const hasBaseMaterial =
              skill === "reading"
                ? parsed.some((q) => q.readingText && String(q.readingText).trim().length > 20)
                : skill === "listening"
                  ? parsed.some((q) => q.listeningScript && String(q.listeningScript).trim().length > 20)
                  : true;
            if (parsed.length >= Math.ceil(QUESTIONS_PER_LEVEL / 2) && hasBaseMaterial) {
              levelQs = parsed;
              break;
            }
            lastErr = new Error(
              `Nível ${level}: veio ${parsed.length} questões` +
              (hasBaseMaterial ? "." : " e sem o material-base (texto/roteiro).")
            );
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
          if (!script) {
            // Sem script não há áudio — melhor falhar claramente do que
            // gravar uma variação de listening que o aluno não consegue ouvir.
            throw new Error(`Listening ${level}: sem roteiro para gerar o áudio.`);
          }
          levelAudios[level] = await generateAndUploadAudio(ai, bucket, script, jobId, level);
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
  } finally {
    // Libera a trava em qualquer desfecho, para não bloquear a
    // próxima tentativa desta mesma variação.
    if (holdsLock) await releaseLock(db, bankId);
  }
};

// Exportado apenas para os testes automatizados (test-placement.mjs).
// A Netlify usa somente exports.handler; isto não altera o runtime.
exports.__test = { acquireLock, releaseLock, waitForBankEntry, buildVarietyInstruction, NAME_POOL };
