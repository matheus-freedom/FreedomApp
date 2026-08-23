// ============================================================
// FREEDOMAPP — lib/journey-sign
// ------------------------------------------------------------
// Assinatura interna entre functions.
//
// A journey-audio-background é uma Background Function: a Netlify
// a expõe numa URL pública e ela não recebe login de aluno nenhum
// (quem a chama é outra function, não o navegador). Sem trava,
// qualquer pessoa na internet poderia disparar geração de áudio —
// que é uma chamada de IA paga — em looping.
//
// A solução aqui não exige configurar NADA novo na Netlify: a
// chave é a própria credencial do Firebase, que já é secreta e já
// está no ambiente das functions. Quem não a tem não consegue
// forjar a assinatura.
// ============================================================

const { createHmac, timingSafeEqual } = require("crypto");

const secret = () =>
  process.env.FIREBASE_PRIVATE_KEY || process.env.GEMINI_API_KEY || "";

const signBankId = (bankId) =>
  createHmac("sha256", secret()).update(`journey-audio:${bankId}`).digest("hex");

// Comparação em tempo constante: comparar com === vazaria, pelo
// tempo de resposta, quantos caracteres iniciais estavam certos.
const verifyBankId = (bankId, signature) => {
  if (!secret() || typeof signature !== "string") return false;
  const expected = Buffer.from(signBankId(bankId), "utf8");
  const got = Buffer.from(signature, "utf8");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
};

module.exports = { signBankId, verifyBankId };
