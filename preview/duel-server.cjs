// Servidor de PREVIEW do Duelo da Roleta (não vai para produção).
// Roda a function duel.js DE VERDADE contra um Firestore falso em
// memória, com um "robô" (@bia.bot) jogando do outro lado.
//   node preview/duel-server.cjs   → http://localhost:8888
const http = require('http');
const path = require('path');
const store = new Map();
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const snapOf = (col, id) => { const v = store.get(`${col}/${id}`); return { exists: v !== undefined, id, data: () => clone(v), ref: docRef(col, id) }; };
const write = (col, id, data, opts) => { const k = `${col}/${id}`; store.set(k, opts && opts.merge ? { ...(store.get(k) || {}), ...clone(data) } : clone(data)); };
const docRef = (col, id) => ({ id, path: `${col}/${id}`, get: async () => snapOf(col, id), set: async (d, o) => write(col, id, d, o), delete: async () => store.delete(`${col}/${id}`) });
const collection = (col) => ({
  doc: (id) => docRef(col, id),
  get: async () => ({ docs: [...store.keys()].filter(k => k.startsWith(col + '/')).map(k => snapOf(col, k.slice(col.length + 1))) }),
  where: (f, op, val) => ({ get: async () => ({ docs: [...store.entries()].filter(([k, v]) => k.startsWith(col + '/') && Array.isArray(v[f]) && v[f].includes(val)).map(([k]) => snapOf(col, k.slice(col.length + 1))) }) }),
});
const db = { collection, runTransaction: async (fn) => { const p = []; const tx = { get: (r) => r.get(), set: (r, d, o) => p.push(() => write(...r.path.split('/'), d, o)), delete: (r) => p.push(() => store.delete(r.path)) }; const out = await fn(tx); p.forEach(f => f()); return out; } };
const fake = (name, exp) => { const p = require.resolve(name, { paths: [path.resolve(__dirname, '..')] }); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
fake('firebase-admin/app', { initializeApp: () => {}, getApps: () => [1], cert: () => ({}) });
fake('firebase-admin/firestore', { getFirestore: () => db });
fake('firebase-admin/auth', { getAuth: () => ({ verifyIdToken: async (t) => ({ uid: t }) }) });
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_PRIVATE_KEY = 'x';
const { handler } = require('../netlify/functions/duel.js');
const core = require('../netlify/functions/lib/duel-core.js');

const user = (uid, username, name, g = {}) => write('users', uid, { userId: uid, username, fullName: name, gamification: { xp: 2400, frBalance: 12.5, placementResults: { grammar: { level: 'B1' } }, lastLoginDate: '2026-09-27', ...g } });
user('me', '@matheus', 'Matheus');
user('bia', '@bia.bot', 'Bia Robô', { placementResults: { grammar: { level: 'A2' } } });
user('leo', '@leo', 'Leonardo Costa');
user('carla', '@carla.m', 'Carla Mendes', { placementResults: { reading: { level: 'B2' } } });
user('new', '@novato', 'Novato', { placementResults: {} });
write('duel_players', 'me', { wins: 7, losses: 3, draws: 1, played: 11, streak: 2, bestStreak: 4, trophies: 180, crownsTotal: 41,
  catStats: { grammar: { c: 18, t: 22 }, vocabulary: { c: 15, t: 19 }, reading: { c: 9, t: 14 }, listening: { c: 6, t: 13 }, travel: { c: 11, t: 15 }, everyday: { c: 14, t: 16 } } });

const call = async (uid, body) => { const r = await handler({ httpMethod: 'POST', headers: { authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }); return JSON.parse(r.body); };

// Semeia alguns duelos para a lista não nascer vazia.
(async () => {
  let r = await call('carla', { action: 'create', opponentId: 'me', stake: 2 }); // convite recebido com aposta
  r = await call('me', { action: 'create', opponentId: 'leo', stake: 0 });     // convite enviado
  r = await call('leo', { action: 'respond', duelId: r.duel.id, accept: true }); // vira "vez de @matheus"? não: quem convidou começa
})();

// Robô: aceita convites e joga a vez dele com ~60% de acerto.
const botPlay = async () => {
  for (const [k, d] of store.entries()) {
    if (!k.startsWith('duels/')) continue;
    if (d.status === 'invited' && d.players[1] === 'bia') { await call('bia', { action: 'respond', duelId: d.id, accept: true }); continue; }
    if (d.status !== 'active' || d.turn !== 'bia') continue;
    let guard = 0, cur = d;
    while (cur.status === 'active' && cur.turn === 'bia' && guard++ < 40) {
      if (cur.phase === 'spin') cur = (await call('bia', { action: 'spin', duelId: d.id })).duel;
      else if (cur.phase === 'crown_pick') cur = (await call('bia', { action: 'pickCrown', duelId: d.id, cat: core.availableCrowns(cur, 'bia')[0] })).duel;
      else { const s = store.get(`duels/${d.id}`) && store.get(`duel_secrets/${d.id}`); const ok = Math.random() < 0.6; cur = (await call('bia', { action: 'answer', duelId: d.id, n: cur.question.n, choice: ok ? s.answer : (s.answer + 1) % 4 })).duel; }
    }
  }
};
setInterval(() => botPlay().catch(e => console.error('bot', e)), 3000);

// Atalho de teste: /__cheat?duel=ID&who=me → coloca 5 coroas (para ver o fim de jogo).
http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS, GET' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url.startsWith('/__cheat')) {
    const u = new URL(req.url, 'http://x'); const d = store.get(`duels/${u.searchParams.get('duel')}`);
    if (d) { d.crowns[u.searchParams.get('who')] = core.CATEGORIES.slice(0, 5); store.set(`duels/${d.id}`, d); }
    res.writeHead(200, cors); return res.end('ok');
  }
  if (req.url.startsWith('/__secret')) {
    const u = new URL(req.url, 'http://x'); res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(store.get(`duel_secrets/${u.searchParams.get('duel')}`) || null));
  }
  let body = ''; req.on('data', c => body += c); req.on('end', async () => {
    const r = await handler({ httpMethod: 'POST', headers: { authorization: req.headers.authorization }, body });
    res.writeHead(r.statusCode, { ...cors, 'Content-Type': 'application/json' }); res.end(r.body);
  });
}).listen(8888, () => console.log('duel preview server :8888'));
