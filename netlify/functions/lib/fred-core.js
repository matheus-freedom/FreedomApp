// ============================================================
// FREEDOMAPP — lib/fred-core
// ------------------------------------------------------------
// Coração do "Fred explica": o catálogo de temas, o prompt que dá
// voz ao Fred e a validação do que a IA devolve.
//
// Por que um arquivo separado? Três lugares precisam da MESMA
// lógica: a function síncrona (fred-explains), a function de
// geração (fred-explains-background) e os testes automatizados.
// Se cada um tivesse a própria cópia, uma correção feita num
// lugar seria esquecida nos outros.
//
// O catálogo NÃO é digitado aqui: vem de journey-curriculum.json,
// o mesmo arquivo que alimenta a Journey to Fluency. Assim, os
// temas do "Fred explica" são exatamente os temas que a escola
// trabalha do A1 ao C1 — e se um dia o currículo mudar, as duas
// funcionalidades mudam juntas.
// ============================================================

const CURRICULUM = require("./journey-curriculum.json");

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

// XP dado UMA vez por tema, ao concluir o checkpoint final com
// nota mínima. Fica fora da cota diária de exercícios de propósito:
// estudar a teoria não deve "gastar" um dos 8 exercícios do dia.
const LESSON_XP = 40;
const LESSON_PASS_PCT = 60;

// Modelos: o Pro escreve explicações mais ricas (analogias exigem
// raciocínio). Como cada tema é gerado UMA vez para a escola inteira,
// a diferença de custo é irrelevante. Se o Pro falhar (ou a chave não
// tiver acesso), cai para o Flash — o mesmo modelo da Journey.
const MODELS = ["gemini-3.5-pro", "gemini-3.5-flash"];

