// ════════════════════════════════════════════════════════════════
// ANALYTICS — contas do Painel Admin
// ────────────────────────────────────────────────────────────────
// Só FUNÇÕES PURAS: recebem listas (alunos, acessos, histórico) e
// devolvem números prontos para os gráficos. Nada aqui fala com o
// Firebase — por isso dá para testar tudo em Node, sem navegador
// (ver test-analytics.mjs), e o painel fica só com a parte visual.
// ════════════════════════════════════════════════════════════════

// ── Fuso de São Paulo ──────────────────────────────────────────
// O app gravava datas em UTC, então "o dia" virava às 21h de
// Brasília. Tudo que é NOVO usa o dia de São Paulo. O Brasil não tem
// horário de verão desde 2019, então SP = UTC−3 fixo; se um dia
// voltar, basta trocar esta constante por um cálculo com Intl.
const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const spParts = (ts: number): { day: string; hour: number; weekday: number } => {
  const d = new Date(ts - SP_OFFSET_MS);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), weekday: d.getUTCDay() };
};

/** Timestamp da meia-noite (SP) do dia em que `ts` cai. */
export const spStartOfDay = (ts: number): number => {
  const shifted = ts - SP_OFFSET_MS;
  return shifted - (shifted % DAY_MS) + SP_OFFSET_MS;
};

const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// ── Tipos mínimos (só os campos que as contas usam) ────────────
export interface ASession {
  userId: string; startedAt: number; lastSeenAt: number; day: string; hour: number; weekday: number;
  activeMs: number; screens: Record<string, number>; visits: Record<string, number>;
  events: Record<string, number>; device: string;
}
export interface AHistory { userId: string; date: number; theme: string; level: string; topic?: string; score: number; total: number; type?: string; journey?: unknown }
export interface AUser {
  userId: string; username: string; fullName: string; email: string; createdAt?: number;
  accessStatus?: string; isAdmin?: boolean;
  gamification: { xp: number; streak: number; lastLoginDate: string | null; totalActivities?: number; placementResults?: Record<string, unknown>; lastPlacementLevel?: string; isPro?: boolean };
}

// ── Períodos ───────────────────────────────────────────────────
export type PeriodKey = 'today' | '7d' | '30d' | '90d';
export const PERIOD_LABEL: Record<PeriodKey, string> = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias' };
const PERIOD_DAYS: Record<PeriodKey, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };

export interface Range { from: number; to: number; prevFrom: number; prevTo: number; days: string[] }

/** Intervalo do período + o período anterior de mesmo tamanho (para o "▲ 12%"). */
export const periodRange = (period: PeriodKey, now: number = Date.now()): Range => {
  const n = PERIOD_DAYS[period];
  const todayStart = spStartOfDay(now);
  const from = todayStart - (n - 1) * DAY_MS;
  const to = todayStart + DAY_MS;
  const days: string[] = [];
  for (let i = 0; i < n; i++) days.push(spParts(from + i * DAY_MS + 1).day);
  return { from, to, prevFrom: from - n * DAY_MS, prevTo: from, days };
};

const inRange = (ts: number, from: number, to: number) => ts >= from && ts < to;
// Nota em %, sempre entre 0 e 100. O teto existe porque o histórico
// real tem registros de teste com nota absurda (ex.: 999999 de 10, dos
// testes antifraude do XP) — um único deles levava a "nota média" do
// painel para 8841%.
const pct = (h: AHistory) => (h.total > 0 ? Math.max(0, Math.min(100, Math.round((h.score / h.total) * 100))) : 0);
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const delta = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

