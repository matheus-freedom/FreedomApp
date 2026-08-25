import {
  Level, Theme, GeneratedContent, VoiceGender, VoiceAccent,
  WritingFeedback, StudyPlanInput, StudyPlan, StudyWeek,
  StudyDay, StudyTask, GuideCharacter, ChatMessage
} from '../types';
import { db } from './firebase';
import { deepFixEscapedText } from '../textFix';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { PlacementSkill } from '../types';

const FUNCTION_URL = import.meta.env.DEV
  ? "http://localhost:8888/.netlify/functions/gemini"
  : "/.netlify/functions/gemini";

const translationCache = new Map<string, string>();
const audioCache = new Map<string, string>();

async function callGemini(action: string, payload: Record<string, any>): Promise<any> {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(error.error || `Erro HTTP ${response.status}`);
  }
  return response.json();
}

const handleError = (error: any): never => {
  console.error("Gemini Service Error:", error);
  const msg = error?.message || "";
  if (msg.includes("429") || msg.includes("Limite")) {
    throw new Error("⚠️ Limite de tráfego excedido. Por favor, aguarde alguns instantes.");
  }
  throw new Error(msg || "Houve um problema ao processar seu pedido com a IA. Tente novamente.");
};

const getVoiceName = (gender: VoiceGender, accent: VoiceAccent): string => {
  if (gender === 'Male') return accent === 'British' ? 'Fenrir' : 'Puck';
  return accent === 'British' ? 'Zephyr' : 'Kore';
};

// ══════════════════════════════════════════════════════════════
// VARIEDADE DE PERSONAGENS
// ──────────────────────────────────────────────────────────────
// Sem instrução explícita, o modelo cai sempre nos mesmos nomes
// (Sarah, Mark, Leo). A correção tem duas partes: um elenco amplo
// de nomes americanos, brasileiros e latinos, e um SORTEIO a cada
// geração — como o prompt muda de uma atividade para a outra, o
// modelo não tem como convergir sempre para os mesmos nomes.
// ══════════════════════════════════════════════════════════════
const NAME_POOL = [
  // Estados Unidos / anglófonos
  'Ethan', 'Olivia', 'Marcus', 'Chloe', 'Nathan', 'Grace', 'Dylan', 'Naomi',
  'Trevor', 'Harper', 'Caleb', 'Vivian', 'Spencer', 'Ruby', 'Damon', 'Paige',
  'Jerome', 'Colette', 'Wesley', 'Imani', 'Preston', 'Delia', 'Malik', 'Sloane',
  // Brasil
  'Thiago', 'Larissa', 'Rafael', 'Beatriz', 'Gustavo', 'Camila', 'Bruno', 'Juliana',
  'Vinícius', 'Priscila', 'Rodrigo', 'Tatiana', 'Fernando', 'Renata', 'Caio', 'Bianca',
  'Matheus', 'Aline', 'Otávio', 'Letícia', 'Igor', 'Sabrina', 'Murilo', 'Carla',
  // América Latina / hispânicos
  'Santiago', 'Valentina', 'Mateo', 'Lucía', 'Joaquín', 'Camilo', 'Ximena', 'Emiliano',
  'Álvaro', 'Daniela', 'Nicolás', 'Paloma', 'Esteban', 'Mariana', 'Andrés',
  'Rocío', 'Facundo', 'Gabriela', 'Ignacio', 'Antonella', 'Tomás', 'Selena', 'Hugo',
];

// Cenários, para o contexto não cair sempre em "Londres / biblioteca".
const SETTING_POOL = [
  'a coworking space in São Paulo', 'a night bus in Buenos Aires', 'a food truck festival in Austin',
  'a rooftop garden in Bogotá', 'a hardware store in Chicago', 'a beach kiosk in Recife',
  'a mountain hostel in Cusco', 'a recording studio in Los Angeles', 'a farmers market in Guadalajara',
  'a startup office in Florianópolis', 'a train station in Seattle', 'a family bakery in Montevideo',
  'a dive shop in Fortaleza', 'a university lab in Boston', 'a car repair shop in Medellín',
  'a community radio in Porto Alegre', 'a ski lodge in Denver', 'a bookshop in Santiago',
];

const pickRandom = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
};

