// ============================================================
// FREEDOMAPP — Function: journey-content
// ------------------------------------------------------------
// Entrega UM exercício da Journey to Fluency. Fluxo:
//
//   1) Confere o login do aluno (Firebase ID token).
//   2) Valida que (jornada, season, nó, tipo) existe no currículo
//      — o currículo é lido de lib/journey-curriculum.json, o MESMO
//      arquivo que o front usa, então nunca há divergência.
//   3) Procura no banco compartilhado `journey_bank/{id}`. O id é
//      determinístico (ex.: freedom_s0_n0_grammar). Se já existe,
//      devolve na hora: zero gasto de IA.
//   4) Se não existe, gera com o Gemini, salva e devolve. Só o
//      PRIMEIRO aluno que chega num exercício paga a geração; todos
//      os outros reaproveitam. É isto que protege os créditos de IA.
//
// Por que o aluno não pode simplesmente ler/escrever journey_bank
// direto do navegador? Porque o texto do prompt sairia do cliente,
// e um aluno com DevTools poderia gravar um exercício qualquer que
// TODOS os outros alunos veriam. Aqui o prompt é montado no servidor
// a partir do currículo oficial; o cliente só manda posições.
//
// Gera 1 exercício por chamada (não o Step inteiro) de propósito:
// cabe no timeout de 26s da function síncrona e o aluno começa em
// segundos. O front pede o próximo exercício em segundo plano
// enquanto o aluno faz o atual (prefetch), então a espera some.
// ============================================================

const { GoogleGenAI } = require("@google/genai");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { resolvePosition, canAccess, buildSeasonNodes, LEVELS } = require("./lib/journey-core");
const { signBankId } = require("./lib/journey-sign");

const MODEL = "gemini-3.5-flash";
const QUESTIONS_PER_QUIZ = 10;
const GAP_ITEMS = 8;

const ALLOWED_ORIGINS = [
  "https://freedom.app.br",
  "https://www.freedom.app.br",
  "http://localhost:3000",
  "http://localhost:5173",
];

const buildHeaders = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
});

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
  return { db: getFirestore(), auth: getAuth() };
};

// ── Sabor de cada Jornada (vai no prompt) ─────────────────────
const JOURNEY_STYLE = {
  freedom: "Contextos variados do dia a dia (família, cidade, trabalho, lazer, cultura). Público adulto geral brasileiro.",
  business: "TODO o contexto é profissional: escritório, e-mails, reuniões, clientes, negociações, carreira. Personagens são colegas, gerentes, clientes e fornecedores. Evite contextos domésticos.",
  young: "Público de crianças e adolescentes (10 a 16 anos): escola, amigos, games, esportes, música, animais, família. Tom leve e divertido. PROIBIDO: álcool, violência, romance adulto, temas pesados.",
  traveler: "TODO o contexto é de viagem: aeroporto, hotel, restaurante, direções, turismo, cultura local, imprevistos de viagem. Personagens são viajantes, atendentes, guias e moradores locais.",
};

// Elenco e cenários sorteados para evitar que a IA repita sempre os
// mesmos nomes (Sarah, Mark, Leo...) — mesma ideia do geminiService.
const NAME_POOL = [
  "Ethan", "Olivia", "Marcus", "Chloe", "Nathan", "Grace", "Dylan", "Naomi", "Trevor", "Harper", "Caleb", "Vivian",
  "Spencer", "Ruby", "Damon", "Paige", "Jerome", "Colette", "Wesley", "Imani", "Preston", "Delia", "Malik", "Sloane",
  "Thiago", "Larissa", "Rafael", "Beatriz", "Gustavo", "Camila", "Bruno", "Juliana", "Vinícius", "Priscila", "Rodrigo",
  "Tatiana", "Fernando", "Renata", "Caio", "Bianca", "Aline", "Otávio", "Letícia", "Igor", "Sabrina", "Murilo", "Carla",
  "Santiago", "Valentina", "Mateo", "Lucía", "Joaquín", "Camilo", "Ximena", "Emiliano", "Daniela", "Nicolás", "Paloma",
  "Esteban", "Mariana", "Andrés", "Rocío", "Facundo", "Gabriela", "Ignacio", "Antonella", "Tomás", "Selena", "Hugo",
];
const SETTING_POOL = {
  freedom: ["a coworking space in São Paulo", "a night bus in Buenos Aires", "a food truck festival in Austin", "a rooftop garden in Bogotá", "a beach kiosk in Recife", "a farmers market in Guadalajara", "a train station in Seattle", "a family bakery in Montevideo", "a university lab in Boston", "a community radio in Porto Alegre"],
  business: ["a startup office in Florianópolis", "a logistics company in Rotterdam", "a marketing agency in Chicago", "a bank branch in Lisbon", "a factory in Monterrey", "a consulting firm in Toronto", "a hotel chain headquarters in Miami", "a software company in Dublin", "a trade fair in Frankfurt", "a call center in Manila"],
  young: ["a school in Curitiba", "a skate park in Los Angeles", "a summer camp in Canada", "a gaming tournament in Seoul", "a science fair in Belo Horizonte", "a football academy in Madrid", "a music club at school in Dublin", "a zoo in San Diego", "a library in Toronto", "a birthday party in Rio"],
  traveler: ["an airport in Lisbon", "a hostel in Cusco", "a night train to Vienna", "a beach resort in Cancún", "a street market in Bangkok", "a ski lodge in Denver", "a ferry in Greece", "a tourist office in Dublin", "a car rental desk in Sydney", "a mountain trail in Patagonia"],
};
const pick = (arr, n) => { const c = [...arr], o = []; while (o.length < n && c.length) o.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return o; };

