// Testa a "virada do dia" no horário de Brasília (cliente e servidor).
// Rodar: node test-spdate.mjs
import { createRequire } from 'module';
import { transformSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { spDayKey: serverKey } = require('./netlify/functions/lib/sp-date.js');

// Compila o spDate.ts (lado do navegador) para poder importar no Node.
const js = transformSync(readFileSync('./spDate.ts', 'utf8'), { loader: 'ts', format: 'esm' }).code;
writeFileSync('/tmp/spDate.test.mjs', js);
const { spDayKey: clientKey } = await import('/tmp/spDate.test.mjs');

let ok = 0, fail = 0;
const check = (name, got, want) => {
  if (got === want) { ok++; } else { fail++; console.log(`✗ ${name}: esperado ${want}, veio ${got}`); }
};
const casos = [
  // [instante em Brasília, dia esperado]
  ['2026-11-11T00:00:00-03:00', '2026-11-11'],
  ['2026-11-11T08:00:00-03:00', '2026-11-11'],
  ['2026-11-11T20:59:59-03:00', '2026-11-11'],
  ['2026-11-11T21:00:00-03:00', '2026-11-11'], // antes do conserto virava para 12/11 aqui
  ['2026-11-11T23:59:59-03:00', '2026-11-11'],
  ['2026-11-12T00:00:00-03:00', '2026-11-12'],
  ['2026-12-31T22:30:00-03:00', '2026-12-31'], // virada de ano
  ['2027-01-01T00:00:01-03:00', '2027-01-01'],
];
for (const [iso, want] of casos) {
  const ms = Date.parse(iso);
  check(`servidor ${iso}`, serverKey(ms), want);
  check(`cliente ${iso}`, clientKey(ms), want);
}
console.log(`=========== ${ok} passaram, ${fail} falharam ===========`);
process.exit(fail ? 1 : 0);
