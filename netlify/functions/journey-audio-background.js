// ============================================================
// FREEDOMAPP — Function: journey-audio-background
// ------------------------------------------------------------
// Gera UMA vez o áudio (TTS) de um exercício de listening da
// Journey e guarda o arquivo no Firebase Storage, gravando a URL
// dentro do próprio exercício em journey_bank.
//
// Por que separado da journey-content? Porque o TTS de um roteiro
// de 150+ palavras leva vários segundos e a function síncrona tem
// só 26s no total. Aqui a Netlify dá 15 minutos (sufixo
// "-background"), então o texto do exercício chega rápido ao aluno
// e o áudio é preparado em paralelo.
//
// Economia: o PRIMEIRO aluno que abre um listening ouve o áudio
// gerado na hora pelo navegador (caminho antigo, que continua
// funcionando); a partir do segundo, todos tocam o arquivo pronto
// do Storage. Sem isto, cada aluno gastaria uma geração de TTS no
// mesmo exercício, para sempre.
//
// Idempotente de propósito: se o exercício já tem audioUrl, a
// função sai na hora sem chamar a IA. É isso que impede alguém de
// disparar a rota repetidamente para queimar créditos.
// ============================================================

const { GoogleGenAI, Modality } = require("@google/genai");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { verifyBankId } = require("./lib/journey-sign");

const VOICE = "Kore";
// Quantas vezes tentar antes de desistir de um roteiro problemático.
const MAX_FAILS = 3;
// Janela da trava: outra tentativa do MESMO áudio só depois disso.
const LOCK_MS = 5 * 60 * 1000;

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

// O TTS do Gemini devolve PCM 16-bit/24kHz/mono sem cabeçalho; sem
// os 44 bytes de WAV na frente, nenhum navegador toca o arquivo.
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
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  if (!process.env.GEMINI_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
    console.error("journey-audio: configuração incompleta.");
    return { statusCode: 500, body: "config" };
  }

  let bankId, signature;
  try {
    const parsed = JSON.parse(event.body || "{}");
    bankId = String(parsed.bankId || "");
    signature = parsed.signature;
  } catch { return { statusCode: 400, body: "bad json" }; }
  // Formato esperado: jornada_sN_nN_listening. Qualquer outra coisa sai fora.
  if (!/^[a-z]+_s\d_n\d{1,2}_listening$/.test(bankId)) return { statusCode: 400, body: "bad id" };
  // Só a journey-content sabe assinar (ver lib/journey-sign.js).
  if (!verifyBankId(bankId, signature)) {
    console.warn("journey-audio: chamada sem assinatura válida", bankId);
    return { statusCode: 401, body: "unauthorized" };
  }

  const { db, bucket } = initFirebase();
  const ref = db.collection("journey_bank").doc(bankId);

  try {
    const snap = await ref.get();
    if (!snap.exists) return { statusCode: 404, body: "not found" };
    const data = snap.data();
    const script = data?.content?.listeningScript;
    if (!script) return { statusCode: 400, body: "sem roteiro" };
    if (data?.content?.audioUrl) return { statusCode: 200, body: "já existe" };

    // Trava contra duas gerações simultâneas + desistência após
    // MAX_FAILS. Sem o contador, um roteiro que o TTS não consegue
    // ler (caractere estranho, tamanho) faria CADA visita de aluno
    // disparar uma geração paga nova — para sempre. Com ele, a
    // plataforma tenta 3 vezes, desiste e o aluno cai no caminho
    // antigo (áudio gerado no navegador), sem prejuízo do exercício.
    const claimed = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const d = s.data() || {};
      if (d.content?.audioUrl) return false;
      if ((d.audioFailCount || 0) >= MAX_FAILS) return false;
      if (d.audioLockAt && Date.now() - d.audioLockAt < LOCK_MS) return false;
      tx.update(ref, { audioLockAt: Date.now() });
      return true;
    });
    if (!claimed) return { statusCode: 200, body: "em andamento, pronto ou desistido" };

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: script }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part?.inlineData?.data) throw new Error("TTS não retornou áudio.");

    const filePath = `journey_audio/${bankId}.wav`;
    const file = bucket.file(filePath);
    await file.save(pcmToWav(Buffer.from(part.inlineData.data, "base64")), {
      metadata: { contentType: "audio/wav" },
      public: true,
    });
    const audioUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    await ref.update({ "content.audioUrl": audioUrl, audioLockAt: null, audioFailCount: 0, audioReadyAt: Date.now() });
    console.log("journey-audio pronto:", bankId);
    return { statusCode: 200, body: audioUrl };
  } catch (error) {
    console.error("journey-audio:", error);
    // Solta a trava e conta a falha: depois de MAX_FAILS a
    // plataforma para de tentar (e de gastar) neste exercício.
    await ref.update({ audioLockAt: null, audioFailCount: FieldValue.increment(1) }).catch(() => {});
    return { statusCode: 500, body: "erro" };
  }
};