const varietyBlock = (journeyId) => `VARIEDADE OBRIGATÓRIA:
- Se houver personagens, use SOMENTE nomes desta lista: ${pick(NAME_POOL, 6).join(", ")}.
- PROIBIDO usar: Sarah, Mark, Leo, John, Mary, Anna, Emily, Michael, Tom, David.
- Cenário sugerido: ${pick(SETTING_POOL[journeyId] || SETTING_POOL.freedom, 1)[0]}. Adapte ao tópico quando fizer sentido.`;

// ── Schemas de resposta (JSON estruturado) ────────────────────
const QUESTION_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "INTEGER" }, question: { type: "STRING" }, questionPT: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" } }, correctAnswerIndex: { type: "INTEGER" }, explanation: { type: "STRING" },
    },
    required: ["id", "question", "questionPT", "options", "correctAnswerIndex", "explanation"],
  },
};
const QUIZ_SCHEMA = { type: "OBJECT", properties: { questions: QUESTION_SCHEMA }, required: ["questions"] };
const READING_SCHEMA = { type: "OBJECT", properties: { readingText: { type: "STRING" }, questions: QUESTION_SCHEMA }, required: ["readingText", "questions"] };
const LISTENING_SCHEMA = { type: "OBJECT", properties: { listeningScript: { type: "STRING" }, questions: QUESTION_SCHEMA }, required: ["listeningScript", "questions"] };
const GAP_SCHEMA = {
  type: "OBJECT",
  properties: {
    gapItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "INTEGER" }, sentence: { type: "STRING" }, answer: { type: "STRING" },
          alternatives: { type: "ARRAY", items: { type: "STRING" } }, hintPT: { type: "STRING" }, translationPT: { type: "STRING" },
        },
        required: ["id", "sentence", "answer", "alternatives", "hintPT", "translationPT"],
      },
    },
  },
  required: ["gapItems"],
};
const FREE_WRITING_SCHEMA = { type: "OBJECT", properties: { writingPrompt: { type: "STRING" }, writingPromptPT: { type: "STRING" } }, required: ["writingPrompt", "writingPromptPT"] };

// ── Regras comuns de qualidade ────────────────────────────────
const COMMON_RULES = (level) => `REGRAS DE QUALIDADE:
- Nível CEFR ${level}: vocabulário e estruturas estritamente deste nível (nem mais fácil, nem mais difícil).
- Enunciados e opções em INGLÊS; "questionPT" é a tradução do enunciado; "explanation" em PORTUGUÊS BRASILEIRO, curta e didática, explicando POR QUE a resposta certa está certa.
- Exatamente 4 opções por questão, uma única correta, distratores plausíveis (erros típicos de brasileiros).
- Varie o formato das questões (complete a frase, escolha a forma correta, encontre o erro, qual é a resposta natural ao diálogo).
- Nunca repita a mesma frase-base em duas questões. Nada de markdown.`;

