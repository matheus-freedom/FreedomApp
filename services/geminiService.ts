import { GoogleGenAI, Type, Modality } from '@google/genai';
import { Level, Theme, GeneratedContent, VoiceGender, VoiceAccent, WritingFeedback, StudyPlanInput, StudyPlan, StudyWeek, StudyDay, StudyTask, GuideCharacter, ChatMessage } from '../types';

// Cache persistente em memória para velocidade instantânea
const translationCache = new Map<string, string>();
const audioCache = new Map<string, string>();

const handleGeminiError = (error: any): never => {
  console.error("Gemini API Error Details:", error);
  const msg = error?.message || error?.toString() || "";
  
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("exceeded")) {
    throw new Error("⚠️ Limite de tráfego excedido. Por favor, aguarde alguns instantes.");
  }
  
  throw new Error("Houve um problema ao processar seu pedido com a IA. Verifique sua conexão ou tente novamente.");
};

const DIVERSE_NAMES = [
  "Mohammad", "John", "David", "Michael", "James", "Robert", "William", "Joseph", "Daniel", "Paul", 
  "Mark", "Thomas", "Andrew", "Peter", "Ahmed", "Ali", "Omar", "Hassan", "Carlos", "Juan", "José", 
  "Luis", "Antonio", "Maria", "Mary", "Fatima", "Anna", "Anne", "Ana", "Aisha", "Sofia", "Sarah", 
  "Emma", "Elizabeth", "Margaret", "Patricia", "Linda", "Barbara", "Susan", "Jessica", "Jennifer", 
  "Lisa", "Sandra", "Laura", "Elena", "Carmen", "Rosa", "Isabella"
];

const TEXT_GENRES = [
  "contos", "artigos de notícias", "artigos de opinião", "posts de blog", "e-mails (formais ou informais)", 
  "anúncios publicitários", "postagens em redes sociais", "resenhas de produtos/filmes", "relatórios técnicos", 
  "biografias", "autobiografias", "manuais e instruções", "textos acadêmicos simplificados", "fábulas", 
  "perguntas frequentes (FAQ)", "estudos de caso empresariais", "crônicas", "editoriais", "cartas formais", 
  "comunicados de imprensa", "avisos e regulamentos", "termos de uso/políticas", "roteiros curtos", 
  "sinopses", "críticas culturais", "slogans e campanhas", "discursos políticos ou motivacionais", 
  "palestras transcritas", "podcasts transcritos", "letras de músicas", "poemas", "receitas culinárias", 
  "cardá menus comentados", "guias de viagem", "anúncios de emprego", "descrições de vagas", "currículos", 
  "perfis profissionais", "apresentações corporativas", "pitches", "propostas comerciais", 
  "comunicados internos", "atas de reunião", "memorandos", "white papers", "abstracts científicos", 
  "tutoriais", "depoimentos de clientes", "pesquisas de opinião"
];

const QUIZ_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    readingText: { type: Type.STRING, description: "Texto para atividade de Reading ou Business" },
    listeningScript: { type: Type.STRING, description: "Script para atividade de Listening" },
    writingPrompt: { type: Type.STRING, description: "Prompt para atividade de Writing" },
    writingPromptPT: { type: Type.STRING, description: "Tradução do prompt para PT-BR" },
    questions: {
      type: Type.ARRAY,
      description: "Lista de 10 questões do quiz",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          question: { type: Type.STRING },
          questionPT: { type: Type.STRING, description: "Tradução da pergunta para PT-BR" },
          options: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Exatamente 4 alternativas"
          },
          correctAnswerIndex: { type: Type.INTEGER },
          explanation: { type: Type.STRING, description: "Explicação em PT-BR" }
        },
        required: ["id", "question", "questionPT", "options", "correctAnswerIndex", "explanation"]
      }
    }
  },
  required: ["questions"]
};

const STUDY_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    weeks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          weekNumber: { type: Type.INTEGER },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dayName: { type: Type.STRING },
                tasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      description: { type: Type.STRING },
                      isCompleted: { type: Type.BOOLEAN },
                      relatedTheme: { type: Type.STRING, enum: Object.values(Theme) }
                    },
                    required: ["id", "description", "isCompleted", "relatedTheme"]
                  }
                }
              },
              required: ["dayName", "tasks"]
            }
          }
        },
        required: ["weekNumber", "days"]
      }
    }
  },
  required: ["weeks"]
};

const getVoiceName = (gender: VoiceGender, accent: VoiceAccent): string => {
  if (gender === 'Male') {
    if (accent === 'British') return 'Fenrir';
    return 'Puck';
  } else {
    if (accent === 'British') return 'Zephyr';
    return 'Kore';
  }
};

