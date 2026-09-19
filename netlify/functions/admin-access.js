// ============================================================
// FREEDOMAPP — Function: admin-access
// ------------------------------------------------------------
// Tudo que o ADMINISTRADOR decide sobre a conta de um aluno passa
// por aqui, no SERVIDOR:
//
//   decide        → aprovar / recusar / bloquear / desbloquear
//   setPassword   → definir uma senha provisória para o aluno
//   adjust        → somar/tirar XP e FR$ (sem deixar negativo)
//   setPro        → ligar/desligar o PRO (sem limite diário)
//   setAccessType → acesso completo ou só desafios
//
// POR QUE NO SERVIDOR E NÃO DIRETO DO NAVEGADOR?
// 1) Quem confere "este pedido veio mesmo do admin?" é o servidor,
//    a partir do token de login. No navegador, qualquer aluno com
//    o DevTools aberto poderia chamar a mesma rotina.
// 2) BLOQUEAR de verdade exige desativar a conta no Firebase
//    Authentication — e isso só o Admin SDK (servidor) pode fazer.
//    Com a conta desativada o aluno não consegue mais logar nem
//    renovar a sessão, mesmo que tente burlar a tela do app.
// 3) Trocar a senha de OUTRA pessoa também só existe no Admin SDK.
//    (O botão "Senha" antigo dizia que trocava, mas não fazia nada.)
//
// Cada decisão de acesso fica registrada em `access_log`, para o
// painel mostrar quem foi aprovado/bloqueado, quando e por quem.
// ============================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

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

const isAdminDoc = (u) => !!u && (u.isAdmin === true || String(u.username || "").toLowerCase() === "admin");

// decisão → novo status gravado no documento do aluno
const DECISIONS = {
  approve: "approved",
  unblock: "approved",
  reject: "rejected",
  block: "blocked",
};

// Exposto para os testes (a Netlify só chama exports.handler).
exports._internals = { isAdminDoc, DECISIONS };

exports.handler = async (event) => {
  const headers = buildHeaders(event.headers.origin || "");
  const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { error: "Método não permitido" });
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return reply(500, { error: "Configuração de servidor incompleta." });
  }

  const { db, auth } = initFirebase();

  // ── 1) Quem está chamando? (token de login) ─────────────────
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, { error: "Não autenticado." });
  let callerUid;
  try { callerUid = (await auth.verifyIdToken(token)).uid; }
  catch { return reply(401, { error: "Sessão inválida. Faça login novamente." }); }

  // ── 2) É admin? (lido do banco, nunca do que o navegador diz) ─
  const callerSnap = await db.collection("users").doc(callerUid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!isAdminDoc(caller)) return reply(403, { error: "Só o administrador pode fazer isso." });

  let body;
  try { body = JSON.parse(event.body); } catch { return reply(400, { error: "JSON inválido." }); }
  const { action, userId } = body || {};
  if (typeof userId !== "string" || !userId) return reply(400, { error: "Aluno não informado." });

  const userRef = db.collection("users").doc(userId);
  const targetSnap = await userRef.get();
  if (!targetSnap.exists) return reply(404, { error: "Aluno não encontrado." });
  const target = targetSnap.data();

  try {
    // ── decide: aprovar / recusar / bloquear / desbloquear ─────
    if (action === "decide") {
      const newStatus = DECISIONS[body.decision];
      if (!newStatus) return reply(400, { error: "Decisão inválida." });
      if (userId === callerUid || isAdminDoc(target)) return reply(400, { error: "Não é possível alterar o acesso de um administrador." });

      const now = Date.now();
      const update = { accessStatus: newStatus, accessDecidedAt: now, accessDecidedBy: callerUid };
      if (body.decision === "approve" && ["full", "challenge_only"].includes(body.accessType)) update.accessType = body.accessType;
      if (body.decision === "block") update.blockReason = String(body.reason || "").slice(0, 300);
      await userRef.update(update);

      // Bloqueio/desbloqueio de verdade, no Firebase Authentication.
      // Num try próprio: se a conta de Auth não existir mais, o status
      // no banco (que é o que o app lê) já ficou certo.
      let authSynced = true;
      try {
        if (body.decision === "block") {
          await auth.updateUser(userId, { disabled: true });
          await auth.revokeRefreshTokens(userId); // derruba as sessões abertas
        } else if (body.decision === "unblock" || body.decision === "approve") {
          await auth.updateUser(userId, { disabled: false });
        }
      } catch (e) { authSynced = false; console.error("auth sync:", e); }

      await db.collection("access_log").add({
        userId, fullName: target.fullName || "", username: target.username || "", email: target.email || "",
        decision: body.decision, status: newStatus, reason: update.blockReason || "",
        by: callerUid, byName: caller.fullName || caller.username || "", at: now,
      });
      return reply(200, { ok: true, accessStatus: newStatus, authSynced });
    }

    // ── setPassword: senha provisória ──────────────────────────
    if (action === "setPassword") {
      const password = String(body.password || "");
      if (password.length < 6) return reply(400, { error: "A senha precisa ter pelo menos 6 caracteres." });
      if (isAdminDoc(target) && userId !== callerUid) return reply(400, { error: "Não é possível trocar a senha de outro administrador." });
      await auth.updateUser(userId, { password });
      return reply(200, { ok: true });
    }

    // ── adjust: XP e FR$ ───────────────────────────────────────
    // Transação: lê e grava como uma coisa só, então um exercício
    // concluído no mesmo segundo não é sobrescrito pelo ajuste.
    if (action === "adjust") {
      const xpDelta = Math.trunc(Number(body.xpDelta) || 0);
      const frDelta = Math.round((Number(body.frDelta) || 0) * 100) / 100;
      if (!xpDelta && !frDelta) return reply(400, { error: "Informe um valor para ajustar." });
      if (Math.abs(xpDelta) > 100000 || Math.abs(frDelta) > 100000) return reply(400, { error: "Valor fora do limite." });
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const g = snap.data().gamification || {};
        const xp = Math.max(0, (g.xp || 0) + xpDelta);
        const frBalance = Math.max(0, Math.round(((g.frBalance || 0) + frDelta) * 100) / 100);
        tx.update(userRef, { "gamification.xp": xp, "gamification.frBalance": frBalance });
        return { xp, frBalance };
      });
      return reply(200, { ok: true, ...result });
    }

    if (action === "setPro") {
      await userRef.update({ "gamification.isPro": body.isPro === true });
      return reply(200, { ok: true, isPro: body.isPro === true });
    }

    if (action === "setAccessType") {
      if (!["full", "challenge_only"].includes(body.accessType)) return reply(400, { error: "Tipo de acesso inválido." });
      await userRef.update({ accessType: body.accessType });
      return reply(200, { ok: true, accessType: body.accessType });
    }

    return reply(400, { error: "Ação desconhecida." });
  } catch (e) {
    console.error("admin-access:", e);
    return reply(500, { error: "Não consegui concluir a operação. Tente novamente." });
  }
};