// ── Catálogo de telas ──────────────────────────────────────────
// Nome técnico (o `status` do App) → nome que o Matheus reconhece.
// `feature: true` marca o que é uma ABA/recurso que o aluno escolhe
// abrir; o resto é passagem (carregando, resultado) e fica fora do
// ranking de "abas mais acessadas".
export const SCREEN_CATALOG: Record<string, { label: string; feature: boolean }> = {
  selection: { label: 'Início (prática livre)', feature: true },
  journey: { label: 'Journey to Fluency', feature: true },
  fred_explains: { label: 'Fred explica (catálogo)', feature: true },
  fred_lesson: { label: 'Fred explica (aula)', feature: true },
  placement_hub: { label: 'Nivelamento', feature: true },
  placement_test: { label: 'Nivelamento (prova)', feature: false },
  placement_result: { label: 'Nivelamento (resultado)', feature: false },
  dashboard: { label: 'Plano de estudos', feature: true },
  plan_setup: { label: 'Plano de estudos (criação)', feature: false },
  my_activities: { label: 'Minhas atividades', feature: true },
  profile: { label: 'Perfil', feature: true },
  challenges: { label: 'Desafios', feature: true },
  chat: { label: 'Chat entre alunos', feature: true },
  ranking_history: { label: 'Hall da Fama', feature: true },
  quiz: { label: 'Exercício (quiz)', feature: false },
  gapfill: { label: 'Exercício (lacunas)', feature: false },
  writing: { label: 'Exercício (escrita)', feature: false },
  results: { label: 'Resultado', feature: false },
  level_up: { label: 'Nova patente', feature: false },
  loading: { label: 'Espera (carregando)', feature: false },
  guide_selection: { label: 'Escolha do guia', feature: false },
  access_gate: { label: 'Aguardando aprovação', feature: false },
  error: { label: 'Tela de erro', feature: false },
};
export const screenLabel = (k: string) => SCREEN_CATALOG[k]?.label || k;

// ── Visão geral ────────────────────────────────────────────────
export interface Kpi { value: number; prev: number; delta: number | null }
export interface Overview {
  accesses: Kpi; activeStudents: Kpi; exercises: Kpi;
  avgSessionMin: Kpi;            // tempo ativo médio por acesso
  avgStudentDayMin: Kpi;         // tempo ativo médio por aluno, por dia em que ele usou
  totalHours: number;
  completionRate: number | null; // concluídos ÷ iniciados (eventos)
  abandoned: number; started: number; finished: number;
  avgScore: number | null;
  limitHits: number; extraBought: number; resumed: number;
  avgWaitSec: number | null;     // espera média por exercício (tela "loading")
  daily: { day: string; label: string; acessos: number; alunos: number; exercicios: number; minutos: number }[];
  screens: { key: string; label: string; minutes: number; visits: number; students: number; feature: boolean }[];
  unused: { key: string; label: string; students: number; share: number }[];
  heatmap: number[][];           // [diaDaSemana 0-6][hora 0-23] = acessos iniciados
  themes: { theme: string; count: number; avgPct: number; students: number }[];
  levels: { level: string; count: number }[];
  devices: { device: string; count: number }[];
  journeyShare: number | null;   // % dos exercícios que vieram da trilha
  trackingSince: number | null;
}

const kpi = (value: number, prev: number): Kpi => ({ value, prev, delta: delta(value, prev) });

const sessionStats = (ss: ASession[]) => {
  const activeMs = sum(ss.map(s => s.activeMs || 0));
  const studentDays = new Set(ss.map(s => `${s.userId}|${s.day}`)).size;
  return {
    count: ss.length, activeMs,
    avgSessionMin: ss.length ? activeMs / ss.length / 60000 : 0,
    avgStudentDayMin: studentDays ? activeMs / studentDays / 60000 : 0,
  };
};

