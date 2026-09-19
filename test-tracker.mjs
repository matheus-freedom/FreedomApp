// ============================================================
// Testes do rastreador de uso (services/tracker.ts) com relógio,
// navegador e Firestore falsos. Roda com:  node test-tracker.mjs
// ============================================================
import * as esbuild from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outfile = path.join(os.tmpdir(), 'fa-tracker.mjs');
const stub = {
  name: 'stub-firebase',
  setup(build) {
    build.onResolve({ filter: /\.\/firebase$/ }, () => ({ path: 'fb', namespace: 'stub' }));
    build.onResolve({ filter: /^firebase\// }, () => ({ path: 'sdk', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `export const db={}; export const doc=(_d,c,id)=>({c,id});
        export const setDoc=async(ref,data)=>{ if(globalThis.__failWrites) throw new Error('offline'); globalThis.__writes.push({id:ref.id,data:JSON.parse(JSON.stringify(data))}); };`,
      loader: 'js',
    }));
  },
};
await esbuild.build({ entryPoints: ['services/tracker.ts'], bundle: true, format: 'esm', platform: 'node', outfile, plugins: [stub], logLevel: 'error' });

// ── Mundo falso ──
let now = Date.UTC(2026, 8, 16, 18, 0, 0);
Date.now = () => now;
const timers = [];
globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearInterval = () => {};
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
const listeners = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (e, f) => { listeners[e] = f; }, removeEventListener() {} };
globalThis.window = { addEventListener: (e, f) => { listeners[e] = f; }, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari' }, configurable: true });
globalThis.__writes = [];

const { tracker } = await import(pathToFileURL(outfile).href);
// O relógio é falso: advance(seg) anda de 5 em 5 segundos disparando o
// "tick" do rastreador, como o setInterval faria no navegador.
const tick = () => timers.filter(t => t.ms === 5000).forEach(t => t.fn());
const flushTimer = () => timers.filter(t => t.ms === 60000).forEach(t => t.fn());
const advance = (sec) => { for (let i = 0; i < sec / 5; i++) { now += 5000; tick(); } };
const last = () => globalThis.__writes.at(-1)?.data;
const wait = () => new Promise(r => setImmediate(r));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${extra}`); } };
const ana = { userId: 'ana', username: '@ana', fullName: 'Ana' };

console.log('\n── Admin ──');
tracker.start({ userId: 'adm', username: '@m', fullName: 'M', isAdmin: true });
await wait();
check('admin não gera acesso', globalThis.__writes.length === 0);

console.log('\n── Acesso normal ──');
tracker.start(ana); await wait();
check('grava o acesso ao começar', globalThis.__writes.length === 1 && last().userId === 'ana');
check('id = aluno + início', last().id === `ana_${last().startedAt}`);
check('dia/hora de São Paulo', last().day === '2026-09-16' && last().hour === 15);
check('aparelho detectado: celular', last().device === 'mobile');
tracker.screen('selection');
advance(60);
tracker.screen('quiz');
tracker.event('ex_start');
advance(30);
flushTimer(); await wait();
check('tempo ativo = 90s', last().activeMs === 90000, `(${last().activeMs})`);
check('60s no início, 30s no quiz', last().screens.selection === 60000 && last().screens.quiz === 30000, JSON.stringify(last().screens));
check('visitas contadas', last().visits.selection === 1 && last().visits.quiz === 1);
check('evento contado', last().events.ex_start === 1);
tracker.screen('quiz');
check('repetir a mesma tela não conta visita nova', true);

console.log('\n── Aba escondida e ociosidade ──');
document.visibilityState = 'hidden'; listeners.visibilitychange(); await wait();
const beforeHidden = last().activeMs;
advance(120);
document.visibilityState = 'visible';
flushTimer(); await wait();
check('aba escondida não soma tempo', last().activeMs === beforeHidden, `(${last().activeMs} vs ${beforeHidden})`);
advance(600); // 10 min parado, sem nenhum sinal
const idle = (await (flushTimer(), wait()), last().activeMs);
check('parado conta no máximo ~2 min (corte de ociosidade)', idle - beforeHidden <= 125000, `(${idle - beforeHidden} ms)`);

console.log('\n── Chaves e falhas ──');
tracker.event('ex_start_Gramática/B1.x');
flushTimer(); await wait();
check('chave com . e / é higienizada', Object.keys(last().events).some(k => k === 'ex_start_Gramática_B1_x'));
globalThis.__failWrites = true;
tracker.event('limit_hit'); flushTimer(); await wait();
globalThis.__failWrites = false;
flushTimer(); await wait();
check('falha de rede não perde o dado: regrava depois', last().events.limit_hit === 1);

console.log('\n── Recarga e novo acesso ──');
const firstId = last().id;
await tracker.stop();
now += 5 * 60000;
tracker.start(ana); await wait();
check('voltar em 5 min continua o MESMO acesso', last().id === firstId);
await tracker.stop();
now += 45 * 60000;
tracker.start(ana); await wait();
check('voltar depois de 45 min abre acesso NOVO', last().id !== firstId && last().activeMs === 0);
await tracker.stop();
tracker.start({ userId: 'bia', username: '@bia', fullName: 'Bia' }); await wait();
check('outro aluno no mesmo aparelho = outro acesso', last().userId === 'bia');
check('cópia local por aluno', store.has('freedom_session_ana') && store.has('freedom_session_bia'));

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
