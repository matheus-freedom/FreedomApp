// ============================================================
// Testes do "Fred explica" (sem rede, sem IA).
// Roda com:  node test-fred.mjs
//
// Geração REAL (gasta 1 chamada de IA, precisa de GEMINI_API_KEY):
//   GEMINI_API_KEY=... node test-fred.mjs --live "A1_verbo-to-be-presente"
// ============================================================

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);

const core = require('./netlify/functions/lib/fred-core.js');
const sign = require('./netlify/functions/lib/journey-sign.js');
const bg = require('./netlify/functions/fred-explains-background.js')._internals;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n── Catálogo ──');
check('Catálogo tem os 117 temas do currículo (A1→C1)', core.CATALOG.length === 117, `(${core.CATALOG.length})`);
check('Ids são únicos', new Set(core.CATALOG.map(c => c.id)).size === core.CATALOG.length);
check('Slug tira acento e símbolos', core.slugify('In, On, At (preposições)') === 'in-on-at-preposicoes', core.slugify('In, On, At (preposições)'));
check('Slug trata "&"', core.slugify('Do & Make') === 'do-e-make', core.slugify('Do & Make'));
check('Mesmo tema em níveis diferentes vira ids diferentes',
  core.lessonId('A1', 'Present Continuous') !== core.lessonId('B1', 'Present Continuous'));
check('resolveLesson aceita id', core.resolveLesson({ id: 'A1_verbo-to-be-presente' })?.topic === 'Verbo to be (presente)');
check('resolveLesson aceita nível + tema', core.resolveLesson({ level: 'B2', topic: 'Passive Voice' })?.id === 'B2_passive-voice');
check('resolveLesson rejeita tema inventado', core.resolveLesson({ level: 'A1', topic: 'Subjuntivo' }) === null);
check('resolveLesson rejeita id fora do catálogo', core.resolveLesson({ id: 'Z9_nada' }) === null);

