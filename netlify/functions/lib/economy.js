// ============================================================
// FREEDOMAPP — lib/economy
// ------------------------------------------------------------
// Como o servidor credita XP e FR$ no documento do aluno. Antes
// isto morava dentro do duel.js; saiu para cá quando a aba Games
// ganhou jogos novos (Quiz Party e Draw It!), para que TODOS os
// jogos usem exatamente a mesma regra de virada de semana/mês/ano
// do ranking — se cada jogo tivesse a sua cópia, bastaria uma
// delas ficar desatualizada para o Hall da Fama contar errado.
// ============================================================

const { weekKeyOf, monthKeyOf } = require("./ranking-core");

const round2 = (n) => Math.round(n * 100) / 100;

// Ano no fuso de São Paulo (mesma convenção do award-activity).
const yearKeyOf = (ms) => `${new Date(ms - 3 * 3600000).getUTCFullYear()}`;

// Soma XP e FR$ no objeto `user` (o documento já lido). Zera os
// contadores de semana/mês/ano quando o período virou.
const addXpFr = (user, xp, fr, now) => {
  const g = user.gamification || (user.gamification = {});
  const wk = weekKeyOf(now), mk = monthKeyOf(now), yk = yearKeyOf(now);
  if (g.lastWeekKey && g.lastWeekKey !== wk) { g.weeklyXp = 0; g.weeklyActivities = 0; }
  if (g.lastMonthKey && g.lastMonthKey !== mk) { g.monthlyXp = 0; g.monthlyActivities = 0; }
  if (g.lastYearKey && g.lastYearKey !== yk) { g.yearlyXp = 0; }
  g.lastWeekKey = wk; g.lastMonthKey = mk; g.lastYearKey = yk;
  g.xp = (g.xp || 0) + xp;
  g.weeklyXp = (g.weeklyXp || 0) + xp;
  g.monthlyXp = (g.monthlyXp || 0) + xp;
  g.yearlyXp = (g.yearlyXp || 0) + xp;
  g.frBalance = round2((g.frBalance || 0) + fr);
};

const addFr = (user, fr) => {
  const g = user.gamification || (user.gamification = {});
  g.frBalance = round2((g.frBalance || 0) + fr);
};

// Cópia da regra do award-activity: XP ganho soma nas Ligas em
// Grupo ativas de que o aluno participa.
const updateLeagueChallenges = async (db, uid, xp) => {
  if (xp <= 0) return;
  const snap = await db.collection("challenges").where("participantIds", "array-contains", uid).get();
  const now = Date.now();
  for (const doc of snap.docs) {
    const c = doc.data();
    if (c.status !== "active" || now > c.endDate) continue;
    if (!c.participantStats) c.participantStats = {};
    if (!c.participantStats[uid]) c.participantStats[uid] = { xpGained: 0, activitiesDone: 0 };
    c.participantStats[uid].xpGained += xp;
    c.participantStats[uid].activitiesDone += 1;
    await doc.ref.set(c);
  }
};

module.exports = { round2, yearKeyOf, addXpFr, addFr, updateLeagueChallenges };
