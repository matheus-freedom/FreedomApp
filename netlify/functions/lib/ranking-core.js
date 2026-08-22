// ============================================================
// FREEDOMAPP — Núcleo de apuração do ranking (Hall da Fama)
// ------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE
//
// Antes, o Top 3 de cada semana/mês era fotografado a partir dos
// contadores que ficam no documento do aluno (weeklyXp/monthlyXp).
// Esses contadores são ZERADOS na virada do período, e a foto só
// era tirada quando algum aluno voltava a praticar. Resultado:
//   • o aluno que disparava a virada aparecia com 0 (ou sumia),
//   • se ninguém praticasse na segunda-feira, a semana nunca era
//     fechada,
//   • quando a foto saía atrasada, ela misturava XP de semanas
//     diferentes (foi o que aconteceu com as semanas 32 e 33).
//
// Aqui a apuração passa a sair da coleção `history`, que guarda
// um registro por atividade com data e XP concedido. É a fonte
// confiável: dá para reapurar qualquer período, a qualquer hora,
// quantas vezes for preciso, sempre com o mesmo resultado.
// ============================================================

// Fuso da escola. O Brasil não tem mais horário de verão desde
// 2019, então o deslocamento fixo é seguro e evita depender da
// configuração de fuso do servidor da Netlify (que roda em UTC).
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

const localParts = (ms) => {
  const d = new Date(ms + TZ_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};

// Semana ISO (segunda a domingo), no horário de Brasília.
const weekKeyOf = (ms) => {
  const p = localParts(ms);
  const d = new Date(Date.UTC(p.y, p.m, p.d));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};

const monthKeyOf = (ms) => {
  const p = localParts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}`;
};

const weekLabelOf = (key) => {
  const [year, week] = key.split("-W");
  return `Semana ${week} • ${year}`;
};
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const monthLabelOf = (key) => {
  const [year, month] = key.split("-");
  return `${MESES[parseInt(month, 10) - 1]} ${year}`;
};
const labelOf = (period, key) => (period === "weekly" ? weekLabelOf(key) : monthLabelOf(key));

// ── Apuração ────────────────────────────────────────────────
// records: [{ userId, date (ms), xpGained }]
// usersById: { [userId]: { username, fullName, profilePhoto } }
// Devolve { weekly: {chave: top3[]}, monthly: {chave: top3[]} }
// contendo APENAS períodos já encerrados e integralmente cobertos
// pela janela de histórico lida (um período recortado pela metade
// daria um pódio falso).
const tallyPodiums = ({ records, usersById, windowStartMs, nowMs }) => {
  const buckets = { weekly: {}, monthly: {} };

  for (const r of records) {
    const date = Number(r.date);
    const xp = Number(r.xpGained) || 0;
    if (!Number.isFinite(date) || !r.userId) continue;
    // Repetição de exercício vale 0 XP e não conta como atividade
    // para efeito de ranking (é prática livre).
    if (xp <= 0) continue;

    const keys = { weekly: weekKeyOf(date), monthly: monthKeyOf(date) };
    for (const period of ["weekly", "monthly"]) {
      const key = keys[period];
      const b = (buckets[period][key] = buckets[period][key] || {});
      const u = (b[r.userId] = b[r.userId] || { xp: 0, activities: 0 });
      u.xp += xp;
      u.activities += 1;
    }
  }

  const limites = {
    weekly: { atual: weekKeyOf(nowMs), primeiroCompleto: weekKeyOf(windowStartMs) },
    monthly: { atual: monthKeyOf(nowMs), primeiroCompleto: monthKeyOf(windowStartMs) },
  };

  const out = { weekly: {}, monthly: {} };
  for (const period of ["weekly", "monthly"]) {
    const { atual, primeiroCompleto } = limites[period];
    for (const [key, porAluno] of Object.entries(buckets[period])) {
      if (key >= atual) continue;              // período ainda em andamento
      if (key <= primeiroCompleto) continue;   // janela pode ter cortado o período

      const top3 = Object.entries(porAluno)
        .map(([userId, v]) => ({ userId, ...v, perfil: usersById[userId] }))
        .filter((e) => e.perfil && String(e.perfil.username || "").toLowerCase() !== "admin")
        .sort((a, b) => b.xp - a.xp || b.activities - a.activities || a.userId.localeCompare(b.userId))
        .slice(0, 3)
        .map((e, i) => ({
          userId: e.userId,
          username: e.perfil.username || "",
          fullName: e.perfil.fullName || e.perfil.username || "",
          profilePhoto: e.perfil.profilePhoto || null,
          xp: e.xp,
          activitiesCount: e.activities,
          position: i + 1,
        }));

      if (top3.length > 0) out[period][key] = top3;
    }
  }
  return out;
};

// ── Início e fim de um período, em horário de Brasília ──────
// Usado para datar o snapshot com o momento em que o período
// realmente fechou (e não com a hora em que a apuração rodou).
// Sem isso, uma reapuração colocaria "Semana 18" com data de hoje
// e bagunçaria a ordem do Hall da Fama.
const DIA_MS = 86400000;
const localMidnightMs = (y, m, d) => Date.UTC(y, m, d) - TZ_OFFSET_MS;

const periodRange = (period, key) => {
  if (period === "monthly") {
    const [y, m] = key.split("-").map(Number);
    return { start: localMidnightMs(y, m - 1, 1), end: localMidnightMs(y, m, 1) - 1 };
  }
  const [y, w] = key.split("-W").map(Number);
  // A semana ISO 1 é a que contém 4 de janeiro.
  const jan4 = Date.UTC(y, 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7;
  const segunda1 = jan4 - (dow - 1) * DIA_MS;
  const start = segunda1 + (w - 1) * 7 * DIA_MS - TZ_OFFSET_MS;
  return { start, end: start + 7 * DIA_MS - 1 };
};

const isoDate = (ms) => {
  const p = localParts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};

// Marca os documentos apurados por este caminho, para distinguir
// dos snapshots antigos (feitos pelos contadores) e poder
// reapurá-los uma única vez.
const SOURCE_TAG = "history";

const snapshotDoc = (period, key, top3) => {
  const { start, end } = periodRange(period, key);
  return {
    id: `${period}_${key}`,
    period,
    label: labelOf(period, key),
    startDate: isoDate(start),
    endDate: isoDate(end),
    top3,
    // Data do FECHAMENTO do período — mantém o Hall em ordem
    // cronológica mesmo quando a apuração acontece depois.
    savedAt: end,
    source: SOURCE_TAG,
  };
};

module.exports = {
  TZ_OFFSET_MS,
  periodRange,
  isoDate,
  weekKeyOf,
  monthKeyOf,
  weekLabelOf,
  monthLabelOf,
  labelOf,
  tallyPodiums,
  snapshotDoc,
  SOURCE_TAG,
};
