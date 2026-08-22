// Testes da trava e da variedade do nivelamento, com Firestore falso.
// Rode com: node test-placement.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { __test } = require('./netlify/functions/placement-background.js');
const { acquireLock, releaseLock, waitForBankEntry, buildVarietyInstruction, NAME_POOL } = __test;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${extra}`); }
};

// ── Firestore falso, só com o que a trava usa ─────────────────────
const makeDb = (seed = {}) => {
  const data = JSON.parse(JSON.stringify(seed));
  return {
    _data: data,
    collection(col) {
      data[col] = data[col] || {};
      return {
        doc(id) {
          return {
            async create(v) {
              if (data[col][id] !== undefined) throw new Error('ALREADY_EXISTS');
              data[col][id] = v;
            },
            async set(v) { data[col][id] = v; },
            async get() {
              const v = data[col][id];
              return { exists: v !== undefined, data: () => v };
            },
            async delete() { delete data[col][id]; },
          };
        },
      };
    },
  };
};

console.log('\n== Trava: dois alunos disparam a MESMA variação ==');
{
  const db = makeDb();
  const a = await acquireLock(db, 'listening_2026-Q3_v1');
  const b = await acquireLock(db, 'listening_2026-Q3_v1');
  check('o primeiro pega a trava', a === true);
  check('o segundo NÃO gera de novo', b === false);
  check('trava registrada no Firestore', !!db._data.placement_locks['listening_2026-Q3_v1']);
}

console.log('\n== Trava: variações diferentes não se atrapalham ==');
{
  const db = makeDb();
  const v1 = await acquireLock(db, 'reading_2026-Q3_v1');
  const v2 = await acquireLock(db, 'reading_2026-Q3_v2');
  check('variação 1 liberada', v1 === true);
  check('variação 2 liberada em paralelo', v2 === true);
}

console.log('\n== Trava: liberada no fim, próxima tentativa funciona ==');
{
  const db = makeDb();
  await acquireLock(db, 'grammar_2026-Q4_v1');
  await releaseLock(db, 'grammar_2026-Q4_v1');
  check('trava sumiu do Firestore', db._data.placement_locks['grammar_2026-Q4_v1'] === undefined);
  check('nova geração consegue a trava', (await acquireLock(db, 'grammar_2026-Q4_v1')) === true);
}

console.log('\n== Trava abandonada (função morreu no meio) é reassumida ==');
{
  const velha = { placement_locks: { 'writing_2026-Q3_v1': { startedAt: Date.now() - 25 * 60 * 1000 } } };
  const db = makeDb(velha);
  check('assume trava com mais de 20 min', (await acquireLock(db, 'writing_2026-Q3_v1')) === true);

  const nova = { placement_locks: { 'writing_2026-Q3_v2': { startedAt: Date.now() - 60 * 1000 } } };
  const db2 = makeDb(nova);
  check('NÃO assume trava recente (1 min)', (await acquireLock(db2, 'writing_2026-Q3_v2')) === false);
}

console.log('\n== Espera pelo trabalho do outro processo ==');
{
  const db = makeDb({ placement_bank: { 'listening_2026-Q3_v1': { id: 'x' } } });
  check('acha na hora se já está pronto', (await waitForBankEntry(db, 'listening_2026-Q3_v1', 1000)) === true);

  const vazio = makeDb();
  const t0 = Date.now();
  const r = await waitForBankEntry(vazio, 'nao_existe', 300);
  check('desiste no tempo limite em vez de travar', r === false && Date.now() - t0 < 3000);
}

console.log('\n== Variedade de nomes ==');
{
  const proibidos = ['Sarah', 'Mark', 'Leo', 'John', 'Mary', 'Anna', 'Emily', 'Michael', 'Tom', 'David'];
  check('elenco grande', NAME_POOL.length >= 60, `(${NAME_POOL.length})`);
  check('sem nomes batidos no elenco', !NAME_POOL.some(n => proibidos.includes(n)));
  check('sem nomes repetidos', new Set(NAME_POOL).size === NAME_POOL.length);
  check('tem nomes brasileiros', ['Thiago', 'Larissa', 'Juliana'].every(n => NAME_POOL.includes(n)));
  check('tem nomes latinos', ['Santiago', 'Valentina', 'Mateo'].every(n => NAME_POOL.includes(n)));
  check('tem nomes americanos', ['Ethan', 'Olivia', 'Harper'].every(n => NAME_POOL.includes(n)));

  const amostras = Array.from({ length: 40 }, () => buildVarietyInstruction());
  check('o sorteio realmente varia entre gerações', new Set(amostras).size > 30, `(${new Set(amostras).size}/40 diferentes)`);
  check('toda instrução proíbe os nomes batidos', amostras.every(a => a.includes('Sarah') && a.includes('NEVER use')));
  check('toda instrução traz 6 nomes', amostras.every(a => (a.match(/list: (.+)\./) || [])[1]?.split(',').length === 6));
}

console.log('\n== Trimestre anterior (rede de segurança da virada) ==');
{
  // Mesma fórmula do getPreviousQuarterKey em services/api.ts.
  const prev = (d) => {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return q === 1 ? `${d.getFullYear() - 1}-Q4` : `${d.getFullYear()}-Q${q - 1}`;
  };
  check('1º de janeiro volta para Q4 do ano anterior', prev(new Date('2027-01-01T12:00:00')) === '2026-Q4');
  check('1º de outubro volta para Q3', prev(new Date('2026-10-01T12:00:00')) === '2026-Q3');
  check('agosto volta para Q2', prev(new Date('2026-08-22T12:00:00')) === '2026-Q2');
  check('1º de abril volta para Q1', prev(new Date('2026-04-01T12:00:00')) === '2026-Q1');
}

console.log(`\n=========== ${pass} passaram, ${fail} falharam ===========`);
process.exit(fail === 0 ? 0 : 1);