export const buildOverview = (sessions: ASession[], history: AHistory[], totalStudents: number, range: Range): Overview => {
  const cur = sessions.filter(s => inRange(s.startedAt, range.from, range.to));
  const prev = sessions.filter(s => inRange(s.startedAt, range.prevFrom, range.prevTo));
  const hCur = history.filter(h => inRange(h.date, range.from, range.to));
  const hPrev = history.filter(h => inRange(h.date, range.prevFrom, range.prevTo));

  // "Aluno ativo" = teve acesso rastreado OU concluiu exercício. O
  // histórico existe desde o lançamento; o rastreamento, só a partir
  // de agora — juntar os dois evita um "zero" falso no passado.
  const activeSet = (ss: ASession[], hs: AHistory[]) => new Set([...ss.map(s => s.userId), ...hs.map(h => h.userId)]);
  const stCur = sessionStats(cur), stPrev = sessionStats(prev);

  const ev = (name: string) => sum(cur.map(s => s.events?.[name] || 0));
  const started = ev('ex_start'), finished = ev('ex_finish'), abandoned = ev('ex_abandon');

  // Série diária
  const byDay = new Map(range.days.map(d => [d, { acessos: 0, alunos: new Set<string>(), exercicios: 0, ms: 0 }]));
  cur.forEach(s => { const b = byDay.get(s.day); if (b) { b.acessos++; b.alunos.add(s.userId); b.ms += s.activeMs || 0; } });
  hCur.forEach(h => { const b = byDay.get(spParts(h.date).day); if (b) { b.exercicios++; b.alunos.add(h.userId); } });
  const daily = range.days.map(day => {
    const b = byDay.get(day)!;
    return { day, label: dayLabel(day), acessos: b.acessos, alunos: b.alunos.size, exercicios: b.exercicios, minutos: Math.round(b.ms / 60000) };
  });

  // Telas
  const scr = new Map<string, { ms: number; visits: number; students: Set<string> }>();
  cur.forEach(s => {
    const keys = new Set([...Object.keys(s.screens || {}), ...Object.keys(s.visits || {})]);
    keys.forEach(k => {
      const e = scr.get(k) || { ms: 0, visits: 0, students: new Set<string>() };
      e.ms += s.screens?.[k] || 0; e.visits += s.visits?.[k] || 0; e.students.add(s.userId);
      scr.set(k, e);
    });
  });
  const screens = [...scr.entries()].map(([key, e]) => ({
    key, label: screenLabel(key), minutes: Math.round(e.ms / 60000), visits: e.visits,
    students: e.students.size, feature: SCREEN_CATALOG[key]?.feature ?? false,
  })).sort((a, b) => b.visits - a.visits);

  // Abas que (quase) ninguém abre: recursos do catálogo usados por
  // menos de 15% dos alunos que acessaram no período.
  const trackedStudents = new Set(cur.map(s => s.userId)).size;
  const unused = Object.entries(SCREEN_CATALOG).filter(([k, c]) => c.feature && k !== 'selection').map(([key, c]) => {
    const students = scr.get(key)?.students.size || 0;
    return { key, label: c.label, students, share: trackedStudents ? Math.round((students / trackedStudents) * 100) : 0 };
  }).filter(u => u.share < 15).sort((a, b) => a.share - b.share);

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  cur.forEach(s => { if (heatmap[s.weekday]?.[s.hour] !== undefined) heatmap[s.weekday][s.hour]++; });

  const th = new Map<string, { count: number; pcts: number[]; students: Set<string> }>();
  hCur.forEach(h => {
    const e = th.get(h.theme) || { count: 0, pcts: [], students: new Set<string>() };
    e.count++; e.pcts.push(pct(h)); e.students.add(h.userId); th.set(h.theme, e);
  });
  const themes = [...th.entries()].map(([theme, e]) => ({ theme, count: e.count, avgPct: Math.round(sum(e.pcts) / e.pcts.length), students: e.students.size }))
    .sort((a, b) => b.count - a.count);

  const lv = new Map<string, number>();
  hCur.forEach(h => lv.set(h.level, (lv.get(h.level) || 0) + 1));
  const levels = [...lv.entries()].map(([level, count]) => ({ level, count })).sort((a, b) => a.level.localeCompare(b.level));

  const dv = new Map<string, number>();
  cur.forEach(s => dv.set(s.device || 'desktop', (dv.get(s.device || 'desktop') || 0) + 1));
  const devices = [...dv.entries()].map(([device, count]) => ({ device, count })).sort((a, b) => b.count - a.count);

  const loadingMs = sum(cur.map(s => s.screens?.loading || 0));
  void totalStudents;

  return {
    accesses: kpi(stCur.count, stPrev.count),
    activeStudents: kpi(activeSet(cur, hCur).size, activeSet(prev, hPrev).size),
    exercises: kpi(hCur.length, hPrev.length),
    avgSessionMin: kpi(Math.round(stCur.avgSessionMin * 10) / 10, Math.round(stPrev.avgSessionMin * 10) / 10),
    avgStudentDayMin: kpi(Math.round(stCur.avgStudentDayMin * 10) / 10, Math.round(stPrev.avgStudentDayMin * 10) / 10),
    totalHours: Math.round((stCur.activeMs / 3600000) * 10) / 10,
    completionRate: started > 0 ? Math.min(100, Math.round((finished / started) * 100)) : null,
    abandoned, started, finished,
    avgScore: hCur.length ? Math.round(sum(hCur.map(pct)) / hCur.length) : null,
    limitHits: ev('limit_hit'), extraBought: ev('extra_bought'), resumed: ev('ex_resume'),
    avgWaitSec: started > 0 && loadingMs > 0 ? Math.round(loadingMs / started / 1000) : null,
    daily, screens, unused, heatmap, themes, levels, devices,
    journeyShare: hCur.length ? Math.round((hCur.filter(h => !!h.journey).length / hCur.length) * 100) : null,
    trackingSince: sessions.length ? Math.min(...sessions.map(s => s.startedAt)) : null,
  };
};

