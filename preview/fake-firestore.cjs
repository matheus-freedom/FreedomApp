// Firestore FALSO, em memória (não vai para produção).
// Usado por test-games.mjs e preview/games-server.cjs para rodar a
// function games.js de verdade sem tocar no banco da escola.
// Imita o que as functions usam do Admin SDK: doc/collection,
// subcoleções, where('==' | 'array-contains'), add, create, update
// com "campo.sub", e transações — inclusive a regra do Firestore de
// que, numa transação, toda leitura vem ANTES de qualquer escrita
// (se a function violar, este fake lança erro, como o real).
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

const makeDb = () => {
  const store = new Map();
  let lock = Promise.resolve();
  let autoId = 0;

  const setPath = (obj, dotted, val) => {
    const parts = dotted.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = val;
  };
  const write = (path, data, opts) => {
    store.set(path, opts && opts.merge ? deepMerge(clone(store.get(path)) || {}, clone(data)) : clone(data));
  };
  const deepMerge = (a, b) => {
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) a[k] = deepMerge(a[k], v);
      else a[k] = v;
    }
    return a;
  };
  const update = (path, data) => {
    const cur = store.get(path);
    if (cur === undefined) { const e = new Error('NOT_FOUND'); e.code = 5; throw e; }
    const next = clone(cur);
    for (const [k, v] of Object.entries(data)) setPath(next, k, clone(v));
    store.set(path, next);
  };
  const create = (path, data) => {
    if (store.has(path)) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
    store.set(path, clone(data));
  };

  const snapOf = (path) => {
    const v = store.get(path);
    const id = path.split('/').pop();
    return { exists: v !== undefined, id, data: () => clone(v), ref: docRef(path) };
  };
  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => snapOf(path),
    set: async (d, o) => write(path, d, o),
    update: async (d) => update(path, d),
    create: async (d) => create(path, d),
    delete: async () => { store.delete(path); },
    collection: (name) => collection(`${path}/${name}`),
  });
  const directChildren = (col) => [...store.keys()].filter((k) => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/'));
  const query = (col, filters) => ({
    _isQuery: true,
    where: (f, op, v) => query(col, [...filters, [f, op, v]]),
    get: async () => ({
      docs: directChildren(col).filter((k) => filters.every(([f, op, v]) => {
        const val = store.get(k)[f];
        if (op === '==') return val === v;
        if (op === 'array-contains') return Array.isArray(val) && val.includes(v);
        throw new Error('op não suportado no fake: ' + op);
      })).map(snapOf),
    }),
  });
  const collection = (col) => ({
    doc: (id) => docRef(`${col}/${id}`),
    where: (f, op, v) => query(col, [[f, op, v]]),
    get: () => query(col, []).get(),
    add: async (d) => { const id = `auto${++autoId}`; write(`${col}/${id}`, d); return docRef(`${col}/${id}`); },
  });

  // Transações em fila (uma de cada vez), como se fossem travas.
  const runTransaction = (fn) => {
    const run = async () => {
      const pending = [];
      let wrote = false;
      const guardRead = () => { if (wrote) throw new Error('Firestore transactions require all reads to be executed before all writes.'); };
      const tx = {
        get: async (r) => { guardRead(); return r._isQuery ? r.get() : r.get(); },
        set: (r, d, o) => { wrote = true; pending.push(() => write(r.path, d, o)); },
        update: (r, d) => { wrote = true; pending.push(() => update(r.path, d)); },
        create: (r, d) => { wrote = true; pending.push(() => create(r.path, d)); },
        delete: (r) => { wrote = true; pending.push(() => store.delete(r.path)); },
      };
      const out = await fn(tx);
      pending.forEach((f) => f());
      return out;
    };
    const p = lock.then(run, run);
    lock = p.catch(() => {});
    return p;
  };

  return { db: { collection, runTransaction }, store, raw: { write, update, clone } };
};

// Faz o require('firebase-admin/...') das functions cair neste fake.
const installFakeAdmin = (db, rootDir) => {
  const path = require('path');
  const fake = (name, exp) => {
    const p = require.resolve(name, { paths: [path.resolve(rootDir)] });
    require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
  };
  fake('firebase-admin/app', { initializeApp: () => {}, getApps: () => [1], cert: () => ({}) });
  fake('firebase-admin/firestore', { getFirestore: () => db });
  fake('firebase-admin/auth', { getAuth: () => ({ verifyIdToken: async (t) => ({ uid: t }) }) });
  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_PRIVATE_KEY = 'x';
};

module.exports = { makeDb, installFakeAdmin };
