// Servidor de PREVIEW da aba Games (não vai para produção).
// Roda as functions games.js e duel.js DE VERDADE contra o Firestore
// falso em memória e coloca robôs jogando nas salas, para dar para
// ver as telas sem tocar no banco da escola.
//   node preview/games-server.cjs   → http://localhost:8888
// Também expõe /__doc, /__query, /__set e /__del para o "tempo real"
// falso do preview (preview/gamesRealtimeMock.ts), e /__bots?room=ID
// para colocar 3 robôs numa sala.
const http = require('http');
const path = require('path');
const { makeDb, installFakeAdmin } = require('./fake-firestore.cjs');
const { db, store } = makeDb();
installFakeAdmin(db, path.resolve(__dirname, '..'));
const games = require('../netlify/functions/games.js').handler;
const duel = require('../netlify/functions/duel.js').handler;

const user = (uid, username, name, lv) => store.set(`users/${uid}`, { userId: uid, username, fullName: name, gamification: { xp: 2400, frBalance: 12.5, placementResults: { grammar: { level: lv } }, lastLoginDate: '2026-11-04' } });
user('me', '@matheus', 'Matheus', 'B1');
user('bia', '@bia.bot', 'Bia Robô', 'B1');
user('leo', '@leo.bot', 'Leo Robô', 'B1');
user('carla', '@carla.bot', 'Carla Robô', 'A2');
user('prof', '@prof', 'Professor', 'B2');
store.set('users/prof', { ...store.get('users/prof'), isAdmin: true });
const BOTS = ['bia', 'leo', 'carla'];

const call = async (fn, uid, body) => {
  const r = await fn({ httpMethod: 'POST', headers: { authorization: `Bearer ${uid}` }, body: JSON.stringify(body) });
  return JSON.parse(r.body);
};

// ── Robôs ──────────────────────────────────────────────────────
const botState = {};
const SHAPES = [
  (t) => [500 + 220 * Math.cos(t * 6.28), 375 + 160 * Math.sin(t * 6.28)],
  (t) => [150 + 700 * t, 375 + 120 * Math.sin(t * 18)],
  (t) => [300 + 400 * t, 200 + 350 * Math.abs(Math.sin(t * 9))],
];
const botLoop = async () => {
  const now = Date.now();
  for (const [k, r] of store.entries()) {
    if (!k.startsWith('game_rooms/') || k.split('/').length !== 2) continue;
    const bots = BOTS.filter((b) => r.players && r.players[b] && !r.players[b].left);
    for (const b of bots) store.set(`game_rooms/${r.id}/presence/${b}`, { at: now });
    if (r.status === 'lobby' || r.status === 'playing') {
      if (r.nextAt && now > r.nextAt + 400) await call(games, bots[0] || r.hostId, { action: 'tick', roomId: r.id }).catch(() => {});
    }
    if (r.status !== 'playing') continue;
    const s = store.get(`game_secrets/${r.id}`) || {};
    if (r.game === 'quiz' && r.phase === 'question') {
      for (const b of bots) {
        const key = `${r.id}|${r.q.n}|${b}`;
        if (!botState[key]) botState[key] = r.q.startsAt + 1500 + Math.random() * 9000;
        if (now > botState[key] && !(r.answered || {})[b]) {
          const right = s.questions[r.q.n].answer;
          await call(games, b, { action: 'answer', roomId: r.id, n: r.q.n, choice: Math.random() < 0.65 ? right : (right + 1) % 4 }).catch(() => {});
        }
      }
    }
    if (r.game === 'draw') {
      const drawerBot = bots.includes(r.drawer) ? r.drawer : null;
      if (drawerBot && r.phase === 'choose' && now > (r.nextAt - 12000)) await call(games, drawerBot, { action: 'pick', roomId: r.id, idx: 0, turn: r.turn }).catch(() => {});
      if (drawerBot && r.phase === 'draw') {
        const key = `${r.id}|draw|${r.turn}`;
        const st = botState[key] || (botState[key] = { t: 0, seq: now * 10, shape: SHAPES[r.turn % SHAPES.length] });
        if (st.t < 1) {
          const pts = [];
          for (let i = 0; i < 6 && st.t <= 1; i++, st.t += 0.012) { const [x, y] = st.shape(st.t); pts.push(Math.round(x), Math.round(y)); }
          store.set(`game_rooms/${r.id}/strokes/${drawerBot}_${r.turn}_${++st.seq}`, { turn: r.turn, seq: st.seq, uid: drawerBot, k: 'l', s: 'bot1', c: 6 + (r.turn % 4), w: 14, p: pts });
        }
      }
      if (r.phase === 'draw') {
        for (const b of bots) {
          if (b === r.drawer || (r.guessed || {})[b]) continue;
          const key = `${r.id}|g|${r.turn}|${b}`;
          if (!botState[key]) botState[key] = r.drawStartsAt + 8000 + Math.random() * 30000;
          if (now > botState[key]) { botState[key] = now + 6000; await call(games, b, { action: 'guess', roomId: r.id, text: Math.random() < 0.6 ? s.word.w : 'banana' }).catch(() => {}); }
        }
      }
    }
  }
};
setInterval(() => botLoop().catch((e) => console.error('bot', e)), 600);

// ── HTTP ───────────────────────────────────────────────────────
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(obj));
};
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    try {
      if (url.pathname === '/.netlify/functions/games' || url.pathname === '/.netlify/functions/duel') {
        const fn = url.pathname.endsWith('games') ? games : duel;
        const r = await fn({ httpMethod: 'POST', headers: { authorization: req.headers.authorization || '', origin: 'http://localhost:5173' }, body });
        res.writeHead(r.statusCode, { ...r.headers, 'Access-Control-Allow-Origin': '*' });
        return res.end(r.body);
      }
      if (url.pathname === '/__doc') return send(res, 200, { data: store.get(url.searchParams.get('path')) ?? null });
      if (url.pathname === '/__query') {
        const col = url.searchParams.get('col'), f = url.searchParams.get('f');
        let v = url.searchParams.get('v'); if (url.searchParams.get('num')) v = Number(v);
        const out = [...store.entries()].filter(([k, d]) => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/') && d[f] === v).map(([k, d]) => ({ id: k.slice(col.length + 1), ...d }));
        return send(res, 200, { docs: out });
      }
      if (url.pathname === '/__set') { const { path: p, data } = JSON.parse(body); store.set(p, data); return send(res, 200, { ok: true }); }
      if (url.pathname === '/__del') { store.delete(JSON.parse(body).path); return send(res, 200, { ok: true }); }
      if (url.pathname === '/__bots') {
        const room = store.get(`game_rooms/${url.searchParams.get('room')}`);
        for (const b of BOTS.slice(0, Number(url.searchParams.get('n') || 3))) await call(games, b, { action: 'join', roomId: room.id });
        return send(res, 200, { ok: true });
      }
      if (url.pathname === '/__invite') { // um robô convida você
        const r = await call(games, 'bia', { action: 'create', game: 'draw', mode: 'party' });
        await call(games, 'bia', { action: 'invite', roomId: r.room.id, to: 'me' });
        return send(res, 200, { ok: true, code: r.room.code });
      }
      send(res, 404, { error: 'nada aqui' });
    } catch (e) { console.error(e); send(res, 500, { error: String(e) }); }
  });
}).listen(8888, () => console.log('preview games em http://localhost:8888'));