// ── Alunos ─────────────────────────────────────────────────────
export type StudentStatus = 'ativo' | 'esfriando' | 'em_risco' | 'inativo' | 'nunca_praticou';
export const STATUS_META: Record<StudentStatus, { label: string; hint: string }> = {
  ativo: { label: 'Ativo', hint: 'usou nos últimos 7 dias' },
  esfriando: { label: 'Esfriando', hint: '8 a 14 dias sem usar' },
  em_risco: { label: 'Em risco', hint: '15 a 30 dias sem usar' },
  inativo: { label: 'Inativo', hint: 'mais de 30 dias sem usar' },
  nunca_praticou: { label: 'Nunca praticou', hint: 'criou a conta e não fez nenhum exercício' },
};

export interface StudentRow {
  userId: string; username: string; fullName: string; email: string;
  status: StudentStatus; lastSeen: number | null; daysAway: number | null;
  sessions30: number; minutes30: number; exercises30: number; avgPct30: number | null;
  exercisesPrev30: number; trend: number | null;
  totalExercises: number; xp: number; streak: number; isPro: boolean;
  accessStatus: string; favoriteTheme: string | null; createdAt: number | null;
}

export const buildStudentRows = (users: AUser[], sessions: ASession[], history: AHistory[], now: number = Date.now()): StudentRow[] => {
  const from30 = now - 30 * DAY_MS, from60 = now - 60 * DAY_MS;
  const sBy = new Map<string, ASession[]>(), hBy = new Map<string, AHistory[]>();
  sessions.forEach(s => { (sBy.get(s.userId) || sBy.set(s.userId, []).get(s.userId)!).push(s); });
  history.forEach(h => { (hBy.get(h.userId) || hBy.set(h.userId, []).get(h.userId)!).push(h); });

  return users.filter(u => !u.isAdmin && u.username.toLowerCase() !== 'admin').map(u => {
    const ss = sBy.get(u.userId) || [], hs = hBy.get(u.userId) || [];
    const s30 = ss.filter(s => s.startedAt >= from30);
    const h30 = hs.filter(h => h.date >= from30);
    const hPrev = hs.filter(h => h.date >= from60 && h.date < from30);

    // Último sinal: o mais recente entre acesso rastreado, exercício
    // concluído e a data de login antiga (só dia, sem hora).
    const loginTs = u.gamification.lastLoginDate ? Date.parse(`${u.gamification.lastLoginDate}T12:00:00-03:00`) : 0;
    const lastSeen = Math.max(0, ...ss.map(s => s.lastSeenAt), ...hs.map(h => h.date), loginTs || 0) || null;
    const daysAway = lastSeen ? Math.max(0, Math.floor((now - lastSeen) / DAY_MS)) : null;
    const totalExercises = Math.max(u.gamification.totalActivities || 0, hs.length);

    let status: StudentStatus;
    if (totalExercises === 0) status = 'nunca_praticou';
    else if (daysAway === null || daysAway > 30) status = 'inativo';
    else if (daysAway > 14) status = 'em_risco';
    else if (daysAway > 7) status = 'esfriando';
    else status = 'ativo';

    const themeCount = new Map<string, number>();
    h30.forEach(h => themeCount.set(h.theme, (themeCount.get(h.theme) || 0) + 1));
    const favoriteTheme = [...themeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return {
      userId: u.userId, username: u.username, fullName: u.fullName, email: u.email,
      status, lastSeen, daysAway,
      sessions30: s30.length, minutes30: Math.round(sum(s30.map(s => s.activeMs || 0)) / 60000),
      exercises30: h30.length, avgPct30: h30.length ? Math.round(sum(h30.map(pct)) / h30.length) : null,
      exercisesPrev30: hPrev.length, trend: delta(h30.length, hPrev.length),
      totalExercises, xp: u.gamification.xp || 0, streak: u.gamification.streak || 0, isPro: !!u.gamification.isPro,
      accessStatus: u.accessStatus || 'approved', favoriteTheme, createdAt: u.createdAt ?? null,
    };
  });
};

// ── Engajamento ────────────────────────────────────────────────
export interface Engagement {
  funnel: { step: string; count: number; pct: number }[];
  placementPct: number;            // fizeram algum nivelamento (fora do funil: não é etapa obrigatória)
  weekly: { label: string; alunos: number; exercicios: number }[];
  statusCounts: Record<StudentStatus, number>;
  stickiness: number | null;       // média de alunos/dia ÷ alunos no mês
  oneAndDone: number;              // fizeram 1–2 exercícios e sumiram
  returnRate: number | null;       // dos ativos na semana passada, quantos voltaram nesta
  newAccounts30: number;
}

export const buildEngagement = (users: AUser[], rows: StudentRow[], sessions: ASession[], history: AHistory[], now: number = Date.now()): Engagement => {
  const students = users.filter(u => !u.isAdmin && u.username.toLowerCase() !== 'admin');
  const total = students.length || 1;
  const hasPlacement = (u: AUser) => !!u.gamification.lastPlacementLevel || Object.keys(u.gamification.placementResults || {}).length > 0;
  const rowBy = new Map(rows.map(r => [r.userId, r]));
  const ex = (u: AUser) => rowBy.get(u.userId)?.totalExercises || 0;
  const steps: [string, number][] = [
    ['Criaram conta', students.length],
    ['1º exercício', students.filter(u => ex(u) >= 1).length],
    ['10 exercícios', students.filter(u => ex(u) >= 10).length],
    ['50 exercícios', students.filter(u => ex(u) >= 50).length],
    ['Ativos nos últimos 7 dias', rows.filter(r => r.status === 'ativo').length],
  ];
  const funnel = steps.map(([step, count]) => ({ step, count, pct: Math.round((count / total) * 100) }));

  // 12 semanas corridas (blocos de 7 dias terminando hoje)
  const end = spStartOfDay(now) + DAY_MS;
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const to = end - (11 - i) * 7 * DAY_MS, from = to - 7 * DAY_MS;
    const hs = history.filter(h => inRange(h.date, from, to));
    const ss = sessions.filter(s => inRange(s.startedAt, from, to));
    return { label: dayLabel(spParts(from + 1).day), alunos: new Set([...hs.map(h => h.userId), ...ss.map(s => s.userId)]).size, exercicios: hs.length };
  });

  const statusCounts: Record<StudentStatus, number> = { ativo: 0, esfriando: 0, em_risco: 0, inativo: 0, nunca_praticou: 0 };
  rows.forEach(r => { statusCounts[r.status]++; });

  const r30 = periodRange('30d', now);
  const mau = new Set([...history.filter(h => h.date >= r30.from).map(h => h.userId), ...sessions.filter(s => s.startedAt >= r30.from).map(s => s.userId)]);
  const perDay = r30.days.map(d => new Set([
    ...history.filter(h => spParts(h.date).day === d).map(h => h.userId),
    ...sessions.filter(s => s.day === d).map(s => s.userId),
  ]).size);
  const stickiness = mau.size ? Math.round((sum(perDay) / perDay.length / mau.size) * 100) : null;

  const w = (k: number) => { const to = end - k * 7 * DAY_MS, from = to - 7 * DAY_MS; return new Set([...history.filter(h => inRange(h.date, from, to)).map(h => h.userId), ...sessions.filter(s => inRange(s.startedAt, from, to)).map(s => s.userId)]); };
  const lastWeek = w(1), thisWeek = w(0);
  const returnRate = lastWeek.size ? Math.round(([...lastWeek].filter(id => thisWeek.has(id)).length / lastWeek.size) * 100) : null;

  return {
    funnel, weekly, statusCounts, stickiness,
    placementPct: Math.round((students.filter(hasPlacement).length / total) * 100),
    oneAndDone: rows.filter(r => r.totalExercises >= 1 && r.totalExercises <= 2 && (r.daysAway ?? 99) > 14).length,
    returnRate,
    newAccounts30: students.filter(u => (u.createdAt || 0) >= now - 30 * DAY_MS).length,
  };
};

