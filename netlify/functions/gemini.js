const { GoogleGenAI, Modality } = require("@google/genai");

const ALLOWED_ORIGINS = [
  "https://freedom.app.br",
  "https://www.freedom.app.br",
  "http://localhost:3000",
  "http://localhost:5173",
];

const buildHeaders = (origin) => {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
};

exports.handler = async (event) => {
  const origin = event.headers.origin || "";
  const headers = buildHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Configuração de servidor incompleta." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido." }) };
  }

  const { action, payload } = body;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    if (action === "generateContent") {
      const { model, contents, config } = payload;
      const response = await ai.models.generateContent({ model, contents, config });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: response.text }),
      };
    }

    if (action === "generateAudio") {
      const { text, voiceName } = payload;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });
      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ audioData: audioPart?.inlineData?.data || "" }),
      };
    }

    if (action === "chat") {
      const { systemInstruction, history, message, model } = payload;
      const chat = ai.chats.create({
        model: model || "gemini-3.5-flash",
        config: { systemInstruction },
        history: history || [],
      });
      const response = await chat.sendMessage({ message });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: response.text }),
      };
    }

    if (action === "translate") {
      const { word } = payload;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Traduza para português brasileiro. Retorne APENAS a tradução literal, uma única palavra se possível. Não inclua explicações. Palavra: "${word}"`,
        config: { thinkingConfig: { thinkingBudget: 0 } },
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ text: response.text?.trim() || "" }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Ação desconhecida: ${action}` }),
    };

  } catch (error) {
    console.error("Erro na função Gemini:", error);
    const msg = error?.message || "";
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: "Limite de requisições atingido. Aguarde um momento." }),
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Erro ao processar requisição com a IA." }),
    };
  }
};