// ── Prompts por tipo de exercício ─────────────────────────────
const buildRequest = ({ journeyId, seasonIndex, node, kind }) => {
  const level = LEVELS[seasonIndex];
  const style = JOURNEY_STYLE[journeyId];
  const grammar = node.grammarTopics.join(" + ");
  const vocab = node.vocabThemes.join(", ");
  const sys = `Você é o professor-autor da Freedom, escola brasileira de inglês. Está escrevendo a trilha "Journey to Fluency".
JORNADA: ${style}
${COMMON_RULES(level)}
${varietyBlock(journeyId)}`;

  if (kind === "grammar") {
    const isReview = node.type === "review";
    return {
      schema: QUIZ_SCHEMA,
      system: sys,
      contents: isReview
        ? `Crie um REVIEW de gramática com ${QUESTIONS_PER_QUIZ} questões de múltipla escolha misturando, em proporção parecida, os tópicos: ${grammar}. Nível ${level}. Use os temas de vocabulário já vistos (${vocab}) nos contextos das frases. Inclua ao menos 2 questões que contrastem dois dos tópicos entre si.`
        : `Crie ${QUESTIONS_PER_QUIZ} questões de múltipla escolha sobre o tópico gramatical "${grammar}" para nível ${level}. As frases devem usar o tema de vocabulário "${vocab}" como contexto. Comece com 3 questões mais simples e termine com 3 mais desafiadoras.`,
    };
  }
  if (kind === "vocabulary") {
    return {
      schema: QUIZ_SCHEMA, system: sys,
      contents: `Crie ${QUESTIONS_PER_QUIZ} questões de múltipla escolha de VOCABULÁRIO sobre o tema "${vocab}" para nível ${level}. Misture: significado em contexto, palavra que completa a frase, sinônimo/antônimo, collocation e uso em diálogo. Sempre que natural, as frases podem usar a estrutura "${grammar}" (para reforçar o que o aluno acabou de estudar), mas o FOCO é o vocabulário.`,
    };
  }
  if (kind === "reading") {
    const words = { A1: "90 a 130", A2: "130 a 180", B1: "180 a 250", B2: "250 a 330", C1: "330 a 420" }[level];
    return {
      schema: READING_SCHEMA, system: sys,
      contents: `Escreva um texto em inglês de ${words} palavras, nível ${level}, sobre o tema "${vocab}", usando NATURALMENTE e várias vezes a estrutura gramatical "${grammar}". Escolha um gênero adequado (diálogo, e-mail, post, notícia curta, história, anúncio). Separe parágrafos com linha em branco. Depois crie ${QUESTIONS_PER_QUIZ} questões de interpretação de múltipla escolha: 5 sobre o conteúdo do texto, 3 sobre vocabulário do texto e 2 sobre a gramática "${grammar}" como aparece no texto.`,
    };
  }
  if (kind === "listening") {
    const words = { A1: "70 a 100", A2: "100 a 140", B1: "140 a 190", B2: "190 a 250", C1: "250 a 320" }[level];
    return {
      schema: LISTENING_SCHEMA, system: sys,
      contents: `Escreva o ROTEIRO de um áudio em inglês (será lido por um narrador de voz sintética, então use só texto corrido ou falas no formato "Nome: fala", sem rubricas entre parênteses) de ${words} palavras, nível ${level}, sobre o tema "${vocab}", usando várias vezes a estrutura "${grammar}". Formatos possíveis: conversa entre duas pessoas, mensagem de voz, anúncio, mini-podcast. Depois crie ${QUESTIONS_PER_QUIZ} questões de compreensão auditiva de múltipla escolha (detalhes específicos, ideia geral, inferência e 2 sobre a gramática "${grammar}").`,
    };
  }
  // writing
  if (seasonIndex <= 1) {
    return {
      schema: GAP_SCHEMA, system: sys,
      contents: `Crie ${GAP_ITEMS} frases em inglês, nível ${level}, sobre o tema "${vocab}", cada uma com EXATAMENTE UMA lacuna marcada por "____" que exige a estrutura "${grammar}". Regras: a resposta é 1 a 3 palavras; "answer" é a forma mais natural; "alternatives" traz outras formas corretas (contrações, variantes) ou lista vazia; "hintPT" é uma dica curta em português SEM entregar a resposta (ex.: "verbo to be, negativa"); "translationPT" é a tradução da frase completa. Comece com lacunas fáceis e termine com 2 mais difíceis. Não repita a mesma resposta mais de 2 vezes.`,
    };
  }
  const length = { 2: "3 a 5 frases curtas (40 a 70 palavras)", 3: "um parágrafo de 80 a 120 palavras", 4: "um texto de 150 a 220 palavras com introdução, desenvolvimento e conclusão" }[seasonIndex];
  return {
    schema: FREE_WRITING_SCHEMA, system: sys,
    contents: `Crie UMA tarefa de escrita para nível ${level} sobre o tema "${vocab}" que exija o uso da estrutura "${grammar}". Peça ao aluno ${length}. O enunciado ("writingPrompt", em inglês) deve: dar um contexto concreto (situação/pessoa/objetivo), listar 2 ou 3 pontos que o texto deve cobrir e dizer explicitamente que deve usar "${grammar}". "writingPromptPT" é a tradução fiel em português. Nada de markdown.`,
    lengthHint: `Escreva ${length}.`,
  };
};