// ── Detalhe de um aluno ────────────────────────────────────────
export interface StudentDetail {
  daily: { label: string; minutos: number; exercicios: number }[];
  screens: { key: string; label: string; minutes: number; visits: number }[];
  neverOpened: string[];
  themes: { theme: string; count: number; avgPct: number }[];
  scoreTrend: { label: string; pct: number }[];
  bestHour: number | null;
  totalMinutes: number; avgSessionMin: number; sessions: number;
  abandoned: number; started: number;
  devices: string[];
}

export const buildStudentDetail = (sessions: ASession[], history: AHistory[], now: number = Date.now()): StudentDetail => {
  const r = periodRange('30d', now);
  const byDay = new Map(r.days.map(d => [d, { ms: 0, ex: 0 }]));
  sessions.forEach(s => { const b = byDay.get(s.day); if (b) b.ms += s.activeMs || 0; });
  history.forEach(h => { const b = byDay.get(spParts(h.date).day); if (b) b.ex++; });

  const scr = new Map<string, { ms: number; visits: number }>();
  sessions.forEach(s => Object.keys({ ...s.screens, ...s.visits }).forEach(k => {
    const e = scr.get(k) || { ms: 0, visits: 0 };
    e.ms += s.screens?.[k] || 0; e.visits += s.visits?.[k] || 0; scr.set(k, e);
  }));

  const th = new Map<string, number[]>();
  history.forEach(h => { (th.get(h.theme) || th.set(h.theme, []).get(h.theme)!).push(pct(h)); });

  const hours = Array(24).fill(0) as number[];
  sessions.forEach(s => { hours[s.hour] = (hours[s.hour] || 0) + 1; });
  const maxHour = Math.max(...hours);
  const ms = sum(sessions.map(s => s.activeMs || 0));

  return {
    daily: r.days.map(d => ({ label: dayLabel(d), minutos: Math.round(byDay.get(d)!.ms / 60000), exercicios: byDay.get(d)!.ex })),
    screens: [...scr.entries()].map(([key, e]) => ({ key, label: screenLabel(key), minutes: Math.round(e.ms / 60000), visits: e.visits })).sort((a, b) => b.visits - a.visits),
    neverOpened: sessions.length ? Object.entries(SCREEN_CATALOG).filter(([k, c]) => c.feature && !scr.has(k)).map(([, c]) => c.label) : [],
    themes: [...th.entries()].map(([theme, p]) => ({ theme, count: p.length, avgPct: Math.round(sum(p) / p.length) })).sort((a, b) => b.count - a.count),
    scoreTrend: [...history].sort((a, b) => a.date - b.date).slice(-20).map(h => ({ label: dayLabel(spParts(h.date).day), pct: pct(h) })),
    bestHour: maxHour > 0 ? hours.indexOf(maxHour) : null,
    totalMinutes: Math.round(ms / 60000), avgSessionMin: sessions.length ? Math.round((ms / sessions.length / 60000) * 10) / 10 : 0,
    sessions: sessions.length,
    abandoned: sum(sessions.map(s => s.events?.ex_abandon || 0)), started: sum(sessions.map(s => s.events?.ex_start || 0)),
    devices: [...new Set(sessions.map(s => s.device))],
  };
};

