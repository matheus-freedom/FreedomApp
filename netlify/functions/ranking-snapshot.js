// ============================================================
// FREEDOMAPP — Function agendada: ranking-snapshot
// ------------------------------------------------------------
// Roda todo dia às 00:10 de Brasília (03:10 UTC) e manda fechar
// os períodos encerrados. Sem ela, o Hall da Fama só era
// atualizado quando algum aluno praticava depois da virada — numa
// segunda-feira parada, a semana simplesmente nunca fechava.
//
// O horário fica pouco depois da meia-noite justamente para que,
// na segunda de manhã, a escola já encontre o campeão da semana
// registrado.
//
// O trabalho pesado fica na função background, para esta aqui
// terminar em milissegundos.
// ============================================================

const alvo = () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  return base ? `${base}/.netlify/functions/ranking-snapshot-background` : null;
};

exports.handler = async () => {
  const url = alvo();
  if (!url) {
    console.error("ranking-snapshot: URL do site indisponível");
    return { statusCode: 500 };
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowDays: 400 }),
    });
    console.log("ranking-snapshot: apuração diária disparada");
  } catch (e) {
    console.error("ranking-snapshot: falha ao disparar", e);
  }
  return { statusCode: 200 };
};