// Bloco de instrução com o elenco sorteado desta geração.
const buildVarietyInstruction = (): string => {
  const names = pickRandom(NAME_POOL, 6);
  const setting = pickRandom(SETTING_POOL, 1)[0];
  return `VARIEDADE OBRIGATÓRIA DE PERSONAGENS E CENÁRIO:
- Se o conteúdo tiver personagens, use SOMENTE nomes desta lista: ${names.join(', ')}.
- É PROIBIDO usar os nomes Sarah, Mark, Leo, John, Mary, Anna, Emily, Michael, Tom e David — já aparecem demais na plataforma.
- Ambiente sugerido para o contexto: ${setting}. Adapte ao tópico quando fizer sentido.
- Misture naturalmente personagens de origens diferentes (americana, brasileira, latina).`;
};

// ══════════════════════════════════════════════════════════════
// APOIO AO PLANO DE ESTUDOS
// ══════════════════════════════════════════════════════════════

// Converte a opção escolhida na tela ('30 Days') em número de dias.
export const parseDurationToDays = (duration: string): number => {
  const d = String(duration || '').toLowerCase();
  const weeks = d.match(/(\d+)\s*week/);
  if (weeks) return Math.max(1, parseInt(weeks[1], 10)) * 7;
  const days = d.match(/(\d+)\s*day/);
  if (days) return Math.max(1, parseInt(days[1], 10));
  return 30; // padrão seguro se vier algo inesperado
};

// Temas válidos: são os mesmos valores do enum Theme, porque o tema
// da tarefa é usado depois para gerar o exercício. Se a IA inventar
// um nome diferente, o botão "praticar" da tarefa quebraria.
export const VALID_THEMES: string[] = Object.values(Theme);

// Aceita variações de grafia/acentuação e devolve sempre um Theme
// válido; se não reconhecer, cai no foco do plano ou em Gramática.
export const normalizeTheme = (raw: any, focusSkill?: string): Theme => {
  const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const value = strip(String(raw || ''));

  const direct = (Object.values(Theme) as Theme[]).find(t => strip(t) === value);
  if (direct) return direct;

  const aliases: Record<string, Theme> = {
    grammar: Theme.Grammar, gramatica: Theme.Grammar,
    vocabulary: Theme.Vocabulary, vocabulario: Theme.Vocabulary,
    business: Theme.Business, 'business english': Theme.Business,
    reading: Theme.Reading, leitura: Theme.Reading,
    listening: Theme.Listening, audicao: Theme.Listening, escuta: Theme.Listening,
    writing: Theme.Writing, escrita: Theme.Writing, redacao: Theme.Writing,
  };
  if (aliases[value]) return aliases[value];

  if (focusSkill) {
    const fromFocus = aliases[strip(focusSkill)];
    if (fromFocus) return fromFocus;
  }
  return Theme.Grammar;
};

// Leitura tolerante de JSON: modelos às vezes devolvem cercas de
// markdown, texto em volta ou vírgula sobrando. Em vez de derrubar o
// plano inteiro, tentamos reparar antes de desistir.
export const parseJsonLoose = (text: any): any => {
  let clean = String(text || '').replace(/```json|```/g, '').trim();
  try { return deepFixEscapedText(JSON.parse(clean)); } catch { /* tenta reparar */ }

  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) clean = clean.slice(first, last + 1);
  clean = clean.replace(/,\s*([}\]])/g, '$1');

  return deepFixEscapedText(JSON.parse(clean));
};

const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    readingText: { type: 'STRING' },
    listeningScript: { type: 'STRING' },
    writingPrompt: { type: 'STRING' },
    writingPromptPT: { type: 'STRING' },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          question: { type: 'STRING' },
          questionPT: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correctAnswerIndex: { type: 'INTEGER' },
          explanation: { type: 'STRING' },
        },
        required: ["id", "question", "questionPT", "options", "correctAnswerIndex", "explanation"],
      },
    },
  },
  required: ["questions"],
};

export const generatePlacementGrammar = async (): Promise<GeneratedContent> => {
  try {
    const result = await callGemini("generateContent", {
      model: "gemini-3.5-flash",
      contents: "Gere 30 questões de nivelamento de gramática (A1 a C1).",
      config: {
        systemInstruction: `Você é um avaliador Freedom. Gere 30 questões de nivelamento de gramática rigorosas, de A1 a C1. PROGRESSÃO LINEAR. EXPLICAÇÕES EM PT-BR.`,
        responseMimeType: "application/json",
        responseSchema: QUIZ_SCHEMA,
      },
    });
    return deepFixEscapedText(JSON.parse(result.text || "{}")) as GeneratedContent;
  } catch (error) { throw handleError(error); }
};

