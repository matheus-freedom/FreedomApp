// Testes das correções (bugs de agosto). Rode com: node test-fixes.mjs
// Não toca em Firestore nem na IA de verdade: o fetch é simulado.
// Compila o serviço antes de importar, para o teste rodar em qualquer
// checkout limpo (sem depender de nenhum arquivo gerado à mão).
await import('./build-test.mjs');
const { parseDurationToDays, normalizeTheme, parseJsonLoose, VALID_THEMES, generateStudyPlan } = await import('/tmp/gs.mjs');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${extra}`); }
};

console.log('\n== parseDurationToDays ==');
check("'1 Week' = 7", parseDurationToDays('1 Week') === 7);
check("'30 Days' = 30", parseDurationToDays('30 Days') === 30);
check("'60 Days' = 60", parseDurationToDays('60 Days') === 60);
check("'90 Days' = 90", parseDurationToDays('90 Days') === 90);
check("'40 Days' = 40", parseDurationToDays('40 Days') === 40);
check('vazio cai no padrão 30', parseDurationToDays('') === 30);
check('lixo cai no padrão 30', parseDurationToDays('qualquer coisa') === 30);

console.log('\n== normalizeTheme (tema inválido quebraria o botão praticar) ==');
check('Gramática direto', normalizeTheme('Gramática') === 'Gramática');
check('grammar em inglês', normalizeTheme('grammar') === 'Gramática');
check('sem acento', normalizeTheme('gramatica') === 'Gramática');
check('listening', normalizeTheme('listening') === 'Listening');
check('audicao -> Listening', normalizeTheme('audicao') === 'Listening');
check('writing -> Escrita', normalizeTheme('writing') === 'Escrita');
check('leitura -> Reading', normalizeTheme('leitura') === 'Reading');
check('vocabulario -> Vocabulário', normalizeTheme('vocabulario') === 'Vocabulário');
check('desconhecido usa o foco', normalizeTheme('blablabla', 'listening') === 'Listening');
check('desconhecido sem foco vira Gramática', normalizeTheme('blablabla') === 'Gramática');
check('nulo não quebra', normalizeTheme(null) === 'Gramática');
check('todo tema devolvido é válido', ['x', 'reading', null, 42].every(v => VALID_THEMES.includes(normalizeTheme(v))));

console.log('\n== parseJsonLoose (JSON torto da IA) ==');
check('JSON limpo', parseJsonLoose('{"a":1}').a === 1);
check('com cerca de markdown', parseJsonLoose('```json\n{"a":2}\n```').a === 2);
check('com texto em volta', parseJsonLoose('Claro! {"a":3} espero ter ajudado').a === 3);
check('com vírgula sobrando', parseJsonLoose('{"a":4,}').a === 4);
check('array com vírgula sobrando', parseJsonLoose('{"days":[1,2,3,]}').days.length === 3);

// ── Simulação da IA para o plano de estudos ───────────────────────
let callCount = 0;
let maxDaysPerCall = 0;
const makeFetch = (behavior = 'ok') => async (_url, opts) => {
  callCount++;
  const body = JSON.parse(opts.body);
  const sys = body.payload.config.systemInstruction;
  const n = parseInt(sys.match(/Devolva EXATAMENTE (\d+) dias/)[1], 10);
  const perDay = parseInt(sys.match(/EXATAMENTE (\d+) tópicos/)[1], 10);
  maxDaysPerCall = Math.max(maxDaysPerCall, n);

  if (behavior === 'sempre-erro') return { ok: false, json: async () => ({ error: 'boom' }) };

  // 'poucos-dias'   : a IA devolve 3 dias quando foram pedidos 14
  // 'poucos-topicos': devolve 1 tópico por dia quando foram pedidos vários
  const nDays = behavior === 'poucos-dias' ? Math.min(3, n) : n;
  const nTopics = behavior === 'poucos-topicos' ? 1 : perDay;

  const days = Array.from({ length: nDays }, (_, i) => ({
    theme: ['grammar', 'listening', 'Reading', 'INVENTADO'][i % 4],
    topics: Array.from({ length: nTopics }, (_, j) => `topico-${callCount}-${i}-${j}`),
  }));

  let text = JSON.stringify({ days });
  if (behavior === 'json-torto') text = '```json\n' + text.slice(0, -1) + ',}\n```';
  return { ok: true, json: async () => ({ text }) };
};

const countTasks = (plan) => plan.weeks.reduce((a, w) => a + w.days.reduce((b, d) => b + d.tasks.length, 0), 0);
const allTasks = (plan) => plan.weeks.flatMap(w => w.days.flatMap(d => d.tasks));

console.log('\n== Plano de estudos: o caso que quebrava (90 dias x 8) ==');
globalThis.fetch = makeFetch();
callCount = 0; maxDaysPerCall = 0;
const progress = [];
const big = await generateStudyPlan(
  { level: 'B1', timeAvailable: '40 min/dia', dailyAvailability: 8, focusSkill: 'Custom', customFocus: 'inglês para entrevistas de emprego', duration: '90 Days' },
  (m) => progress.push(m)
);
check('90 dias gerados', big.weeks.reduce((a, w) => a + w.days.length, 0) === 90);
check('720 tarefas montadas', countTasks(big) === 720, `(veio ${countTasks(big)})`);
check('totalTasks confere', big.totalTasks === 720);
check('nenhuma chamada pediu mais de 14 dias', maxDaysPerCall <= 14, `(máx ${maxDaysPerCall})`);
check('quebrou em 7 chamadas', callCount === 7, `(foram ${callCount})`);
check('mostrou progresso ao aluno', progress.length >= 7);
check('13 semanas', big.weeks.length === 13, `(veio ${big.weeks.length})`);
check('toda tarefa tem tema válido', allTasks(big).every(t => VALID_THEMES.includes(t.relatedTheme)));
check('toda tarefa tem id único', new Set(allTasks(big).map(t => t.id)).size === 720);
check('toda tarefa tem data', allTasks(big).every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date)));
check('nenhuma tarefa nasce concluída', allTasks(big).every(t => t.isCompleted === false));
const dup = allTasks(big).map(t => `${t.relatedTheme}|${t.description.toLowerCase()}`);
check('nenhum tópico repetido (senão o 2º daria 0 XP)', new Set(dup).size === dup.length,
  `(${dup.length - new Set(dup).size} repetidos)`);
check('dias em sequência de datas', (() => {
  const ds = big.weeks.flatMap(w => w.days.map(d => d.date));
  return ds.every((d, i) => i === 0 || new Date(d) - new Date(ds[i - 1]) === 86400000);
})());

console.log('\n== Plano curto (1 semana, 1 exercício/dia) ==');
callCount = 0;
const small = await generateStudyPlan(
  { level: 'A1', timeAvailable: '5 min/dia', dailyAvailability: 1, focusSkill: 'General English', duration: '1 Week' },
  () => {}
);
check('7 dias', small.weeks.reduce((a, w) => a + w.days.length, 0) === 7);
check('7 tarefas', countTasks(small) === 7);
check('1 chamada só', callCount === 1);
check('1 semana', small.weeks.length === 1);

console.log('\n== A IA devolve JSON torto: o plano ainda sai ==');
globalThis.fetch = makeFetch('json-torto');
const torto = await generateStudyPlan(
  { level: 'A2', timeAvailable: '10 min/dia', dailyAvailability: 2, focusSkill: 'Grammar', duration: '30 Days' },
  () => {}
);
check('30 dias mesmo com JSON torto', torto.weeks.reduce((a, w) => a + w.days.length, 0) === 30);
check('60 tarefas', countTasks(torto) === 60);

console.log('\n== A IA falha sempre: erro claro, sem plano vazio ==');
globalThis.fetch = makeFetch('sempre-erro');
let erro = null;
try {
  await generateStudyPlan({ level: 'A1', timeAvailable: '5 min', dailyAvailability: 1, focusSkill: 'Grammar', duration: '1 Week' }, () => {});
} catch (e) { erro = e; }
check('lançou erro em vez de devolver plano vazio', erro !== null);
check('mensagem é legível para o aluno', erro && typeof erro.message === 'string' && erro.message.length > 10, erro?.message);

console.log('\n== IA devolve MENOS dias que o pedido (não pode clonar o dia 1) ==');
globalThis.fetch = makeFetch('poucos-dias');
const poucos = await generateStudyPlan(
  { level: 'B1', timeAvailable: '20 min/dia', dailyAvailability: 2, focusSkill: 'Reading', duration: '30 Days' },
  () => {}
);
check('30 dias completos mesmo assim', poucos.weeks.reduce((a, w) => a + w.days.length, 0) === 30);
{
  const t = allTasks(poucos);
  const chaves = t.map(x => `${x.relatedTheme}|${x.description.toLowerCase()}`);
  check('nenhuma tarefa duplicada', new Set(chaves).size === chaves.length, `(${chaves.length - new Set(chaves).size} repetidas)`);
  // O bug era completar o bloco repetindo SEMPRE o primeiro dia: os
  // temas dos dias faltantes ficariam todos iguais ao do dia 1.
  // A IA devolveu 3 dias (temas: Gramática, Listening, Reading) para um
  // bloco de 14. Ciclando, o 4º dia repete o 1º, o 5º repete o 2º e
  // assim por diante. Clonando (o bug), TODOS os dias faltantes ficam
  // com o tema do 1º dia. O 5º dia é o que separa os dois casos.
  const temasDoBloco = poucos.weeks.flatMap(w => w.days).slice(0, 14).map(d => d.tasks[0]?.relatedTheme);
  check('o 5º dia repete o 2º (ciclo), não o 1º (clone)',
    temasDoBloco[4] === temasDoBloco[1] && temasDoBloco[4] !== temasDoBloco[0],
    `(dia1=${temasDoBloco[0]} dia2=${temasDoBloco[1]} dia5=${temasDoBloco[4]})`);
  const repeticoesDoDia1 = temasDoBloco.filter(t => t === temasDoBloco[0]).length;
  check('o tema do 1º dia não domina o bloco', repeticoesDoDia1 <= 6, `(apareceu ${repeticoesDoDia1}x em 14 dias)`);
}

console.log('\n== IA devolve MENOS tópicos que exercícios/dia ==');
globalThis.fetch = makeFetch('poucos-topicos');
const escassos = await generateStudyPlan(
  { level: 'A2', timeAvailable: '40 min/dia', dailyAvailability: 8, focusSkill: 'Grammar', duration: '1 Week' },
  () => {}
);
check('56 tarefas (7 dias x 8)', countTasks(escassos) === 56, `(veio ${countTasks(escassos)})`);
{
  const t = allTasks(escassos);
  const chaves = t.map(x => `${x.relatedTheme}|${x.description.toLowerCase()}`);
  check('todas as 56 são distintas (senão dariam 0 XP)', new Set(chaves).size === 56,
    `(distintas: ${new Set(chaves).size})`);
  check('nenhuma descrição vazia', t.every(x => x.description.trim().length > 0));
}

console.log('\n== Modo Challenge continua intacto ==');
const ch = await generateStudyPlan({ level: 'A1', timeAvailable: '30 min', dailyAvailability: 1, focusSkill: 'Challenge Mode', duration: '40 Days', isChallenge: true }, () => {});
check('challenge tem 41 dias', ch.weeks.reduce((a, w) => a + w.days.length, 0) === 41);
check('challenge marcado', ch.isChallenge === true);
check('challenge com 3 vidas', ch.lives === 3);

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail === 0 ? 0 : 1);