console.log('\n── Paridade front (fredExplains.ts) x servidor ──');
{
  execSync('npx esbuild fredExplains.ts --bundle --format=cjs --platform=node --outfile=/tmp/fred-parity.cjs --log-level=error');
  const front = require('/tmp/fred-parity.cjs');
  const a = front.FRED_CATALOG.map(c => `${c.id}|${c.level}|${c.topic}|${c.order}`).join('\n');
  const b = core.CATALOG.map(c => `${c.id}|${c.level}|${c.topic}|${c.order}`).join('\n');
  check('Front e servidor montam o MESMO catálogo (ids, níveis, ordem)', a === b);
  check('Busca sem acento acha "preposições"', front.searchCatalog('preposicoes', 'ALL').some(c => c.topic.includes('preposições')));
  check('Busca "passado" acha Simple Past via sinônimo', front.searchCatalog('passado', 'A1').some(c => c.topic === 'Simple Past'));
  check('Filtro de nível restringe', front.searchCatalog('', 'C1').every(c => c.level === 'C1') && front.searchCatalog('', 'C1').length === 29);
  check('parseBold separa negrito', JSON.stringify(front.parseBold('a **b** c')) === JSON.stringify([{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]));
  check('LESSON_XP igual nos dois lados', front.LESSON_XP === core.LESSON_XP && front.LESSON_PASS_PCT === core.LESSON_PASS_PCT);

  // Sugestão "Fred explica" na tela de resultados: casa os nomes de
  // tópico da prática livre (constants.ts) com o catálogo.
  execSync('npx esbuild constants.ts --bundle --format=cjs --platform=node --outfile=/tmp/fred-constants.cjs --log-level=error');
  const { TOPICS } = require('/tmp/fred-constants.cjs');
  const m = (lvl, t) => front.matchCatalogEntry(lvl, t)?.topic;
  check('Prática livre: "Verbo To Be (afirmativa...)" → aula do to be', m('A1', 'Verbo To Be (afirmativa, negativa, interrogativa)') === 'Verbo to be (presente)');
  check('Prática livre: "To Be past (Was, Were)" → Was / Were', m('A1', 'To Be past (Was, Were)') === 'Was / Were');
  check('Prática livre: "Demonstrative pronouns" → Demonstrativos (não Reflexivos)', m('A2', 'Demonstrative pronouns (This/ these, That/ Those)') === 'Demonstrativos + one/ones');
  check('Prática livre: "Objective Pronouns" → Pronomes pessoais', m('A2', 'Objective Pronouns (Me, you, him, her, it, us, them)') === 'Pronomes pessoais (sujeito e objeto)');
  check('Prática livre: "In, on, at (place)" B2 → (lugar)', m('B2', 'In, on, at (place)') === 'In, On, At (lugar)');
  check('Prática livre: "Comparatives" → Comparativos', m('A2', 'Comparatives') === 'Comparativos');
  check('Testes mistos não sugerem aula', m('A1', 'Teste: Todos os modais (Might, Can, Could, Must, Should, Would)') === undefined && m('B2', 'Final Test: (todos os tópicos gramaticais de B2)') === undefined);
  check('Tópico sem equivalente não sugere nada', m('C1', 'Cleft Sentences') === undefined);
  let casam = 0, total = 0;
  for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1']) for (const t of TOPICS[lvl]['Gramática'] || []) { total++; if (front.matchCatalogEntry(lvl, t)) casam++; }
  check(`Cobertura da prática livre ≥ 85 de ${total} tópicos (hoje ${casam})`, casam >= 85);
}

console.log('\n── Prompt do Fred ──');
{
  const p = core.buildPrompt({ level: 'B1', topic: 'Present Perfect' });
  check('Prompt carrega tema e nível', p.includes('Present Perfect') && p.includes('B1'));
  check('Prompt pede comparação com o português', core.FRED_PERSONA.includes('PORTUGUÊS') && p.includes('ptAnalogy'));
  check('Prompt pede mini-quizzes e checkpoint de 5', p.includes('mini-quiz') && p.includes('EXATAMENTE 5'));
  check('Persona proíbe "Dica de ouro"', core.FRED_PERSONA.includes('Dica de ouro'));
  check('Profundidade muda por nível', core.buildPrompt({ level: 'A1', topic: 'X' }) !== core.buildPrompt({ level: 'C1', topic: 'X' }));
  check('Schema exige os campos principais', ['title', 'hook', 'sections', 'mistakes', 'summary', 'finalQuiz'].every(k => core.LESSON_SCHEMA.required.includes(k)));
}

console.log('\n── Validação do conteúdo da IA ──');
const quiz = (n) => ({ question: `Question ${n}?`, options: ['a' + n, 'b' + n, 'c' + n, 'd' + n], correctIndex: 1, explanation: 'porque sim' });
const section = (n, withQuiz = true, mood = 'perfil') => ({
  heading: `Seção ${n}`, mood, body: 'Corpo da seção com texto suficiente para passar na validação mínima de tamanho. '.repeat(2),
  examples: [{ en: 'I am here.', pt: 'Estou aqui.', note: '' }], ptAnalogy: n === 1 ? 'Em português...' : '', tip: '', quiz: withQuiz ? [quiz(n)] : [],
});
const good = {
  title: 'Verbo to be', hook: 'Imagina que você chega numa festa e precisa se apresentar em inglês...',
  sections: [section(1), section(2, false, 'surpreso'), section(3, true, 'motivado'), section(4, true, 'feliz')],
  mistakes: [{ wrong: 'I have 20 years.', right: 'I am 20 years old.', why: 'Idade em inglês usa to be.' }],
  summary: ['Ponto 1', 'Ponto 2', 'Ponto 3'],
  finalQuiz: [quiz(10), quiz(11), quiz(12), quiz(13), quiz(14)],
};
{
  const n = core.normalizeLesson(good);
  check('Aula válida passa', !!n && n.sections.length === 4 && n.finalQuiz.length === 5);
  check('Rejeita menos de 3 seções', core.normalizeLesson({ ...good, sections: good.sections.slice(0, 2) }) === null);
  check('Rejeita aula sem nenhum mini-quiz', core.normalizeLesson({ ...good, sections: good.sections.map(s => ({ ...s, quiz: [] })) }) === null);
  check('Rejeita checkpoint com menos de 3 questões', core.normalizeLesson({ ...good, finalQuiz: good.finalQuiz.slice(0, 2) }) === null);
  check('Descarta questão com 3 opções', core.normalizeLesson({ ...good, finalQuiz: [...good.finalQuiz.slice(0, 4), { ...quiz(9), options: ['a', 'b', 'c'] }] }).finalQuiz.length === 4);
  check('Descarta questão com opções duplicadas', core.normalizeQuiz({ ...quiz(1), options: ['x', 'x', 'y', 'z'] }) === null);
  check('Descarta índice fora da faixa', core.normalizeQuiz({ ...quiz(1), correctIndex: 4 }) === null);
  check('Mood inválido vira "perfil"', core.normalizeLesson({ ...good, sections: [{ ...section(1), mood: 'bravo' }, section(2), section(3)] }).sections[0].mood === 'perfil');
  check('Conserta "\\n" literal no corpo', core.normalizeLesson({ ...good, sections: [{ ...section(1), body: 'Primeiro parágrafo com texto suficiente aqui.\\n\\nSegundo parágrafo também com texto.' }, section(2), section(3)] }).sections[0].body.includes('\n\n'));
  check('Seção sem quiz só limita a 1 quiz', core.normalizeLesson({ ...good, sections: [{ ...section(1), quiz: [quiz(1), quiz(2)] }, section(2), section(3)] }).sections[0].quiz.length === 1);
  check('Rejeita hook curto', core.normalizeLesson({ ...good, hook: 'oi' }) === null);
  check('parseLoose tolera ```json e vírgula sobrando', bg.parseLoose('```json\n{"a": [1,2,],}\n```').a.length === 2);
}

console.log('\n── Embaralhamento das alternativas (bug da "letra A") ──');
{
  const sh = require('./netlify/functions/lib/shuffle.js');
  execSync('npx esbuild shuffleOptions.ts --bundle --format=cjs --platform=node --outfile=/tmp/fred-shuffle.cjs --log-level=error');
  const front = require('/tmp/fred-shuffle.cjs');
  const q = { question: 'Q?', options: ['certa', 'b', 'c', 'd'], correctAnswerIndex: 0, explanation: 'x' };
  let okAll = true; const positions = new Set();
  for (let i = 0; i < 200; i++) {
    const r = sh.shuffleQuestion(q);
    if (r.options[r.correctAnswerIndex] !== 'certa' || r.options.length !== 4 || new Set(r.options).size !== 4) okAll = false;
    positions.add(r.correctAnswerIndex);
  }
  check('Servidor: a certa continua certa depois de embaralhar (200x)', okAll);
  check('Servidor: a certa aparece em todas as 4 posições ao longo de 200 sorteios', positions.size === 4, `(${[...positions].join(',')})`);
  let okF = true; const posF = new Set();
  for (let i = 0; i < 200; i++) {
    const r = front.shuffleQuestion({ question: 'Q?', options: ['a', 'certa', 'c', 'd'], correctIndex: 1 });
    if (r.options[r.correctIndex] !== 'certa') okF = false;
    posF.add(r.correctIndex);
  }
  check('Front: mesmo comportamento com correctIndex (Fred explica)', okF && posF.size === 4);
  const lesson = core.normalizeLesson(good);
  const allSame = lesson.finalQuiz.every(x => x.correctIndex === 1) && lesson.sections.every(s => !s.quiz[0] || s.quiz[0].correctIndex === 1);
  check('normalizeLesson embaralha o gabarito (não fica tudo na mesma letra)', !allSame && lesson.finalQuiz.every((x, i) => x.options[x.correctIndex] === 'b' + (10 + i)));
  const nested = sh.deepShuffleQuestions({ questions: [q, q], readingText: 'texto', sections: [{ quiz: [{ options: ['x', 'y', 'z', 'w'], correctIndex: 3 }] }] });
  check('deepShuffle atinge questões aninhadas e preserva o resto', nested.readingText === 'texto' && nested.questions.every(x => x.options[x.correctAnswerIndex] === 'certa') && nested.sections[0].quiz[0].options[nested.sections[0].quiz[0].correctIndex] === 'w');
  check('Questão sem índice válido passa intacta', sh.shuffleQuestion({ options: ['a', 'b'], correctAnswerIndex: 7 }).correctAnswerIndex === 7 && sh.shuffleQuestion({ sentence: 'gap ____' }).sentence === 'gap ____');
}

console.log('\n── Correção do checkpoint (servidor) ──');
{
  const lesson = core.normalizeLesson(good);
  // O gabarito agora é embaralhado, então as respostas "certas" são
  // lidas da própria aula normalizada (e as erradas, deslocadas em 1).
  const right = lesson.finalQuiz.map(x => x.correctIndex);
  const wrong = right.map(i => (i + 1) % 4);
  const r = core.scoreFinalQuiz(lesson, [right[0], right[1], right[2], wrong[3], wrong[4]]);
  check('3/5 = 60% aprova', r.score === 3 && r.pct === 60 && r.passed === true);
  const r2 = core.scoreFinalQuiz(lesson, [right[0], right[1], wrong[2], wrong[3], wrong[4]]);
  check('2/5 = 40% reprova', r2.score === 2 && r2.passed === false);
  check('Respostas faltando contam como erro', core.scoreFinalQuiz(lesson, [right[0]]).score === 1);
  check('Resposta inválida não quebra', core.scoreFinalQuiz(lesson, 'x').score === 0 && core.scoreFinalQuiz(lesson, [String(right[0]), undefined, right[2], right[3], right[4]]).score === 4);
}

console.log('\n── Assinatura entre functions ──');
{
  process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'segredo-de-teste';
  const s = sign.signScoped('fred-lesson', 'A1_x');
  check('Assinatura válida verifica', sign.verifyScoped('fred-lesson', 'A1_x', s));
  check('Assinatura de outro escopo não serve', !sign.verifyScoped('journey-audio', 'A1_x', s));
  check('Assinatura de outro id não serve', !sign.verifyScoped('fred-lesson', 'A1_y', s));
  check('Assinatura antiga da Journey continua funcionando', sign.verifyBankId('b1', sign.signBankId('b1')));
}

console.log('\n── Handler fred-explains (mock do Firestore) ──');
{
  // Mock mínimo do firebase-admin para exercitar o fluxo de "get".
  const store = new Map();
  const docRef = (path) => ({
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (d, o) => { store.set(path, o?.merge ? { ...(store.get(path) || {}), ...d } : d); },
    create: async (d) => { if (store.has(path)) { const e = new Error('already exists'); e.code = 6; throw e; } store.set(path, d); },
  });
  const db = { collection: (c) => ({ doc: (id) => docRef(`${c}/${id}`) }), runTransaction: async (fn) => fn({ get: async (r) => r.get(), set: (r, d, o) => r.set(d, o) }) };
  // Os módulos do firebase-admin expõem só getters: em vez de
  // sobrescrever, interceptamos o require e entregamos o mock.
  const Module = require('node:module');
  const realLoad = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'firebase-admin/app') return { getApps: () => [{}], initializeApp: () => ({}), cert: () => ({}) };
    if (req === 'firebase-admin/firestore') return { getFirestore: () => db, FieldValue: { delete: () => undefined } };
    if (req === 'firebase-admin/auth') return { getAuth: () => ({ verifyIdToken: async (t) => { if (t !== 'ok') throw new Error('bad'); return { uid: 'u1' }; } }) };
    return realLoad.call(this, req, ...rest);
  };
  // Sem URL base: a geração não dispara (só loga) — suficiente para o teste.
  delete process.env.URL; delete process.env.DEPLOY_PRIME_URL; delete process.env.DEPLOY_URL;
  process.env.FIREBASE_PROJECT_ID = 'teste';
  const fx = require('./netlify/functions/fred-explains.js');
  const call = async (body, token = 'ok') => JSON.parse((await fx.handler({ httpMethod: 'POST', headers: { authorization: `Bearer ${token}`, origin: 'https://freedom.app.br' }, body: JSON.stringify(body) })).body);

  check('Sem token → 401', (await fx.handler({ httpMethod: 'POST', headers: {}, body: '{}' })).statusCode === 401);
  check('Token inválido → erro', !!(await call({ id: 'A1_will' }, 'ruim')).error);
  check('Tema fora do catálogo → erro', !!(await call({ id: 'A1_inventado' })).error);
  const g1 = await call({ action: 'get', id: 'A1_will' });
  check('1º pedido cria o doc "generating"', g1.status === 'generating' && store.get('fred_lessons/A1_will')?.status === 'generating');
  check('Marca "abriu" no progresso do aluno', !!store.get('fred_progress/u1')?.lessons?.A1_will?.openedAt);
  const g2 = await call({ action: 'get', id: 'A1_will' });
  check('2º pedido só acompanha (não duplica)', g2.status === 'generating');
  const storedLesson = core.normalizeLesson(good);
  const R = storedLesson.finalQuiz.map(x => x.correctIndex), W = R.map(i => (i + 1) % 4);
  store.set('fred_lessons/A1_will', { status: 'ready', content: storedLesson, shuffled: true });
  const g3 = await call({ action: 'get', id: 'A1_will' });
  check('Aula pronta volta com conteúdo', g3.status === 'ready' && g3.lesson.finalQuiz.length === 5);
  // Aula antiga (sem a marca "shuffled"): o get embaralha e REGRAVA,
  // para o gabarito do servidor e o que o aluno vê baterem.
  const oldLesson = { ...storedLesson, finalQuiz: storedLesson.finalQuiz.map(x => ({ ...x, options: ['certa', 'b', 'c', 'd'], correctIndex: 0 })) };
  store.set('fred_lessons/A1_going-to', { status: 'ready', content: oldLesson });
  const g4 = await call({ action: 'get', id: 'A1_going-to' });
  const saved = store.get('fred_lessons/A1_going-to');
  check('Aula antiga é embaralhada e regravada com a marca shuffled',
    saved.shuffled === true && saved.content.finalQuiz.every(x => x.options[x.correctIndex] === 'certa') && JSON.stringify(g4.lesson) === JSON.stringify(saved.content));
  store.set('fred_lessons/A1_going-to', { status: 'generating' });
  check('complete recusa aula não pronta', !!(await call({ action: 'complete', id: 'A1_going-to', answers: [1] })).error);
  store.set('users/u1', { username: 'aluno', gamification: { xp: 100, dailyXpEarned: 0 } });
  const c1 = await call({ action: 'complete', id: 'A1_will', answers: [R[0], R[1], R[2], W[3], W[4]] });
  check('Checkpoint 60% → passa e ganha XP', c1.passed && c1.xpGained === core.LESSON_XP && c1.totalXp === 100 + core.LESSON_XP);
  const c2 = await call({ action: 'complete', id: 'A1_will', answers: R });
  check('Repetir não dá XP de novo, mas guarda melhor nota', c2.xpGained === 0 && c2.alreadyCompleted && c2.progress.bestPct === 100);
  check('XP do aluno subiu só uma vez', store.get('users/u1').gamification.xp === 140);
  const c3 = await call({ action: 'complete', id: 'A1_going-to', answers: [] });
  check('Aula inexistente no complete → erro amigável', !!c3.error);
  const f1 = await call({ action: 'feedback', id: 'A1_will', vote: 'down' });
  check('Feedback registra voto', f1.ok && store.get('fred_lessons/A1_will').feedback.down === 1);
  const f2 = await call({ action: 'feedback', id: 'A1_will', vote: 'up' });
  check('Trocar o voto ajusta os contadores', f2.ok && store.get('fred_lessons/A1_will').feedback.down === 0 && store.get('fred_lessons/A1_will').feedback.up === 1);
  const r1 = await call({ action: 'regenerate', id: 'A1_will' });
  check('Aluno comum não pode regerar', !!r1.error);
  store.set('users/u1', { ...store.get('users/u1'), isAdmin: true });
  const r2 = await call({ action: 'regenerate', id: 'A1_will' });
  check('Admin regera (doc volta a "generating")', r2.status === 'generating' && store.get('fred_lessons/A1_will').status === 'generating');
}