export const generatePlacementGrammar = async (): Promise<GeneratedContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const systemInstruction = `Você é um avaliador Freedom. Gere 30 questões de nivelamento de gramática rigorosas, de A1 a C1. 
    REGRAS: 
    1. PROGRESSÃO LINEAR.
    2. EXPLICAÇÕES EM PT-BR.
    3. Muitos exemplos devem ser impessoais (ex: "The water boils at..."). Se precisar de nomes, varie além de Sarah e Mark usando: [${DIVERSE_NAMES.slice(0, 10).join(", ")}].`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      contents: "Gere 30 questões de nivelamento de gramática (A1 a C1).",
      config: { systemInstruction, responseMimeType: "application/json", responseSchema: QUIZ_SCHEMA }
    });
    return JSON.parse(response.text || '{}') as GeneratedContent;
  } catch (error) { throw handleGeminiError(error); }
};

export const generateAdaptivePlacementStep = async (step: Theme, seedLevel: Level): Promise<GeneratedContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    let specificRequirement = "";
    if (step === Theme.Reading) {
      specificRequirement = `Gere um texto impessoal (notícia, relatório, artigo científico, manual) para nível ${seedLevel}. 
      FOCO NO OBJETO E NÃO EM PERSONAGENS. Evite primeira pessoa.`;
    }
    if (step === Theme.Listening) {
      specificRequirement = `Gere um script impessoal (noticiário, anúncio de aeroporto, palestra técnica) para nível ${seedLevel}.`;
    }
    if (step === Theme.Writing) {
      specificRequirement = "Gere um prompt de escrita focado em descrição de processos ou opinião sobre temas globais.";
    }

    const systemInstruction = `Avaliador Freedom. Gere teste de ${step} para nível ${seedLevel}.
    REGRAS:
    1. ${specificRequirement}
    2. Gere 10 questões de múltipla escolha baseadas no contexto.
    3. Use nomes apenas se essencial, variando conforme: [${DIVERSE_NAMES.join(", ")}].
    4. FOCO EM TEXTOS REAIS E IMPESSOAIS.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      contents: `Gere atividade de nivelamento de ${step} focada no nível ${seedLevel}.`,
      config: { systemInstruction, responseMimeType: "application/json", responseSchema: QUIZ_SCHEMA }
    });
    
    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA");
    return JSON.parse(text) as GeneratedContent;
  } catch (error) { 
    console.error("Erro em generateAdaptivePlacementStep:", error);
    throw handleGeminiError(error); 
  }
};

export const generateQuizContent = async (
  level: Level,
  theme: Theme,
  subTopic: string,
  voiceGender: VoiceGender = 'Female',
  voiceAccent: VoiceAccent = 'American'
): Promise<GeneratedContent> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    let systemInstruction = `Professor Freedom. Gere atividade de ${theme} sobre ${subTopic} para nível ${level}.
    Muitos exercícios devem ser factuais, descritivos ou técnicos, sem focar em personagens específicos. 
    Evite o padrão de narrativas pessoais.
    Se nomes forem estritamente necessários, use: [${DIVERSE_NAMES.join(", ")}].`;
    
    let prompt = `Gere 10 questões de ${theme} - ${subTopic} (${level}). Priorize textos objetivos e impessoais.`;

    if (theme === Theme.Reading || theme === Theme.Listening) {
      const genre = TEXT_GENRES[Math.floor(Math.random() * TEXT_GENRES.length)];
      const field = theme === Theme.Reading ? 'readingText' : 'listeningScript';
      
      systemInstruction = `Você é um Professor da Freedom. Crie um conteúdo de ${theme} nível ${level}.
      
      CRÍTICO - IMPESSOALIDADE:
      1. Escolha o gênero: ${genre}.
      2. Foque no tópico "${subTopic}" de forma factual ou institucional.
      3. Use preferencialmente a 3ª pessoa ou voz passiva.
      4. NÃO CRIE HISTÓRIAS DE PERSONAGENS.
      5. Texto no campo '${field}'.
      6. Explicações em PT-BR.`;
      
      prompt = `Gere atividade de ${theme} nível ${level} sobre ${subTopic} no formato de ${genre}. Seja objetivo e evite focar em personagens.`;
    }

    if (theme === Theme.Business) {
      const bizGenres = ["market report", "company memo", "product manual", "financial summary", "industry news", "standard operating procedure"];
      const bizGenre = bizGenres[Math.floor(Math.random() * bizGenres.length)];
      
      systemInstruction = `Você é um Professor de Business English da Freedom.
      Crie um documento corporativo impessoal de nível ${level} sobre "${subTopic}".
      
      REGRAS:
      1. Use o formato: ${bizGenre}.
      2. O texto deve ser formal e sem foco em indivíduos específicos.
      3. Texto no campo 'readingText'. 10 questões de interpretação técnica.`;
      
      prompt = `Gere Business English nível ${level} sobre ${subTopic} no formato de ${bizGenre}. Impessoal e profissional.`;
    }
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      contents: prompt,
      config: { 
        systemInstruction, 
        responseMimeType: "application/json", 
        responseSchema: QUIZ_SCHEMA 
      }
    });
    
    const data = JSON.parse(response.text || '{}') as GeneratedContent;
    data.voiceConfig = { gender: voiceGender, accent: voiceAccent };
    return data;
  } catch (error) { throw handleGeminiError(error); }
};

export const generateAudioFromText = async (text: string, voiceGender: VoiceGender, voiceAccent: VoiceAccent): Promise<string> => {
  const cleanText = text.trim();
  const isSingleWord = cleanText.split(/\s+/).length === 1;
  const cacheKey = `audio_${voiceGender}_${voiceAccent}_${cleanText.toLowerCase()}`;
  
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const selectedVoice = getVoiceName(voiceGender, voiceAccent);
    
    const prompt = isSingleWord 
      ? `Speak word: ${cleanText}` 
      : `Speak with ${voiceAccent} accent: ${cleanText}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts", // Mantemos o de áudio pois é específico para voz
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { 
          voiceConfig: { 
            prebuiltVoiceConfig: { voiceName: selectedVoice } 
          } 
        },
      },
    });
    
    const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    const audioData = audioPart?.inlineData?.data || "";
    
    if (audioData) {
      audioCache.set(cacheKey, audioData);
    }
    
    return audioData;
  } catch (error) { 
    console.warn("TTS generation failed", error);
    return ""; 
  }
};