export const generateAdaptivePlacementStep = async (step: Theme, seedLevel: Level): Promise<GeneratedContent> => {
  try {
    const result = await callGemini("generateContent", {
      model: "gemini-3.5-flash",
      contents: `Gere atividade de nivelamento de ${step} focada no nível ${seedLevel}.`,
      config: {
        systemInstruction: `Avaliador Freedom. Gere teste de ${step} para nível ${seedLevel}. Gere 10 questões. Explicações em PT-BR.`,
        responseMimeType: "application/json",
        responseSchema: QUIZ_SCHEMA,
      },
    });
    return deepFixEscapedText(JSON.parse(result.text || "{}")) as GeneratedContent;
  } catch (error) { throw handleError(error); }
};

export const generateQuizContent = async (
  level: Level, theme: Theme, subTopic: string,
  voiceGender: VoiceGender = 'Female', voiceAccent: VoiceAccent = 'American'
): Promise<GeneratedContent> => {
  try {
    const result = await callGemini("generateContent", {
      model: "gemini-3.5-flash",
      contents: `Gere 10 questões de ${theme} - ${subTopic} (${level}). Priorize textos objetivos.`,
      config: {
        systemInstruction: `Professor Freedom. Gere atividade de ${theme} sobre ${subTopic} para nível ${level}. Explicações em PT-BR.

${buildVarietyInstruction()}`,
        responseMimeType: "application/json",
        responseSchema: QUIZ_SCHEMA,
      },
    });
    const data = deepFixEscapedText(JSON.parse(result.text || "{}")) as GeneratedContent;
    data.voiceConfig = { gender: voiceGender, accent: voiceAccent };
    return data;
  } catch (error) { throw handleError(error); }
};

export const generateAudioFromText = async (
  text: string, voiceGender: VoiceGender, voiceAccent: VoiceAccent
): Promise<string> => {
  const cacheKey = `audio_${voiceGender}_${voiceAccent}_${text.toLowerCase().substring(0, 50)}`;
  if (audioCache.has(cacheKey)) return audioCache.get(cacheKey)!;
  try {
    const voiceName = getVoiceName(voiceGender, voiceAccent);
    const result = await callGemini("generateAudio", { text, voiceName });
    if (result.audioData) audioCache.set(cacheKey, result.audioData);
    return result.audioData || "";
  } catch (error) {
    console.warn("TTS generation failed", error);
    return "";
  }
};