// ── Geração real (opcional) ───────────────────────────────────
const liveIdx = process.argv.indexOf('--live');
if (liveIdx >= 0) {
  const id = process.argv[liveIdx + 1] || 'A1_verbo-to-be-presente';
  const entry = core.resolveLesson({ id });
  if (!entry || !process.env.GEMINI_API_KEY) { console.log('\n(live) precisa de GEMINI_API_KEY e um id válido'); }
  else {
    console.log(`\n── Geração REAL: ${entry.level} · ${entry.topic} ──`);
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const t0 = Date.now();
    try {
      const { lesson, model } = await bg.generateLesson(ai, entry);
      const secs = Math.round((Date.now() - t0) / 1000);
      check(`Gerou com ${model} em ${secs}s`, true);
      check('Tem 3+ seções', lesson.sections.length >= 3, `(${lesson.sections.length})`);
      check('Tem 5 questões no checkpoint', lesson.finalQuiz.length === 5, `(${lesson.finalQuiz.length})`);
      check('Pelo menos 2 seções com analogia/português', lesson.sections.filter(s => s.ptAnalogy).length >= 2);
      check('Sem "Dica de ouro"/"Regra de ouro"', !JSON.stringify(lesson).match(/(dica|regra) de ouro/i));
      const fsm = await import('node:fs');
      fsm.writeFileSync(`/tmp/fred-${id}.json`, JSON.stringify(lesson, null, 2));
      console.log(`  (aula salva em /tmp/fred-${id}.json)`);
    } catch (e) { check('Geração real', false, String(e?.message || e).slice(0, 300)); }
  }
}

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