// ── Utilidades de exibição ─────────────────────────────────────
// O campo "age" do cadastro guarda, na prática, a DATA DE NASCIMENTO
// ("1994-09-15") na maioria das contas e um número em algumas antigas.
// Devolve "31 anos" nos dois casos, ou '' se não der para entender.
export const ageLabel = (age: string | undefined | null, now: number = Date.now()): string => {
  if (!age) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(age);
  if (m) {
    const today = new Date(now - SP_OFFSET_MS);
    let years = today.getUTCFullYear() - Number(m[1]);
    const beforeBirthday = today.getUTCMonth() + 1 < Number(m[2]) || (today.getUTCMonth() + 1 === Number(m[2]) && today.getUTCDate() < Number(m[3]));
    if (beforeBirthday) years--;
    return years >= 0 && years < 120 ? `${years} anos` : '';
  }
  return /^\d{1,3}$/.test(age.trim()) ? `${age.trim()} anos` : '';
};

export const fmtMinutes = (min: number): string => {
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h}h ${m}min` : `${h}h`;
};

export const fmtAgo = (ts: number | null, now: number = Date.now()): string => {
  if (!ts) return 'nunca';
  const diff = now - ts;
  if (diff < 5 * 60000) return 'agora';
  if (diff < 3600000) return `há ${Math.round(diff / 60000)} min`;
  if (spParts(ts).day === spParts(now).day) return `hoje, ${String(spParts(ts).hour).padStart(2, '0')}h`;
  const days = Math.floor((spStartOfDay(now) - spStartOfDay(ts)) / DAY_MS);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return `há ${Math.floor(days / 30)} ${Math.floor(days / 30) === 1 ? 'mês' : 'meses'}`;
};

/** CSV com ; (é o separador que o Excel em português abre direto). */
export const toCsv = (rows: (string | number | null)[][]): string =>
  '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