export const evaluateWritingExercise = async (
  userText: string, originalPrompt: string, level: Level
): Promise<WritingFeedback> => {
  const WRITING_SCHEMA = {
    type: 'OBJECT',
    properties: {
      score: { type: 'INTEGER' },
      feedback: { type: 'STRING' },
      annotatedHtml: { type: 'STRING' },
      suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
      recommendedTopics: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ["score", "feedback", "annotatedHtml", "suggestions", "recommendedTopics"],
  };
  try {
    const result = await callGemini("generateContent", {
      model: "gemini-3.5-flash",
      contents: `Prompt: ${originalPrompt}\nTexto: ${userText}`,
      config: {
        systemInstruction: `Você é o avaliador de Escrita da Freedom. Analise o texto do aluno para o nível ${level}. Score de 0-100. Feedback em PT-BR. Use <span class="error-text">erro</span> <span class="improvement-text">correção</span> no annotatedHtml.`,
        responseMimeType: "application/json",
        responseSchema: WRITING_SCHEMA,
      },
    });
    return deepFixEscapedText(JSON.parse(result.text || "{}")) as WritingFeedback;
  } catch (error) {
    console.error("Erro na avaliação de escrita:", error);
    return { score: 0, feedback: "Erro técnico ao avaliar. Tente novamente.", annotatedHtml: userText, suggestions: [], recommendedTopics: [] };
  }
};

export const generateStudyPlan = async (
  inputs: StudyPlanInput,
  onProgress?: (message: string) => void
): Promise<StudyPlan> => {
  if (inputs.isChallenge) {
    const startDate = new Date('2026-02-23T00:00:00');
    const totalDays = 41;
    const weeks: StudyWeek[] = [];
    const themes = [Theme.Grammar, Theme.Vocabulary, Theme.Reading, Theme.Listening, Theme.Writing, 'Speaking'];
    const dailyCount = inputs.dailyAvailability || 1;
    let currentWeek: StudyWeek = { weekNumber: 1, days: [] };
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const theme = themes[i % 6];
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayName = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const tasks: StudyTask[] = [];
      const isSingleTaskTheme = theme === Theme.Writing || theme === 'Speaking';
      const tasksToCreate = isSingleTaskTheme ? 1 : dailyCount;
      for (let j = 0; j < tasksToCreate; j++) {
        tasks.push({
          id: crypto.randomUUID(),
          description: theme === 'Speaking'
            ? `Easter Challenge Day ${i + 1}: Envie um áudio no grupo do WhatsApp.`
            : `Easter Challenge Day ${i + 1}: Prática de ${theme} (${j + 1}/${dailyCount})`,
          isCompleted: false,
          relatedTheme: theme !== 'Speaking' ? theme as Theme : undefined,
          date: dateStr,
        });
      }
      currentWeek.days.push({ dayName: `Dia ${i+1} (${dayName})`, date: dateStr, tasks });
      if (currentWeek.days.length === 7 || i === totalDays - 1) {
        weeks.push(currentWeek);
        currentWeek = { weekNumber: weeks.length + 1, days: [] };
      }
    }
    let totalTasks = 0;
    weeks.forEach(w => w.days.forEach(d => totalTasks += d.tasks.length));
    return {
      id: crypto.randomUUID(), createdAt: Date.now(), inputs, weeks,
      totalTasks, completedTasks: 0, isChallenge: true,
      challengeStartDate: '2026-02-23', challengeEndDate: '2026-04-04', lives: 3,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // GERAÇÃO EM BLOCOS
  // ──────────────────────────────────────────────────────────────
  // Antes, o plano inteiro era pedido à IA numa única chamada: um
  // plano de 90 dias com 8 exercícios por dia são 720 tarefas, cada
  // uma com id, descrição e campos de controle. Esse JSON gigante
  // estourava o tempo limite da função (26s) ou vinha cortado pela
  // metade — daí a falha, mais frequente ainda no foco personalizado,
  // que rende descrições mais longas.
  //
  // Agora a IA devolve só o essencial (tema + tópicos curtos por dia),
  // em blocos de 2 semanas, e o app monta as tarefas. Cada chamada é
  // pequena e rápida, e o plano completo nunca depende de uma única
  // resposta perfeita.
  // ══════════════════════════════════════════════════════════════
  const DAYS_PER_CHUNK = 14;

  const totalDays = parseDurationToDays(inputs.duration);
  const tasksPerDay = Math.max(1, Math.min(8, inputs.dailyAvailability || 1));
  const focusLabel = inputs.customFocus?.trim() || inputs.focusSkill;

  const CHUNK_SCHEMA = {
    type: 'OBJECT',
    properties: {
      days: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            theme: { type: 'STRING' },
            topics: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ["theme", "topics"],
        },
      },
    },
    required: ["days"],
  };

  try {
    const usedTopics: string[] = [];
    const allDays: { theme: Theme; topics: string[] }[] = [];

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset += DAYS_PER_CHUNK) {
      const chunkDays = Math.min(DAYS_PER_CHUNK, totalDays - dayOffset);
      onProgress?.(`Montando seu plano: dia ${dayOffset + 1} de ${totalDays}...`);

      // Só os tópicos recentes vão no prompt: o suficiente para evitar
      // repetição sem inchar a chamada de volta ao tamanho do problema.
      const avoid = usedTopics.slice(-40);

      let parsedDays: { theme: Theme; topics: string[] }[] = [];
      let lastErr: unknown = null;

      for (let attempt = 1; attempt <= 3 && parsedDays.length === 0; attempt++) {
        try {
          const result = await callGemini("generateContent", {
            model: "gemini-3.5-flash",
            contents: `Monte os dias ${dayOffset + 1} a ${dayOffset + chunkDays} de um plano de estudos de inglês de ${totalDays} dias.`,
            config: {
              systemInstruction: `Você é o arquiteto de estudos da Freedom, escola de inglês brasileira.
Aluno: nível CEFR ${inputs.level}. Foco do plano: ${focusLabel}. Disponibilidade: ${inputs.timeAvailable}.

Devolva EXATAMENTE ${chunkDays} dias. Para CADA dia:
- "theme": exatamente um destes valores, sem variar a grafia: ${VALID_THEMES.join(' | ')}
- "topics": EXATAMENTE ${tasksPerDay} tópicos de estudo, curtos (2 a 6 palavras), em PORTUGUÊS.

REGRAS:
- Cada tópico deve ser ESPECÍFICO e praticável (ex: "Present Perfect com for e since"), nunca genérico (ex: "Praticar gramática").
- TODOS os tópicos do plano inteiro devem ser DIFERENTES entre si. Nunca repita um tópico.
- NÃO use nenhum destes tópicos já usados: ${avoid.length ? avoid.join(' ; ') : '(nenhum ainda)'}
- Dificuldade progressiva: os dias mais avançados do bloco puxam mais que os iniciais.
- Distribua os temas ao longo dos dias respeitando o foco "${focusLabel}".`,
              responseMimeType: "application/json",
              responseSchema: CHUNK_SCHEMA,
              maxOutputTokens: 4096,
            },
          });

          const data = parseJsonLoose(result.text);
          const days = Array.isArray(data?.days) ? data.days : [];
          const normalized = days
            .map((d: any) => ({
              theme: normalizeTheme(d?.theme, inputs.focusSkill),
              topics: (Array.isArray(d?.topics) ? d.topics : [])
                .map((t: any) => String(t || '').trim())
                .filter(Boolean),
            }))
            .filter((d: { topics: string[] }) => d.topics.length > 0);

          if (normalized.length > 0) parsedDays = normalized;
          else lastErr = new Error('A IA não devolveu dias válidos.');
        } catch (e) {
          lastErr = e;
        }
      }

      if (parsedDays.length === 0) {
        throw new Error(
          `Não consegui montar os dias ${dayOffset + 1} a ${dayOffset + chunkDays} do plano. ` +
          (lastErr instanceof Error ? lastErr.message : '')
        );
      }

      // Completa/apara para bater exatamente com o tamanho do bloco.
      // O ciclo usa o tamanho ORIGINAL: usar parsedDays.length dentro do
      // laço daria sempre resto 0, ou seja, repetiria o dia 1 em todos
      // os dias faltantes em vez de rodar os dias que a IA devolveu.
      const originalCount = parsedDays.length;
      for (let i = originalCount; i < chunkDays; i++) {
        parsedDays.push(parsedDays[i % originalCount]);
      }
      parsedDays = parsedDays.slice(0, chunkDays);

      parsedDays.forEach(d => usedTopics.push(...d.topics));
      allDays.push(...parsedDays);
    }

    onProgress?.('Finalizando seu plano...');

    // ── Montagem local: ids, datas e semanas saem daqui, não da IA ──
    const startDate = new Date();
    const weeks: StudyWeek[] = [];
    let totalTasks = 0;
    const seenTopics = new Set<string>();

    allDays.forEach((day, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      // Garante tópicos únicos mesmo se a IA repetir entre blocos: um
      // tópico repetido viraria um exercício sem XP (regra "só na 1ª vez").
      const tasks: StudyTask[] = [];
      for (let j = 0; j < tasksPerDay; j++) {
        const base = (day.topics[j % day.topics.length] || '').trim();
        if (!base) continue;

        // Repete o sufixo até a chave ficar realmente inédita. Renomear
        // uma vez só não bastava: quando a IA devolvia menos tópicos que
        // o número de exercícios do dia, o mesmo tópico reciclado gerava
        // sempre a MESMA string renomeada. Pela regra "XP só na 1ª vez",
        // essas repetições valeriam 0 XP para o aluno.
        let topic = base;
        let suffix = 1;
        while (seenTopics.has(`${day.theme}|${topic.toLowerCase()}`)) {
          topic = `${base} (revisão ${suffix++})`;
        }
        seenTopics.add(`${day.theme}|${topic.toLowerCase()}`);
        tasks.push({
          id: crypto.randomUUID(),
          description: topic,
          isCompleted: false,
          relatedTheme: day.theme,
          date: dateStr,
        });
      }
      totalTasks += tasks.length;

      const weekIdx = Math.floor(i / 7);
      if (!weeks[weekIdx]) weeks[weekIdx] = { weekNumber: weekIdx + 1, days: [] };
      weeks[weekIdx].days.push({ dayName: `Dia ${i + 1} (${label})`, date: dateStr, tasks });
    });

    return {
      id: crypto.randomUUID(), createdAt: Date.now(), inputs,
      weeks, totalTasks, completedTasks: 0,
    };
  } catch (error) { throw handleError(error); }
};

