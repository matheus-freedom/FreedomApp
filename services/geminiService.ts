import {
  Level, Theme, GeneratedContent, VoiceGender, VoiceAccent,
  WritingFeedback, StudyPlanInput, StudyPlan, StudyWeek,
  StudyDay, StudyTask, GuideCharacter, ChatMessage
} from '../types';

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
    return JSON.parse(result.text || "{}") as GeneratedContent;
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
    return JSON.parse(result.text || "{}") as GeneratedContent;
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
        systemInstruction: `Professor Freedom. Gere atividade de ${theme} sobre ${subTopic} para nível ${level}. Explicações em PT-BR.`,
        responseMimeType: "application/json",
        responseSchema: QUIZ_SCHEMA,
      },
    });
    const data = JSON.parse(result.text || "{}") as GeneratedContent;
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
    return JSON.parse(result.text || "{}") as WritingFeedback;
  } catch (error) {
    console.error("Erro na avaliação de escrita:", error);
    return { score: 0, feedback: "Erro técnico ao avaliar. Tente novamente.", annotatedHtml: userText, suggestions: [], recommendedTopics: [] };
  }
};

export const generateStudyPlan = async (inputs: StudyPlanInput): Promise<StudyPlan> => {
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

  const PLAN_SCHEMA = {
    type: 'OBJECT',
    properties: {
      weeks: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            weekNumber: { type: 'INTEGER' },
            days: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  dayName: { type: 'STRING' },
                  tasks: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        id: { type: 'STRING' },
                        description: { type: 'STRING' },
                        isCompleted: { type: 'BOOLEAN' },
                        relatedTheme: { type: 'STRING' },
                      },
                      required: ["id", "description", "isCompleted", "relatedTheme"],
                    },
                  },
                },
                required: ["dayName", "tasks"],
              },
            },
          },
          required: ["weekNumber", "days"],
        },
      },
    },
    required: ["weeks"],
  };

  try {
    const result = await callGemini("generateContent", {
      model: "gemini-3.5-flash",
      contents: `Gere um plano de estudos para nível ${inputs.level}, foco em ${inputs.focusSkill}, duração ${inputs.duration}.`,
      config: {
        systemInstruction: `Arquiteto de Educação Freedom. Plano nível ${inputs.level}, duração ${inputs.duration}, disponibilidade ${inputs.timeAvailable}. Foco: ${inputs.focusSkill}. Descrições em Português.`,
        responseMimeType: "application/json",
        responseSchema: PLAN_SCHEMA,
      },
    });
    const parsed = JSON.parse(result.text || "{}");
    let totalTasks = 0;
    (parsed.weeks || []).forEach((w: any) => w.days?.forEach((d: any) => totalTasks += d.tasks?.length || 0));
    return { id: crypto.randomUUID(), createdAt: Date.now(), inputs, weeks: parsed.weeks || [], totalTasks, completedTasks: 0 };
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