// ── Validação do que a IA devolveu ────────────────────────────
const validQuestions = (qs) => Array.isArray(qs) && qs.length >= 5 && qs.every(q =>
  q && typeof q.question === "string" && Array.isArray(q.options) && q.options.length === 4 &&
  Number.isInteger(q.correctAnswerIndex) && q.correctAnswerIndex >= 0 && q.correctAnswerIndex < 4);

const normalizeContent = (kind, seasonIndex, data, req) => {
  const out = {};
  if (kind === "writing" && seasonIndex <= 1) {
    // A lacuna é aceita com QUALQUER sequência de 2+ sublinhados (ou
    // traços longos) e depois padronizada em "____". Exigir exatamente
    // quatro reprovava exercícios perfeitos só porque o modelo escreveu
    // "___" — e como o Step trava até a escrita ser feita, isso deixava
    // o aluno preso na trilha sem saída.
    const GAP = /(_{2,}|—{2,}|–{2,})/;
    const items = Array.isArray(data.gapItems)
      ? data.gapItems.filter(g => g && typeof g.sentence === "string" && GAP.test(g.sentence) && typeof g.answer === "string" && g.answer.trim())
      : [];
    if (items.length < 5) return null;
    out.gapItems = items.map((g, i) => ({ id: i + 1, sentence: g.sentence.trim().replace(GAP, "____"), answer: g.answer.trim(), alternatives: Array.isArray(g.alternatives) ? g.alternatives.map(a => String(a).trim()).filter(Boolean) : [], hintPT: g.hintPT || "", translationPT: g.translationPT || "" }));
    out.questions = [];
    return out;
  }
  if (kind === "writing") {
    if (typeof data.writingPrompt !== "string" || data.writingPrompt.trim().length < 30) return null;
    out.writingPrompt = data.writingPrompt.trim();
    out.writingPromptPT = data.writingPromptPT || "";
    out.writingLengthHint = req.lengthHint;
    out.questions = [];
    return out;
  }
  if (!validQuestions(data.questions)) return null;
  out.questions = data.questions.slice(0, QUESTIONS_PER_QUIZ).map((q, i) => ({ id: i + 1, question: q.question, questionPT: q.questionPT || "", options: q.options, correctAnswerIndex: q.correctAnswerIndex, explanation: q.explanation || "" }));
  if (kind === "reading") { if (typeof data.readingText !== "string" || data.readingText.trim().length < 80) return null; out.readingText = data.readingText.trim(); }
  if (kind === "listening") { if (typeof data.listeningScript !== "string" || data.listeningScript.trim().length < 60) return null; out.listeningScript = data.listeningScript.trim(); }
  return out;
};

const parseLoose = (text) => {
  let clean = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch { /* repara */ }
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a >= 0 && b > a) clean = clean.slice(a, b + 1);
  return JSON.parse(clean.replace(/,\s*([}\]])/g, "$1"));
};

const generate = async (ai, req, kind, seasonIndex) => {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: req.contents,
    config: { systemInstruction: req.system, responseMimeType: "application/json", responseSchema: req.schema },
  });
  const data = parseLoose(response.text);
  return normalizeContent(kind, seasonIndex, data, req);
};