// ── Slug: "Verbo to be (presente)" → "verbo-to-be-presente" ──────
// O id do documento no banco é `${nível}_${slug}`. Usar o TEXTO do
// tema (e não a posição na lista) protege o banco: se alguém inserir
// um tema no meio da lista, os já gerados continuam apontando para
// o tema certo. Um mesmo tema em dois níveis (ex.: Present Continuous
// no A1 e no B1) vira dois ids, porque a profundidade da explicação
// é diferente — é intencional.
const slugify = (text) =>
  String(text || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // tira acentos
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const lessonId = (level, topic) => `${level}_${slugify(topic)}`;

// Catálogo completo: [{ id, level, topic, order }]
const buildCatalog = () => {
  const out = [];
  for (const level of LEVELS) {
    (CURRICULUM.grammar[level] || []).forEach((topic, order) => {
      out.push({ id: lessonId(level, topic), level, topic, order });
    });
  }
  return out;
};

const CATALOG = buildCatalog();
const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

// Confere se (nível, tema) existe no currículo. Aceita o tema pelo
// texto exato OU pelo id — o front manda o id.
const resolveLesson = ({ id, level, topic }) => {
  if (typeof id === "string" && CATALOG_BY_ID.has(id)) return CATALOG_BY_ID.get(id);
  if (LEVELS.includes(level) && typeof topic === "string") {
    return CATALOG_BY_ID.get(lessonId(level, topic)) || null;
  }
  return null;
};

// ── Como o Fred fala ──────────────────────────────────────────
// A persona vai no systemInstruction. Detalhes importam aqui: sem
// isto o modelo tende a escrever ou um manual seco ou um texto
// cheio de gíria e emoji — nenhum dos dois é o Fred.
const FRED_PERSONA = `Você é o FRED, mascote e guia da Freedom Language Center, escola brasileira de inglês focada em conversação.

QUEM É O FRED
- Um professor jovem, leve e bem-humorado, que explica gramática como quem conversa com um amigo num café — mas é PROFESSOR: preciso, organizado, nunca superficial.
- Fala em português brasileiro, direto com o aluno ("você"). Exemplos sempre em inglês, com tradução.
- Humor na medida: uma piada leve ou comparação engraçada aqui e ali. PROIBIDO exagerar: nada de gíria a cada frase, nada de "galera", "mano", "bora" repetidos, no máximo 1 emoji por seção (pode ser zero).
- NUNCA usa as expressões "Dica de ouro", "Regra de ouro", "Vamos lá!", "Sem mais delongas" nem começa frases com "Então,".

COMO O FRED ENSINA
- Descomplica: parte de uma situação real, mostra o padrão, só depois dá o nome técnico.
- Compara com o PORTUGUÊS sempre que ajudar: "em português a gente faz X; em inglês é Y". Aponta quando a estrutura NÃO existe em português (é onde o brasileiro trava).
- Usa analogias do dia a dia (fila de banco, receita de bolo, GPS, futebol, série de TV...). Uma analogia boa vale mais que três regras.
- Antecipa as pegadinhas típicas de falantes de português (tradução literal, ordem das palavras, auxiliares esquecidos, "have" vs "there is", etc.).
- Cada seção termina numa ideia fechada; a próxima seção avança um degrau.

FORMATO DE TEXTO
- Dentro de "body" use parágrafos curtos separados por linha em branco. Pode destacar termos com **negrito** (só isto de markdown; nada de títulos #, listas com -, tabelas ou código).
- Frases em inglês dentro do corpo podem ir entre aspas.
- Sem markdown nos demais campos.`;

// Profundidade por nível — a mesma "Present Continuous" no A1 é uma
// apresentação; no B1 é contraste com Simple Present, usos avançados
// e verbos de estado.
const DEPTH = {
  A1: "Aluno INICIANTE. Zero pressuposto. Vocabulário dos exemplos muito simples (rotina, família, comida). Explique também o básico: pronomes, auxiliar, forma negativa e pergunta. 4 a 5 seções.",
  A2: "Aluno básico que já conhece to be, simple present e simple past. Pode comparar com o que ele já sabe. Exemplos do cotidiano (compras, viagem, trabalho simples). 4 a 5 seções.",
  B1: "Aluno intermediário. Foque em CONTRASTES (quando usar este e não aquele), nuances de significado e usos que o brasileiro confunde. Exemplos com contextos variados (trabalho, notícias, relacionamentos). 5 a 6 seções.",
  B2: "Aluno intermediário-avançado. Vá além da regra: registro formal x informal, exceções, colocações naturais, erros sutis. Exemplos mais longos e realistas. 5 a 6 seções.",
  C1: "Aluno avançado. Trate como quem já domina a base: sutilezas de estilo, ênfase, formalidade, usos escritos x falados, o que soa nativo e o que soa 'traduzido'. Exemplos sofisticados (artigos, e-mails formais, debates). 5 a 6 seções.",
};

const buildPrompt = ({ level, topic }) => `Escreva a AULA COMPLETA do "Fred explica" sobre o tema gramatical: "${topic}" — nível CEFR ${level}.

PÚBLICO E PROFUNDIDADE: ${DEPTH[level]}

ESTRUTURA OBRIGATÓRIA (JSON):
- "title": título curto e chamativo em português (pode manter o nome do tema em inglês). Sem emoji.
- "hook": abertura do Fred em 2 a 4 frases: uma situação real ou pergunta que mostra POR QUE esse tema importa. Nada de "hoje vamos aprender".
- "sections": as seções da aula, em ordem crescente de dificuldade. Cada seção tem:
    - "heading": título curto da seção (máx. 60 caracteres).
    - "mood": a expressão do Fred que combina com a seção. Use EXATAMENTE um destes valores: "perfil" (explicando, tom neutro), "surpreso" (fato curioso, "olha isso"), "feliz" (comemoração, "viu como é simples?"), "motivado" (desafio, dica de prática), "triste" (alerta de erro comum — o Fred fica triste com esse erro). Varie: não repita o mesmo mood em seções seguidas.
    - "body": 2 a 4 parágrafos curtos, na voz do Fred.
    - "examples": 2 a 4 exemplos: "en" (frase em inglês), "pt" (tradução natural, não literal), "note" (comentário curtíssimo do Fred sobre o que observar, ou string vazia).
    - "ptAnalogy": comparação explícita com o português OU analogia do dia a dia (2 a 4 frases). Se nesta seção não couber, string vazia — mas a aula inteira precisa ter pelo menos 2 seções com ptAnalogy preenchida.
    - "tip": dica prática curta (1 a 2 frases) ou string vazia.
    - "quiz": lista com 0 ou 1 mini-quiz de múltipla escolha sobre O QUE ACABOU DE SER EXPLICADO nesta seção: "question" (em inglês ou português, como ficar mais natural), "options" (exatamente 4), "correctIndex" (0 a 3), "explanation" (em português, 1 a 3 frases, na voz do Fred, explicando por que a certa está certa e por que a alternativa mais tentadora está errada). Pelo menos METADE das seções deve ter mini-quiz; a última seção sempre tem.
- "mistakes": 3 a 5 pegadinhas típicas de brasileiros neste tema: "wrong" (frase errada em inglês), "right" (versão correta), "why" (explicação curta em português, na voz do Fred).
- "summary": 4 a 6 frases-resumo, cada uma uma ideia (o que o aluno precisa levar da aula). Sem emoji.
- "finalQuiz": EXATAMENTE 5 questões de múltipla escolha cobrindo a aula inteira, da mais fácil para a mais difícil, 4 opções cada, distratores plausíveis (erros típicos de brasileiros). Mesmos campos do mini-quiz. Não repita questões dos mini-quizzes.

REGRAS DE QUALIDADE
- Nível ${level}: os exemplos usam vocabulário e estruturas deste nível.
- Nunca use a mesma frase-base em dois exemplos ou questões.
- Correção gramatical impecável nos exemplos em inglês: eles serão lidos por centenas de alunos.
- Tom do Fred: leve, claro, sem exagero. Em dúvida, prefira clareza a piada.`;

// ── Schema JSON (o Gemini devolve exatamente esta forma) ───────
const QUIZ_ITEM = {
  type: "OBJECT",
  properties: {
    question: { type: "STRING" },
    options: { type: "ARRAY", items: { type: "STRING" } },
    correctIndex: { type: "INTEGER" },
    explanation: { type: "STRING" },
  },
  required: ["question", "options", "correctIndex", "explanation"],
};

const LESSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    hook: { type: "STRING" },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          heading: { type: "STRING" },
          mood: { type: "STRING" },
          body: { type: "STRING" },
          examples: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { en: { type: "STRING" }, pt: { type: "STRING" }, note: { type: "STRING" } },
              required: ["en", "pt", "note"],
            },
          },
          ptAnalogy: { type: "STRING" },
          tip: { type: "STRING" },
          quiz: { type: "ARRAY", items: QUIZ_ITEM },
        },
        required: ["heading", "mood", "body", "examples", "ptAnalogy", "tip", "quiz"],
      },
    },
    mistakes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { wrong: { type: "STRING" }, right: { type: "STRING" }, why: { type: "STRING" } },
        required: ["wrong", "right", "why"],
      },
    },
    summary: { type: "ARRAY", items: { type: "STRING" } },
    finalQuiz: { type: "ARRAY", items: QUIZ_ITEM },
  },
  required: ["title", "hook", "sections", "mistakes", "summary", "finalQuiz"],
};