export const evaluateWritingExercise = async (userText: string, originalPrompt: string, level: Level): Promise<WritingFeedback> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const systemInstruction = `Você é o avaliador de Escrita (Writing) da Freedom. 
    Analise o texto do aluno para o nível ${level}. 
    
    CRITÉRIOS DE PONTUAÇÃO (0-100):
    - Se o texto for muito curto (< 50 caracteres) ou fora de contexto, score < 20.
    - Se for adequado ao nível ${level}, score > 60.
    
    REGRAS PARA annotatedHtml:
    1. Mantenha os erros e forneça a correção IMEDIATAMENTE após.
    2. Use: <span class="error-text">erro</span> <span class="improvement-text">correção</span>.
    
    REGRAS PARA feedback:
    - Escreva em PT-BR. Seja direto e encorajador.`;

    const WRITING_SCHEMA = {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: "Pontuação de 0 a 100" },
        feedback: { type: Type.STRING },
        annotatedHtml: { type: Type.STRING },
        suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        recommendedTopics: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["score", "feedback", "annotatedHtml", "suggestions", "recommendedTopics"]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      contents: `Prompt: ${originalPrompt}\nTexto: ${userText}`,
      config: { systemInstruction, responseMimeType: "application/json", responseSchema: WRITING_SCHEMA }
    });
    
    const result = JSON.parse(response.text || '{}') as WritingFeedback;
    result.score = result.score || 0;
    return result;
  } catch (error) { 
    console.error("Erro na avaliação de escrita:", error);
    return {
      score: 0,
      feedback: "Houve um erro técnico ao processar sua avaliação de escrita. Por favor, tente novamente mais tarde.",
      annotatedHtml: userText,
      suggestions: [],
      recommendedTopics: []
    };
  }
};

