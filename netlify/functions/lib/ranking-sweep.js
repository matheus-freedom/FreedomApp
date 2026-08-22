// ============================================================
// FREEDOMAPP — Fechamento do ranking (alimenta o Hall da Fama)
// ------------------------------------------------------------
// Lê o histórico de atividades, apura o Top 3 de cada semana e de
// cada mês JÁ ENCERRADOS e grava/corrige os documentos da coleção
// `ranking_snapshots`.
//
// É idempotente: rodar duas vezes seguidas produz exatamente o
// mesmo resultado e não reescreve o que já está certo. Por isso
// pode ser chamada tanto pela rotina diária quanto no fim de uma
// atividade, sem risco de duplicar prêmio ou aviso.
// ============================================================

const { randomUUID } = require("crypto");
const { tallyPodiums, snapshotDoc, labelOf, SOURCE_TAG } = require("./ranking-core");

const DIA_MS = 86400000;

const getCongratulationsMessage = (position, weekLabel, xp) => {
  const xpFormatted = Number(xp).toLocaleString("pt-BR");
  if (position === 1) return `🏆 Você foi o CAMPEÃO da ${weekLabel}! Incrível — você acumulou ${xpFormatted} XP e liderou todos os alunos da Freedom. Sua dedicação é inspiradora. Continue assim e conquiste mais uma semana no topo! 🚀`;
  if (position === 2) return `🥈 Parabéns! Você ficou em 2º lugar na ${weekLabel}, acumulando ${xpFormatted} XP. Você foi incrível essa semana! Está muito perto do topo — mais uma semana de foco e a coroa é sua! 💪`;
  return `🥉 Que semana fantástica! Você ficou em 3º lugar na ${weekLabel} com ${xpFormatted} XP. Seu esforço está valendo a pena — continue praticando e logo você estará no topo do ranking! ⭐`;
};

const mesmoPodio = (a = [], b = []) =>
  a.length === b.length &&
  a.every((e, i) => e.userId === b[i].userId && Number(e.xp) === Number(b[i].xp) && Number(e.activitiesCount) === Number(b[i].activitiesCount));

const sweepRanking = async (db, opts = {}) => {
  const nowMs = opts.nowMs || Date.now();
  const windowDays = opts.windowDays || 400;
  const windowStartMs = nowMs - windowDays * DIA_MS;

  // 1) Histórico da janela — fonte confiável do XP concedido.
  const histSnap = await db.collection("history").where("date", ">=", windowStartMs).get();
  const records = histSnap.docs.map((d) => d.data());

  // 2) Snapshots já existentes, lidos de uma vez só.
  const snapsSnap = await db.collection("ranking_snapshots").get();
  const existentes = {};
  snapsSnap.docs.forEach((d) => { existentes[d.id] = d.data() || {}; });

  // 3) Perfis (nome e foto exibidos no pódio).
  const usersById = {};
  // Rede de segurança: um aluno que saiu da escola some da coleção
  // `users`, mas não pode sumir do Hall da Fama — a conquista dele
  // é histórica. Recuperamos o nome do próprio snapshot antigo.
  Object.values(existentes).forEach((snap) => {
    (snap.top3 || []).forEach((e) => {
      if (e && e.userId) usersById[e.userId] = { username: e.username, fullName: e.fullName, profilePhoto: e.profilePhoto };
    });
  });
  const usersSnap = await db.collection("users").get();
  usersSnap.docs.forEach((d) => {
    const u = d.data() || {};
    usersById[u.userId || d.id] = u; // o perfil atual sempre vence
  });

  const podiums = tallyPodiums({ records, usersById, windowStartMs, nowMs });

  // 4) Grava só o que mudou.
  const criados = [];
  const corrigidos = [];
  for (const period of ["weekly", "monthly"]) {
    for (const [key, top3] of Object.entries(podiums[period])) {
      const docData = snapshotDoc(period, key, top3);
      const antigo = existentes[docData.id];
      if (antigo) {
        if (antigo.source === SOURCE_TAG && mesmoPodio(antigo.top3, top3)) continue;
        await db.collection("ranking_snapshots").doc(docData.id).set(docData);
        corrigidos.push(docData.id);
      } else {
        await db.collection("ranking_snapshots").doc(docData.id).set(docData);
        criados.push(docData.id);
      }
    }
  }

  // 5) Coroa + aviso ao Top 3 — apenas na semana recém-encerrada e
  //    apenas quando o snapshot é NOVO. Reapurações de semanas
  //    antigas não reenviam avisos (os alunos já foram avisados).
  const semanas = Object.keys(podiums.weekly).sort();
  const ultimaSemana = semanas[semanas.length - 1];
  let avisados = 0;
  if (opts.notify !== false && ultimaSemana && criados.includes(`weekly_${ultimaSemana}`)) {
    const label = labelOf("weekly", ultimaSemana);
    for (const entry of podiums.weekly[ultimaSemana]) {
      try {
        const uRef = db.collection("users").doc(entry.userId);
        const uSnap = await uRef.get();
        if (!uSnap.exists) continue;
        const u = uSnap.data();
        u.gamification = u.gamification || {};
        u.gamification.weeklyBadge = { position: entry.position, weekLabel: label, xp: entry.xp, awardedAt: Date.now() };
        if (!u.notifications) u.notifications = [];
        u.notifications.unshift({
          id: randomUUID(),
          message: getCongratulationsMessage(entry.position, label, entry.xp),
          date: Date.now(),
          read: false,
          sender: "🏆 Freedom Ranking",
        });
        await uRef.set(u);
        avisados++;
      } catch (e) {
        console.error("Erro ao avisar Top 3:", e);
      }
    }
  }

  return {
    registrosLidos: records.length,
    criados,
    corrigidos,
    avisados,
    ultimaSemana: ultimaSemana || null,
  };
};

module.exports = { sweepRanking, getCongratulationsMessage, mesmoPodio };