// ── Validação e normalização ──────────────────────────────────
// A IA às vezes devolve 3 opções, índice fora da faixa ou seção
// vazia. Em vez de gravar um conteúdo quebrado que TODOS os alunos
// veriam, rejeitamos (a function tenta de novo) ou consertamos o que
// dá para consertar sem inventar conteúdo.
const MOODS = ["perfil", "feliz", "surpreso", "triste", "motivado"];

// "\n" literal (barra + n) dentro das strings — mesmo problema já
// visto na Journey. Conserta antes de validar.
const fixEscapedText = (v) => {
  if (typeof v === "string") return v.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n").replace(/\\t/g, " ");
  if (Array.isArray(v)) return v.map(fixEscapedText);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = fixEscapedText(v[k]); return o; }
  return v;
};

const str = (v) => (typeof v === "string" ? v.trim() : "");

const normalizeQuiz = (q) => {
  if (!q || typeof q !== "object") return null;
  const question = str(q.question);
  const options = Array.isArray(q.options) ? q.options.map((o) => str(o)).filter(Boolean) : [];
  const idx = Number(q.correctIndex);
  if (question.length < 5 || options.length !== 4 || !Number.isInteger(idx) || idx < 0 || idx > 3) return null;
  // Opções duplicadas tornam a questão ambígua (duas "certas").
  if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
  return { question, options, correctIndex: idx, explanation: str(q.explanation) };
};