export const generateStudyPlan = async (inputs: StudyPlanInput): Promise<StudyPlan> => {
  if (inputs.isChallenge) {
    const startDate = new Date('2026-02-23T00:00:00');
    const endDate = new Date('2026-04-04T00:00:00');
    const totalDays = 41; 
    const weeks: StudyWeek[] = [];
    const themes = [Theme.Grammar, Theme.Vocabulary, Theme.Reading, Theme.Listening, Theme.Writing, 'Speaking'];
    const dailyCount = inputs.dailyAvailability || 1;

    let currentWeek: StudyWeek = { weekNumber: 1, days: [] };
    
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      const themeIndex = i % 6;
      const theme = themes[themeIndex];
      const dayName = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const dateStr = currentDate.toISOString().split('T')[0];

      const tasks: StudyTask[] = [];
      const isSingleTaskTheme = theme === Theme.Writing || theme === 'Speaking';
      const tasksToCreate = isSingleTaskTheme ? 1 : dailyCount;
      
      for (let j = 0; j < tasksToCreate; j++) {
        let description = "";
        let relatedTheme: Theme | undefined = undefined;

        if (theme === 'Speaking') {
            let duration = "15 segundos";
            if (inputs.level === Level.A2) duration = "30 segundos";
            if (inputs.level === Level.B1 || inputs.level === Level.B2) duration = "1 minuto";
            if (inputs.level === Level.C1) duration = "2 minutos";
            
            description = `Easter Challenge Day ${i + 1}: Envie um áudio de ${duration} no grupo do WhatsApp sobre o tema do dia.`;
        } else {
            relatedTheme = theme as Theme;
            const taskLabel = isSingleTaskTheme ? "" : ` (${j + 1}/${dailyCount})`;
            description = `Easter Challenge Day ${i + 1}: Prática de ${theme}${taskLabel}`;
        }

        tasks.push({
            id: crypto.randomUUID(),
            description,
            isCompleted: false,
            relatedTheme,
            date: dateStr
        });
      }

      currentWeek.days.push({
        dayName: `Dia ${i+1} (${dayName})`,
        date: dateStr,
        tasks
      });

      if (currentWeek.days.length === 7 || i === totalDays - 1) {
        weeks.push(currentWeek);
        currentWeek = { weekNumber: weeks.length + 1, days: [] };
      }
    }

    let totalTasks = 0;
    weeks.forEach(w => w.days.forEach(d => totalTasks += d.tasks.length));

    return {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        inputs,
        weeks,
        totalTasks,
        completedTasks: 0,
        isChallenge: true,
        challengeStartDate: '2026-02-23',
        challengeEndDate: '2026-04-04',
        lives: 3
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const systemInstruction = `Você é um Arquiteto de Educação da Freedom. Gere um plano de estudos estruturado para o nível ${inputs.level}.
    O plano deve ter duração de ${inputs.duration} e considerar a disponibilidade de ${inputs.timeAvailable}.
    FOCO PRINCIPAL: ${inputs.focusSkill}.
    
    REGRAS:
    1. O plano deve ser dividido em semanas (weeks).
    2. Cada semana deve ter dias (days) com tarefas (tasks) específicas.
    3. Cada tarefa DEVE ter um 'relatedTheme' válido: [${Object.values(Theme).join(", ")}].
    4. Descrições em Português, focadas e práticas.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      contents: `Gere um plano de estudos completo para nível ${inputs.level}, foco em ${inputs.focusSkill}, duração de ${inputs.duration}.`,
      config: { 
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: STUDY_PLAN_SCHEMA
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("A IA não retornou um plano de estudos válido.");
    
    const result = JSON.parse(jsonText);
    
    let totalTasks = 0;
    if (result.weeks) {
      result.weeks.forEach((w: any) => {
        if (w.days) {
          w.days.forEach((d: any) => {
            if (d.tasks) totalTasks += d.tasks.length;
          });
        }
      });
    }

    return { 
      id: crypto.randomUUID(), 
      createdAt: Date.now(), 
      inputs, 
      weeks: result.weeks || [], 
      totalTasks, 
      completedTasks: 0 
    };
  } catch (error) { throw handleGeminiError(error); }
};

export const chatWithGuide = async (history: ChatMessage[], message: string, userName: string, guide: GuideCharacter): Promise<ChatMessage[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      config: { 
        systemInstruction: `Você é ${guide}, um assistente e professor da plataforma Freedom. Sua personalidade é vibrante, solícita e animada, mas mantendo o profissionalismo de um professor de verdade. Seja divertido e use emojis para incentivar o aluno ${userName}, mas evite ser exageradamente forçado ou repetitivo. Seu objetivo é ajudar com dúvidas gramaticais, vocabulário e dicas de estudo de forma leve e encorajadora.` 
      },
      history: history.map(m => ({ role: m.role, parts: [{ text: m.text }] }))
    });
    const response = await chat.sendMessage({ message });
    return [{ id: crypto.randomUUID(), role: 'model', text: response.text || "..." }];
  } catch (error) { throw handleGeminiError(error); }
};

export const translateWordToPortuguese = async (word: string): Promise<string> => {
  const cleanWord = word.toLowerCase().trim();
  const cacheKey = `trans_lit_${cleanWord}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      contents: `Traduza para português brasileiro. Retorne APENAS a tradução literal, uma única palavra se possível. Não inclua explicações, sinônimos, exemplos ou pontuação. Palavra: "${cleanWord}"`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    const result = response.text?.trim() || "";
    if (result) translationCache.set(cacheKey, result);
    return result;
  } catch { return ""; }
};

export const generateWritingExample = async (prompt: string, level: Level): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 💡 MODELO ATUALIZADO PARA PRODUÇÃO
      contents: `Gere um exemplo de texto perfeito no nível ${level} para: "${prompt}". 
      REGRAS: 
      1. Texto limpo, sem títulos.
      2. Evite focar em personagens; seja descritivo ou argumentativo.
      3. SEM MARKDOWN.`,
    });
    return response.text?.trim() || "";
  } catch { return ""; }
};
