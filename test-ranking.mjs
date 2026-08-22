// Testes do fechamento do ranking (Hall da Fama), com Firestore falso.
// Rode com: node test-ranking.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const core = require('./netlify/functions/lib/ranking-core.js');
const { sweepRanking, mesmoPodio } = require('./netlify/functions/lib/ranking-sweep.js');
const { weekKeyOf, monthKeyOf, periodRange, tallyPodiums, snapshotDoc, SOURCE_TAG, isoDate } = core;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${extra}`); }
};

// Horário de Brasília = UTC-3
const brt = (iso) => new Date(`${iso}-03:00`).getTime();
const DIA = 86400000;

console.log('\n== Chaves de período no horário de Brasília ==');
{
  check('domingo 22h ainda é a semana que termina', weekKeyOf(brt('2026-08-16T22:00:00')) === '2026-W33', weekKeyOf(brt('2026-08-16T22:00:00')));
  check('segunda 00h01 já é a semana seguinte', weekKeyOf(brt('2026-08-17T00:01:00')) === '2026-W34', weekKeyOf(brt('2026-08-17T00:01:00')));
  check('dia 31 às 23h ainda é o mês que termina', monthKeyOf(brt('2026-07-31T23:00:00')) === '2026-07', monthKeyOf(brt('2026-07-31T23:00:00')));
  check('dia 1º às 00h30 já é o mês novo', monthKeyOf(brt('2026-08-01T00:30:00')) === '2026-08', monthKeyOf(brt('2026-08-01T00:30:00')));
  // Era exatamente aqui que o servidor (que rodava em UTC) errava:
  // domingo 21h30 em Brasília já é segunda em UTC.
  check('domingo 21h30 NÃO vira semana nova (bug do fuso)', weekKeyOf(brt('2026-08-16T21:30:00')) === '2026-W33');
}

console.log('\n== Início e fim de cada período ==');
{
  for (const chave of ['2026-W01', '2026-W33', '2026-W53', '2027-W01']) {
    const { start, end } = periodRange('weekly', chave);
    check(`${chave}: começa e termina dentro da própria semana`, weekKeyOf(start) === chave && weekKeyOf(end) === chave, `${weekKeyOf(start)}..${weekKeyOf(end)}`);
    check(`${chave}: dura 7 dias`, end - start === 7 * DIA - 1);
  }
  for (const chave of ['2026-01', '2026-02', '2026-08', '2026-12']) {
    const { start, end } = periodRange('monthly', chave);
    check(`${chave}: começa e termina dentro do próprio mês`, monthKeyOf(start) === chave && monthKeyOf(end) === chave);
  }
  check('semana 33 começa na segunda, 17/08? não — 10/08', isoDate(periodRange('weekly', '2026-W33').start) === '2026-08-10', isoDate(periodRange('weekly', '2026-W33').start));
  check('semana 33 termina no domingo 16/08', isoDate(periodRange('weekly', '2026-W33').end) === '2026-08-16');
  check('fevereiro de 2026 termina no dia 28', isoDate(periodRange('monthly', '2026-02').end) === '2026-02-28');
}

console.log('\n== Apuração do Top 3 a partir do histórico ==');
const perfis = {
  u1: { username: '@ana', fullName: 'Ana' },
  u2: { username: '@bruno', fullName: 'Bruno' },
  u3: { username: '@caio', fullName: 'Caio' },
  u4: { username: '@duda', fullName: 'Duda' },
  adm: { username: 'admin', fullName: 'Freedom Administrator' },
};
const reg = (userId, iso, xpGained) => ({ userId, date: brt(iso), xpGained });
{
  const records = [
    // Semana 33 (10 a 16 de agosto)
    reg('u1', '2026-08-11T10:00:00', 100), reg('u1', '2026-08-12T10:00:00', 100),
    reg('u2', '2026-08-11T10:00:00', 150),
    reg('u3', '2026-08-13T10:00:00', 90), reg('u3', '2026-08-14T10:00:00', 60),
    reg('u4', '2026-08-15T10:00:00', 50),
    reg('adm', '2026-08-15T10:00:00', 9999),
    // Repetição de exercício: 0 XP, não pode contar como atividade
    reg('u4', '2026-08-15T11:00:00', 0),
    // Semana 34 (em andamento na data de "hoje")
    reg('u4', '2026-08-18T10:00:00', 800),
  ];
  const hoje = brt('2026-08-22T12:00:00');
  const r = tallyPodiums({ records, usersById: perfis, windowStartMs: brt('2026-07-01T00:00:00'), nowMs: hoje });

  const w33 = r.weekly['2026-W33'];
  check('semana encerrada foi apurada', !!w33);
  check('1º lugar é quem somou mais XP', w33[0].userId === 'u1' && w33[0].xp === 200, JSON.stringify(w33?.[0]));
  check('empate em XP desempata por nº de atividades', w33[1].userId === 'u3' && w33[1].activitiesCount === 2, JSON.stringify(w33?.[1]));
  check('3º lugar correto', w33[2].userId === 'u2' && w33[2].xp === 150);
  check('pódio tem no máximo 3', w33.length === 3);
  check('admin fica fora do pódio', !w33.some(e => e.userId === 'adm'));
  check('posições numeradas de 1 a 3', w33.map(e => e.position).join('') === '123');
  check('repetição (0 XP) não conta como atividade', !w33.some(e => e.userId === 'u4'));
  check('semana em andamento NÃO é fechada', r.weekly['2026-W34'] === undefined);
  check('mês em andamento NÃO é fechado', r.monthly['2026-08'] === undefined);
}

console.log('\n== A janela de leitura não pode gerar pódio pela metade ==');
{
  // Janela começa no meio da semana 33: essa semana está incompleta,
  // então não pode virar snapshot (daria um campeão falso).
  const records = [reg('u1', '2026-08-13T10:00:00', 100), reg('u2', '2026-08-14T10:00:00', 500)];
  const r = tallyPodiums({ records, usersById: perfis, windowStartMs: brt('2026-08-12T00:00:00'), nowMs: brt('2026-08-22T12:00:00') });
  check('semana cortada pela janela é ignorada', r.weekly['2026-W33'] === undefined);
  check('mês cortado pela janela é ignorado', r.monthly['2026-08'] === undefined);
}

console.log('\n== Documento do snapshot ==');
{
  const d = snapshotDoc('weekly', '2026-W33', [{ userId: 'u1', username: '@ana', fullName: 'Ana', profilePhoto: null, xp: 200, activitiesCount: 2, position: 1 }]);
  check('id previsível', d.id === 'weekly_2026-W33');
  check('rótulo legível', d.label === 'Semana 33 • 2026', d.label);
  check('datas reais do período', d.startDate === '2026-08-10' && d.endDate === '2026-08-16', `${d.startDate}..${d.endDate}`);
  check('data do snapshot é o fechamento, não a hora da apuração', d.savedAt === periodRange('weekly', '2026-W33').end);
  check('marcado como apurado pelo histórico', d.source === SOURCE_TAG);
  const m = snapshotDoc('monthly', '2026-07', []);
  check('rótulo do mês em português', m.label === 'Julho 2026', m.label);
  // Ordenar por savedAt tem de dar ordem cronológica de verdade
  const a = snapshotDoc('weekly', '2026-W32', []), b = snapshotDoc('weekly', '2026-W33', []);
  check('semana 33 é mais recente que a 32 na ordenação', b.savedAt > a.savedAt);
}

// ── Firestore falso ────────────────────────────────────────────
const makeDb = (seed = {}) => {
  const data = JSON.parse(JSON.stringify(seed));
  const col = (name) => (data[name] = data[name] || {});
  const docApi = (name, id) => ({
    async get() { const v = col(name)[id]; return { exists: v !== undefined, id, data: () => v }; },
    async set(v, opts) { col(name)[id] = opts && opts.merge ? { ...(col(name)[id] || {}), ...v } : v; },
  });
  return {
    _data: data,
    collection(name) {
      const todos = () => Object.entries(col(name)).map(([id, v]) => ({ id, data: () => v }));
      const api = {
        doc: (id) => docApi(name, id),
        async get() { return { docs: todos() }; },
        where(campo, op, valor) {
          return { async get() { return { docs: todos().filter(d => op === '>=' ? Number(d.data()[campo]) >= valor : d.data()[campo] === valor) }; } };
        },
      };
      return api;
    },
  };
};

console.log('\n== Fechamento completo (sweepRanking) ==');
{
  const history = {};
  const add = (id, userId, iso, xp) => { history[id] = { id, userId, date: brt(iso), xpGained: xp }; };
  add('h1', 'u1', '2026-08-11T10:00:00', 200);
  add('h2', 'u2', '2026-08-12T10:00:00', 150);
  add('h3', 'u3', '2026-08-13T10:00:00', 100);
  add('h4', 'u1', '2026-08-19T10:00:00', 300); // semana 34, ainda aberta

  const users = {
    u1: { userId: 'u1', ...perfis.u1 }, u2: { userId: 'u2', ...perfis.u2 }, u3: { userId: 'u3', ...perfis.u3 },
  };
  const db = makeDb({ history, users });
  const hoje = brt('2026-08-22T12:00:00');

  const r1 = await sweepRanking(db, { nowMs: hoje, windowDays: 60 });
  check('criou o snapshot da semana encerrada', r1.criados.includes('weekly_2026-W33'), JSON.stringify(r1.criados));
  check('não criou snapshot da semana em andamento', !r1.criados.includes('weekly_2026-W34'));
  check('gravou o pódio certo', db._data.ranking_snapshots['weekly_2026-W33'].top3[0].userId === 'u1');
  check('avisou os 3 do pódio da semana nova', r1.avisados === 3, String(r1.avisados));
  check('coroa entregue ao campeão', db._data.users.u1.gamification.weeklyBadge.position === 1);
  check('aviso na caixa do campeão', db._data.users.u1.notifications[0].message.includes('CAMPEÃO'));

  const r2 = await sweepRanking(db, { nowMs: hoje, windowDays: 60 });
  check('rodar de novo não reescreve nada', r2.criados.length === 0 && r2.corrigidos.length === 0);
  check('rodar de novo NÃO reenvia aviso', r2.avisados === 0);
  check('não duplicou aviso na caixa', db._data.users.u1.notifications.length === 1);
}

console.log('\n== Corrige snapshots antigos feitos pelos contadores ==');
{
  const history = {
    h1: { userId: 'u1', date: brt('2026-08-11T10:00:00'), xpGained: 200 },
    h2: { userId: 'u2', date: brt('2026-08-12T10:00:00'), xpGained: 150 },
  };
  const users = { u1: { userId: 'u1', ...perfis.u1 }, u2: { userId: 'u2', ...perfis.u2 } };
  // Snapshot antigo, com o campeão errado e sem a marca de origem
  const ranking_snapshots = {
    'weekly_2026-W33': { id: 'weekly_2026-W33', period: 'weekly', label: 'Semana 33 • 2026', top3: [{ userId: 'u2', xp: 9999, activitiesCount: 1, position: 1 }], savedAt: 1, source: undefined },
  };
  const db = makeDb({ history, users, ranking_snapshots });
  const r = await sweepRanking(db, { nowMs: brt('2026-08-22T12:00:00'), windowDays: 60 });
  check('reapurou o snapshot antigo', r.corrigidos.includes('weekly_2026-W33'), JSON.stringify(r));
  check('campeão corrigido', db._data.ranking_snapshots['weekly_2026-W33'].top3[0].userId === 'u1');
  check('reapuração NÃO reenvia aviso a semana já anunciada', r.avisados === 0);
}

console.log('\n== Aluno que saiu da escola não some do Hall da Fama ==');
{
  const history = {
    h1: { userId: 'exaluno', date: brt('2026-08-11T10:00:00'), xpGained: 500 },
    h2: { userId: 'u1', date: brt('2026-08-12T10:00:00'), xpGained: 100 },
  };
  const users = { u1: { userId: 'u1', ...perfis.u1 } }; // 'exaluno' não existe mais
  const ranking_snapshots = {
    'weekly_2026-W33': { id: 'weekly_2026-W33', period: 'weekly', top3: [{ userId: 'exaluno', username: '@erica', fullName: 'Erica Souza', xp: 1, activitiesCount: 1, position: 1 }], savedAt: 1 },
  };
  const db = makeDb({ history, users, ranking_snapshots });
  const r = await sweepRanking(db, { nowMs: brt('2026-08-22T12:00:00'), windowDays: 60 });
  const podio = db._data.ranking_snapshots['weekly_2026-W33'].top3;
  check('ex-aluno continua no pódio', podio[0].userId === 'exaluno', JSON.stringify(podio));
  check('nome dele foi preservado', podio[0].fullName === 'Erica Souza');
  check('XP dele foi reapurado pelo histórico', podio[0].xp === 500);
  check('sem aviso para semana já anunciada', r.avisados === 0);
}

console.log('\n== Comparação de pódios (usada para não reescrever à toa) ==');
{
  const a = [{ userId: 'x', xp: 10, activitiesCount: 1 }];
  check('pódios iguais', mesmoPodio(a, [{ userId: 'x', xp: 10, activitiesCount: 1 }]));
  check('XP diferente muda', !mesmoPodio(a, [{ userId: 'x', xp: 11, activitiesCount: 1 }]));
  check('aluno diferente muda', !mesmoPodio(a, [{ userId: 'y', xp: 10, activitiesCount: 1 }]));
  check('tamanho diferente muda', !mesmoPodio(a, []));
}

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail === 0 ? 0 : 1);