const normalizeLesson = (raw) => {
  const data = fixEscapedText(raw);
  if (!data || typeof data !== "object") return null;

  const title = str(data.title);
  const hook = str(data.hook);
  if (title.length < 3 || hook.length < 20) return null;

  const sections = (Array.isArray(data.sections) ? data.sections : [])
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const body = str(s.body);
      if (body.length < 60) return null;
      const examples = (Array.isArray(s.examples) ? s.examples : [])
        .map((e) => ({ en: str(e?.en), pt: str(e?.pt), note: str(e?.note) }))
        .filter((e) => e.en && e.pt);
      const quiz = (Array.isArray(s.quiz) ? s.quiz : []).map(normalizeQuiz).filter(Boolean).slice(0, 1);
      return {
        heading: str(s.heading) || "Continuando...",
        mood: MOODS.includes(s.mood) ? s.mood : "perfil",
        body,
        examples,
        ptAnalogy: str(s.ptAnalogy),
        tip: str(s.tip),
        quiz,
      };
    })
    .filter(Boolean);
  if (sections.length < 3 || sections.length > 8) return null;
  if (!sections.some((s) => s.examples.length > 0)) return null;
  // A aula precisa ter ao menos 1 mini-quiz — sem isso ela vira leitura
  // passiva e o aluno não se testa antes do checkpoint final.
  if (!sections.some((s) => s.quiz.length > 0)) return null;

  const mistakes = (Array.isArray(data.mistakes) ? data.mistakes : [])
    .map((m) => ({ wrong: str(m?.wrong), right: str(m?.right), why: str(m?.why) }))
    .filter((m) => m.wrong && m.right)
    .slice(0, 6);

  const summary = (Array.isArray(data.summary) ? data.summary : []).map((x) => str(x)).filter(Boolean).slice(0, 8);
  if (summary.length < 2) return null;

  const finalQuiz = (Array.isArray(data.finalQuiz) ? data.finalQuiz : []).map(normalizeQuiz).filter(Boolean).slice(0, 5);
  // Com menos de 3 questões o checkpoint não mede nada.
  if (finalQuiz.length < 3) return null;

  return { title, hook, sections, mistakes, summary, finalQuiz };
};

// Nota do checkpoint final: compara as respostas do aluno com o
// gabarito guardado NO SERVIDOR. O cliente nunca vê/decide se acertou
// para fins de XP — só manda os índices que escolheu.
const scoreFinalQuiz = (lesson, answers) => {
  const quiz = Array.isArray(lesson?.finalQuiz) ? lesson.finalQuiz : [];
  const total = quiz.length;
  if (!Array.isArray(answers) || total === 0) return { score: 0, total, pct: 0, passed: false };
  let score = 0;
  quiz.forEach((q, i) => { if (Number(answers[i]) === q.correctIndex) score++; });
  const pct = Math.round((score / total) * 100);
  return { score, total, pct, passed: pct >= LESSON_PASS_PCT };
};

// Versão "pública" do conteúdo: hoje é o próprio conteúdo. Mantido
// como função para, se um dia quisermos esconder o gabarito do
// checkpoint final do cliente, ter um único lugar para fazê-lo.
const publicLesson = (lesson) => lesson;

module.exports = {
  LEVELS, LESSON_XP, LESSON_PASS_PCT, MODELS, MOODS,
  slugify, lessonId, buildCatalog, CATALOG, resolveLesson,
  FRED_PERSONA, buildPrompt, LESSON_SCHEMA,
  normalizeLesson, normalizeQuiz, scoreFinalQuiz, publicLesson, fixEscapedText,
};