// ── Dispara a geração do áudio do listening (fire-and-forget) ─
// Não esperamos a resposta: o áudio leva mais tempo do que os 26s
// desta function, e o aluno atual não depende dele.
// A chamada vai ASSINADA (HMAC com a credencial do Firebase): a
// URL da background function é pública, e sem assinatura qualquer
// um poderia disparar gerações de áudio pagas em looping.
const triggerAudio = (bankId) => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!base) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2000);
  fetch(`${base}/.netlify/functions/journey-audio-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bankId, signature: signBankId(bankId) }),
    signal: ctrl.signal,
  }).catch(() => { /* melhor esforço */ }).finally(() => clearTimeout(t));
};

// Exposto só para os testes (test-journey-server.mjs). Não é usado
// pela Netlify, que chama exclusivamente exports.handler.
exports._internals = { buildSeasonNodes, buildRequest, normalizeContent, validQuestions, parseLoose };

exports.handler = async (event) => {
  const headers = buildHeaders(event.headers.origin || "");
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Método não permitido" }) };
  if (!process.env.GEMINI_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Configuração de servidor incompleta." }) };
  }

  const { db, auth } = initFirebase();

  // 1) Identidade
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: "Não autenticado." }) };
  let uid;
  try { uid = (await auth.verifyIdToken(token)).uid; }
  catch { return { statusCode: 401, headers, body: JSON.stringify({ error: "Sessão inválida. Faça login novamente." }) }; }

  // 2) A posição existe no currículo?
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido." }) }; }
  const pos = resolvePosition({
    journeyId: body.journeyId, season: Number(body.season),
    node: Number(body.node), kind: body.kind,
  });
  if (!pos) return { statusCode: 400, headers, body: JSON.stringify({ error: "Posição inválida na jornada." }) };
  const { journeyId, season: seasonIndex, node: nodeIndex, kind, nodeDef: node } = pos;

  const bankId = `${journeyId}_s${seasonIndex}_n${nodeIndex}_${kind}`;
  const ref = db.collection("journey_bank").doc(bankId);

  try {
    // 3) ESTE aluno pode estar nesta posição agora?
    // Sem esta checagem, um aluno com o console do navegador aberto
    // poderia pedir os ~2.500 exercícios da trilha em sequência e
    // torrar os créditos de IA da escola numa tarde. A trava do
    // front sozinha não protege nada: ela vive no navegador dele.
    const [progSnap, userSnap] = await Promise.all([
      db.collection("journey_progress").doc(uid).get(),
      db.collection("users").doc(uid).get(),
    ]);
    const access = canAccess(pos, progSnap.exists ? progSnap.data() : null, (userSnap.data() || {}).gamification);
    if (!access.allowed) {
      return {
        statusCode: 403, headers,
        body: JSON.stringify({
          error: access.reason === "SEASON_LOCKED"
            ? "Esta Season ainda está bloqueada."
            : "Conclua o Step anterior para liberar este exercício.",
        }),
      };
    }

    // 3) Já existe? Devolve sem gastar IA.
    const snap = await ref.get();
    if (snap.exists && snap.data()?.content) {
      const cachedContent = snap.data().content;
      // Listening antigo que ficou sem áudio (a geração falhou na
      // primeira vez): tenta de novo em segundo plano.
      if (kind === "listening" && cachedContent.listeningScript && !cachedContent.audioUrl) triggerAudio(bankId);
      return { statusCode: 200, headers, body: JSON.stringify({ bankId, cached: true, content: cachedContent }) };
    }

    // 4) Gera (com uma segunda tentativa se a primeira vier inválida
    //    e ainda houver tempo dentro dos 26s).
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const started = Date.now();
    let content = null, lastErr = null;
    for (let attempt = 1; attempt <= 2 && !content; attempt++) {
      if (attempt === 2 && Date.now() - started > 11000) break;
      try {
        const req = buildRequest({ journeyId, seasonIndex, node, kind });
        content = await generate(ai, req, kind, seasonIndex);
        if (!content) lastErr = new Error("Conteúdo inválido da IA.");
      } catch (e) { lastErr = e; }
    }
    if (!content) throw lastErr || new Error("Falha na geração.");

    const doc = {
      id: bankId, journeyId, season: seasonIndex, node: nodeIndex, kind,
      level: LEVELS[seasonIndex], grammarTopics: node.grammarTopics, vocabThemes: node.vocabThemes,
      content, model: MODEL, createdAt: Date.now(),
    };
    // create() falha quando outro aluno gerou no mesmo instante: aí
    // devolvemos a versão que chegou primeiro (o banco é único).
    // Qualquer OUTRO erro é gravado no log: se a escrita falhar em
    // silêncio, o exercício não fica salvo e o próximo aluno paga uma
    // geração nova — um vazamento de crédito difícil de perceber.
    let created = true;
    try {
      await ref.create(doc);
    } catch (e) {
      created = false;
      const isRace = e?.code === 6 || e?.code === "already-exists" || String(e?.message || "").includes("already exists");
      if (!isRace) console.error("journey-content: falha ao SALVAR no banco", bankId, e);
      const again = await ref.get().catch(() => null);
      if (again?.exists && again.data()?.content) content = again.data().content;
    }

    // Listening: manda preparar o áudio em segundo plano. Este aluno
    // ainda ouve o TTS gerado pelo navegador (caminho antigo); do
    // próximo em diante todos tocam o arquivo pronto do Storage.
    if (created && kind === "listening") triggerAudio(bankId);

    return { statusCode: 200, headers, body: JSON.stringify({ bankId, cached: false, content }) };
  } catch (error) {
    console.error("journey-content:", error);
    const msg = String(error?.message || "");
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: "Limite de requisições atingido. Aguarde um momento." }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Não consegui preparar este exercício agora. Tente novamente." }) };
  }
};