export const chatWithGuide = async (
  history: ChatMessage[], message: string, userName: string, guide: GuideCharacter
): Promise<ChatMessage[]> => {
  try {
    const result = await callGemini("chat", {
      model: "gemini-3.5-flash",
      systemInstruction: `Você é ${guide}, assistente da Freedom. Ajude ${userName} com dúvidas de inglês de forma animada e profissional.`,
      history: history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      message,
    });
    return [{ id: crypto.randomUUID(), role: 'model', text: result.text || "..." }];
  } catch (error) { throw handleError(error); }
};

export const translateWordToPortuguese = async (word: string): Promise<string> => {
  const cacheKey = `trans_${word.toLowerCase().trim()}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!;
  try {
    const result = await callGemini("translate", { word });
    if (result.text) translationCache.set(cacheKey, result.text);
    return result.text || "";
  } catch { return ""; }
};

export const generateWritingExample = async (prompt: string, level: Level): Promise<string> => {
  try {
    const result = await callGemini("generateContent", {
      model: "gemini-3.5-flash",
      contents: `Gere um exemplo de texto perfeito no nível ${level} para: "${prompt}". SEM MARKDOWN. Texto limpo.`,
      config: {},
    });
    return result.text?.trim() || "";
  } catch { return ""; }
};

// ══════════════════════════════════════════════════════════════
// NIVELAMENTO POR HABILIDADE (Etapa 3 — disparo + polling)
// Conversa com a Background Function placement-background:
// gera jobId, dispara, faz polling em placement_jobs/{jobId} até
// status "done", e devolve o bankId para o chamador ler o banco.
// ══════════════════════════════════════════════════════════════

// URL da Background Function (diferente da função síncrona 'gemini').
const PLACEMENT_FUNCTION_URL = import.meta.env.DEV
  ? "http://localhost:8888/.netlify/functions/placement-background"
  : "/.netlify/functions/placement-background";

// Gera um id único compatível com todos os navegadores.
const generateJobId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).substring(2, 12);

// Chave do trimestre atual — MESMA lógica do api.ts (2026-Q3).
// Repetida aqui porque este serviço precisa dela para montar o disparo.
const getQuarterKeyClient = (date: Date = new Date()): string => {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
};

// ── Dispara a geração de UMA variação e aguarda por polling ──────
// Usado quando o banco daquela habilidade ainda não tem as 3 variações
// (preenchimento gradual). Dispara a Background Function e fica olhando
// placement_jobs/{jobId} até o resultado. Não devolve as questões
// diretamente — quando termina, o chamador lê do placement_bank.
// ── Dispara a geração e NÃO espera (fire-and-forget) ─────────────
// Usado quando o aluno já tem uma prova pronta para responder: o
// banco se completa sozinho em segundo plano, sem prender ninguém
// na tela de carregamento. Erros aqui são silenciosos de propósito —
// não são problema do aluno que está fazendo o teste agora.
export const triggerPlacementGeneration = (skill: PlacementSkill, variation: number): void => {
  try {
    fetch(PLACEMENT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: generateJobId(),
        skill,
        quarterKey: getQuarterKeyClient(),
        variation,
        // Ninguém está esperando este resultado: se outro processo já
        // estiver gerando esta variação, a função deve encerrar na hora
        // em vez de ficar minutos consultando o Firestore à toa.
        wait: false,
      }),
      keepalive: true, // sobrevive se o aluno mudar de tela logo em seguida
    }).catch(() => {});
  } catch { /* silencioso por definição */ }
};

export const generatePlacementVariation = async (
  skill: PlacementSkill,
  variation: number,
  onProgress?: (message: string) => void,
  // Listening precisa de 10 chamadas de IA (5 de questões + 5 de áudio
  // TTS). Os 5 minutos anteriores estouravam antes da função terminar,
  // e o aluno via "demorou demais" para uma geração que dava certo.
  // A Background Function tem 15 minutos de folga, então esperamos 12.
  timeoutMs = skill === PlacementSkill.Listening ? 720_000 : 420_000
): Promise<{ bankId: string }> => {
  const jobId = generateJobId();
  const quarterKey = getQuarterKeyClient();

  onProgress?.("Preparando seu teste...");

  // 1. Dispara a Background Function (retorna 202 quase instantâneo).
  const response = await fetch(PLACEMENT_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, skill, quarterKey, variation }),
  });

  // Background functions respondem 202 (Accepted) sem corpo útil.
  // Só checamos que o disparo foi aceito; o resultado vem pelo Firestore.
  if (!response.ok && response.status !== 202) {
    const err = await response.json().catch(() => ({ error: "Erro ao iniciar a geração." }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  // 2. Polling em placement_jobs/{jobId}.
  const startedAt = Date.now();
  const pollInterval = 3_000;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("A geração do teste demorou demais. Tente novamente."));
        return;
      }
      try {
        const jobRef = doc(db, "placement_jobs", jobId);
        const jobSnap = await getDoc(jobRef);

        if (!jobSnap.exists()) {
          setTimeout(poll, pollInterval);
          return;
        }

        const jobData = jobSnap.data() as any;

        if (jobData.status === "working") {
          // Ainda gerando — continua o polling sem apagar o carimbo.
          onProgress?.("Gerando as questões do seu nível...");
          setTimeout(poll, pollInterval);
          return;
        }

        // Terminou (done ou error): limpa o carimbo efêmero.
        deleteDoc(jobRef).catch(() => {});

        if (jobData.status === "error") {
          reject(new Error(jobData.error || "Erro ao gerar o teste."));
          return;
        }

        // status === "done"
        resolve({ bankId: jobData.bankId });
      } catch (e) {
        // Erro transitório de rede no polling — tenta de novo.
        setTimeout(poll, pollInterval);
      }
    };
    // Primeira checagem após 4s (dá tempo da função iniciar e carimbar).
    setTimeout(poll, 4_000);
  });
};

// ── Avalia a redação do nivelamento de ESCRITA ─────────────────
// Writing não tem progressão de níveis: o aluno escreve UM texto e a
// IA o classifica direto num nível CEFR. Regra central da avaliação
// (definida pelo Matheus): complexidade lexical e sintática tem o
// MESMO peso que correção gramatical — um texto sem erros mas com
// vocabulário simples de A2 é A2, não C1.
export const evaluateWritingPlacement = async (
  prompt: string,
  essay: string
): Promise<{ level: Level; score: number; feedback: string }> => {
  try {
    const evalPrompt = `You are an expert CEFR English examiner. Classify the following student essay into ONE CEFR level: A1, A2, B1, B2 or C1.

CRITICAL EVALUATION RULES:
- Lexical and syntactic COMPLEXITY carries EQUAL weight to grammatical accuracy. An essay with zero errors but only simple A2-level vocabulary and structures is A2, NOT C1.
- To reach B2/C1, the essay must DEMONSTRATE advanced structures (conditionals, passive, inversion, nuanced connectors) and rich vocabulary — not merely avoid mistakes.
- A very short essay that shows little cannot be classified above the level it demonstrates.
- Consider: range of vocabulary, variety of grammatical structures, cohesion and organization, accuracy, and task response.

The writing task was: "${prompt}"

Student essay:
"""
${essay}
"""

Return ONLY valid JSON (no markdown, no backticks):
{
  "level": "A1" | "A2" | "B1" | "B2" | "C1",
  "score": 0-100 (overall quality within the classified level),
  "feedback": "2-3 frases de feedback construtivo em PORTUGUÊS BRASILEIRO, citando pontos fortes e o que melhorar para subir de nível"
}`;

    const data = await callGemini("generateContent", {
      model: "gemini-3.5-flash",
      contents: evalPrompt,
      config: { responseMimeType: "application/json" },
    });

    const clean = String(data.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1'];
    const level = validLevels.includes(parsed.level) ? parsed.level as Level : ('A1' as Level);
    const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 50;
    const feedback = typeof parsed.feedback === 'string' ? parsed.feedback : '';

    return { level, score, feedback };
  } catch (error) {
    return handleError(error);
  }
};
