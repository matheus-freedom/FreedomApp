import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import {
  ArrowLeft, AtSign, MessageSquare, Key, Zap, Ban, ShieldCheck, Crown, X, Send, Loader2, Timer, CheckSquare,
  Flame, Coins, Target, LayoutGrid, BookOpen, TrendingUp, History, Activity, PenTool, Smartphone, Monitor, GraduationCap, Check,
} from 'lucide-react';
import { UserSession, ActivityRecord, Level, Theme, AccessType } from '../../types';
import { api } from '../../services/api';
import { showToast } from '../Toast';
import { StudentRow, STATUS_META, buildStudentDetail, fmtAgo, fmtMinutes, spParts, ASession } from '../../services/analytics';
import { Section, Pill, Avatar, BarList, ChartTip, Empty, C, axisProps, ACCESS_LABEL } from './ui';

// ════════════════════════════════════════════════════════════════
// FICHA DO ALUNO — tudo sobre UM aluno: uso, desempenho, acessos,
// histórico e as ações do administrador (mensagem, senha, saldo,
// PRO, tipo de acesso, bloquear/desbloquear).
// ════════════════════════════════════════════════════════════════

interface Props {
  user: UserSession;
  row?: StudentRow;
  onBack: () => void;
  onChanged: () => void; // pede ao painel para recarregar os dados
}

const SKILL_LABEL: Record<string, string> = { grammar: 'Gramática', reading: 'Leitura', listening: 'Listening', writing: 'Escrita' };

const StudentDetail: React.FC<Props> = ({ user, row, onBack, onChanged }) => {
  const [sessions, setSessions] = useState<ASession[]>([]);
  const [history, setHistory] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | 'message' | 'password' | 'balance' | 'block'>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [xpDelta, setXpDelta] = useState(0);
  const [frDelta, setFrDelta] = useState(0);
  const [filterLevel, setFilterLevel] = useState<Level | 'All'>('All');
  const [filterTheme, setFilterTheme] = useState<Theme | 'All'>('All');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.admin_getUserSessions(user.userId).catch(() => []), api.admin_getUserHistory(user.userId).catch(() => [])])
      .then(([s, h]) => { if (alive) { setSessions(s as ASession[]); setHistory(h); setLoading(false); } });
    return () => { alive = false; };
  }, [user.userId]);

  const detail = useMemo(
    () => buildStudentDetail(sessions, history.map(h => ({ ...h, userId: user.userId }))),
    [sessions, history, user.userId]
  );
  const filteredHistory = useMemo(
    () => history.filter(r => (filterLevel === 'All' || r.level === filterLevel) && (filterTheme === 'All' || r.theme === filterTheme)),
    [history, filterLevel, filterTheme]
  );

  const access = user.accessStatus ?? 'approved';
  const isBlocked = access === 'blocked';
  const avgAll = history.length ? Math.round(history.reduce((a, h) => a + (h.total ? (h.score / h.total) * 100 : 0), 0) / history.length) : null;
  const placement = Object.entries((user.gamification.placementResults || {}) as Record<string, any>);

  // Roda uma ação do admin com trava de clique duplo, aviso e recarga.
  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); showToast(okMsg, 'success'); setModal(null); setText(''); setXpDelta(0); setFrDelta(0); onChanged(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não consegui concluir a operação.', 'error', 7000); }
    setBusy(false);
  };

  const actionBtn = 'px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border disabled:opacity-50';

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Voltar para a lista
      </button>

      {/* ── Cabeçalho ── */}
      <div className="bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 p-6 md:p-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
          <Avatar photo={user.profilePhoto} name={user.fullName} size="w-24 h-24" big />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-2xl font-black text-white leading-tight">{user.fullName}</h2>
              {row && access === 'approved' && <Pill kind={row.status} title={STATUS_META[row.status].hint}>{STATUS_META[row.status].label}</Pill>}
              {access !== 'approved' && <Pill kind={access}>{ACCESS_LABEL[access]}</Pill>}
              {user.gamification.isPro && <Pill kind="approved"><Crown className="w-3 h-3" /> PRO</Pill>}
              {user.accessType === AccessType.CHALLENGE_ONLY && <Pill kind="new">Só desafios</Pill>}
            </div>
            <p className="text-[#f7931e] text-[11px] font-black flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex items-center gap-1"><AtSign className="w-3.5 h-3.5" />{user.username}</span>
              <span className="text-gray-700">•</span><span className="text-gray-400 font-bold">{user.email}</span>
            </p>
            <p className="text-[11px] text-gray-500 font-medium mt-2">
              Último acesso: <span className="text-gray-300 font-bold">{fmtAgo(row?.lastSeen ?? null)}</span>
              {user.createdAt && <> · conta criada em <span className="text-gray-300 font-bold">{new Date(user.createdAt).toLocaleDateString('pt-BR')}</span></>}
              {user.age && <> · {user.age} anos</>}
              {detail.bestHour !== null && <> · costuma entrar às <span className="text-gray-300 font-bold">{detail.bestHour}h</span></>}
            </p>
            {isBlocked && user.blockReason && <p className="text-[11px] text-red-300 mt-2">Motivo do bloqueio: {user.blockReason}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-white/5">
          <button onClick={() => setModal('message')} className={`${actionBtn} bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500 hover:text-white`}><MessageSquare className="w-3.5 h-3.5" /> Mensagem</button>
          <button onClick={() => setModal('balance')} className={`${actionBtn} bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500 hover:text-white`}><Zap className="w-3.5 h-3.5" /> XP e FR$</button>
          <button onClick={() => setModal('password')} className={`${actionBtn} bg-white/5 text-gray-300 border-white/10 hover:bg-white hover:text-[#222222]`}><Key className="w-3.5 h-3.5" /> Senha provisória</button>
          <button disabled={busy} onClick={() => run(() => api.admin_setPro(user.userId, !user.gamification.isPro), user.gamification.isPro ? 'PRO desligado.' : 'PRO ligado: sem limite diário.')}
            className={`${actionBtn} bg-white/5 text-gray-300 border-white/10 hover:bg-white hover:text-[#222222]`}><Crown className="w-3.5 h-3.5" /> {user.gamification.isPro ? 'Tirar PRO' : 'Dar PRO'}</button>
          <button disabled={busy} onClick={() => run(() => api.admin_setAccessType(user.userId, user.accessType === AccessType.CHALLENGE_ONLY ? AccessType.FULL : AccessType.CHALLENGE_ONLY), 'Tipo de acesso alterado.')}
            className={`${actionBtn} bg-white/5 text-gray-300 border-white/10 hover:bg-white hover:text-[#222222]`}><ShieldCheck className="w-3.5 h-3.5" /> {user.accessType === AccessType.CHALLENGE_ONLY ? 'Liberar acesso completo' : 'Limitar a desafios'}</button>
          {access === 'pending' || access === 'rejected' || access === 'new' ? (
            <button disabled={busy} onClick={() => run(() => api.admin_decideAccess(user.userId, 'approve'), `${user.fullName} foi aprovado(a).`)}
              className={`${actionBtn} bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500 hover:text-white`}><Check className="w-3.5 h-3.5" /> Aprovar acesso</button>
          ) : isBlocked ? (
            <button disabled={busy} onClick={() => run(() => api.admin_decideAccess(user.userId, 'unblock'), 'Acesso desbloqueado.')}
              className={`${actionBtn} bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500 hover:text-white`}><ShieldCheck className="w-3.5 h-3.5" /> Desbloquear</button>
          ) : (
            <button onClick={() => setModal('block')} className={`${actionBtn} bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500 hover:text-white ml-auto`}><Ban className="w-3.5 h-3.5" /> Bloquear acesso</button>
          )}
        </div>
      </div>

      {/* ── Números ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { i: <Zap className="w-4 h-4" />, l: 'XP total', v: user.gamification.xp.toLocaleString('pt-BR') },
          { i: <Coins className="w-4 h-4" />, l: 'Freedom Reais', v: `FR$ ${(user.gamification.frBalance || 0).toFixed(2)}` },
          { i: <Flame className="w-4 h-4" />, l: 'Ofensiva', v: `${user.gamification.streak || 0} dia${user.gamification.streak === 1 ? '' : 's'}` },
          { i: <CheckSquare className="w-4 h-4" />, l: 'Exercícios', v: String(Math.max(history.length, user.gamification.totalActivities || 0)) },
          { i: <Target className="w-4 h-4" />, l: 'Nota média', v: avgAll !== null ? `${avgAll}%` : '—' },
          { i: <Activity className="w-4 h-4" />, l: 'Acessos', v: String(detail.sessions) },
          { i: <Timer className="w-4 h-4" />, l: 'Tempo total', v: detail.totalMinutes ? fmtMinutes(detail.totalMinutes) : '—' },
          { i: <Timer className="w-4 h-4" />, l: 'Média por acesso', v: detail.avgSessionMin ? fmtMinutes(detail.avgSessionMin) : '—' },
        ].map(k => (
          <div key={k.l} className="bg-[#2a2a2a] border border-white/5 rounded-2xl p-4">
            <div className="text-[#f7931e] mb-2">{k.i}</div>
            <p className="text-lg font-black text-white tabular-nums leading-none">{k.v}</p>
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-1.5">{k.l}</p>
          </div>
        ))}
      </div>

      {loading ? <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#f7931e]" /></div> : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section title="Exercícios por dia (30 dias)" icon={<CheckSquare className="w-4 h-4 text-[#f7931e]" />}>
              <div className="h-44"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.daily} barCategoryGap="15%">
                  <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axisProps} minTickGap={28} /><YAxis allowDecimals={false} width={24} {...axisProps} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="exercicios" name="Exercícios" fill={C.series[1]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer></div>
            </Section>
            <Section title="Minutos no app por dia (30 dias)" icon={<Timer className="w-4 h-4 text-[#f7931e]" />}>
              <div className="h-44"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.daily} barCategoryGap="15%">
                  <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axisProps} minTickGap={28} /><YAxis allowDecimals={false} width={24} {...axisProps} />
                  <Tooltip content={<ChartTip unit=" min" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="minutos" name="Tempo ativo" fill={C.brand} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer></div>
            </Section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Section title="Por onde anda no app" icon={<LayoutGrid className="w-4 h-4 text-[#f7931e]" />} hint="Telas mais abertas por este aluno(a).">
              <BarList empty="Ainda sem acessos rastreados." rows={detail.screens.filter(s => s.key !== 'loading').slice(0, 8).map(s => ({ label: s.label, value: s.visits, right: `${s.visits}×`, sub: fmtMinutes(s.minutes) }))} />
              {detail.neverOpened.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/5">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Nunca abriu</p>
                  <div className="flex flex-wrap gap-1.5">{detail.neverOpened.map(n => <span key={n} className="px-2.5 py-1 bg-[#222222] border border-white/5 rounded-lg text-[10px] font-bold text-gray-400">{n}</span>)}</div>
                </div>
              )}
            </Section>

            <Section title="Habilidades praticadas" icon={<BookOpen className="w-4 h-4 text-[#f7931e]" />} hint="Quantidade e nota média em cada uma.">
              <BarList color={C.series[0]} empty="Nenhum exercício concluído." rows={detail.themes.map(t => ({ label: t.theme, value: t.count, right: `${t.count}`, sub: `média ${t.avgPct}%` }))} />
              {detail.started > 0 && <p className="text-[11px] text-gray-500 mt-5 pt-4 border-t border-white/5">Abandonou <span className="text-white font-black">{detail.abandoned}</span> de {detail.started} exercícios iniciados.</p>}
            </Section>

            <Section title="Evolução das notas" icon={<TrendingUp className="w-4 h-4 text-[#f7931e]" />} hint="Últimos 20 exercícios. A linha tracejada marca 70%.">
              {detail.scoreTrend.length < 2 ? <Empty text="Precisa de pelo menos 2 exercícios." /> : (
                <div className="h-48"><ResponsiveContainer width="100%" height="100%">
                  <LineChart data={detail.scoreTrend.map((p, i) => ({ ...p, n: i + 1 }))}>
                    <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="n" {...axisProps} /><YAxis domain={[0, 100]} width={28} {...axisProps} />
                    <ReferenceLine y={70} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
                    <Tooltip content={<ChartTip unit="%" />} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} />
                    <Line type="monotone" dataKey="pct" name="Nota" stroke={C.series[2]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer></div>
              )}
              {placement.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Nivelamento</p>
                  <div className="flex flex-wrap gap-1.5">{placement.map(([skill, r]) => <span key={skill} className="px-2.5 py-1 bg-[#222222] border border-white/5 rounded-lg text-[10px] font-bold text-gray-300">{SKILL_LABEL[skill] || skill}: <span className="text-[#f7931e] font-black">{r?.level}</span></span>)}</div>
                </div>
              )}
            </Section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section title="Últimos acessos" icon={<History className="w-4 h-4 text-[#f7931e]" />} hint="Cada linha é uma visita ao app: quando, por quanto tempo e o que fez.">
              {sessions.length === 0 ? <Empty text="Nenhum acesso rastreado ainda." /> : (
                <div className="max-h-[420px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                  {sessions.slice(0, 40).map(s => {
                    const p = spParts(s.startedAt);
                    const opened = Object.keys(s.visits || {}).length;
                    return (
                      <div key={s.startedAt} className="flex items-center gap-3 bg-[#222222] border border-white/5 rounded-2xl px-4 py-3">
                        <div className="text-gray-500 shrink-0">{s.device === 'desktop' ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-white">{p.day.slice(8, 10)}/{p.day.slice(5, 7)} às {String(p.hour).padStart(2, '0')}h{String(new Date(s.startedAt).getMinutes()).padStart(2, '0')}</p>
                          <p className="text-[10px] font-bold text-gray-500 truncate">{opened} tela{opened === 1 ? '' : 's'} · {s.events?.ex_finish || 0} de {s.events?.ex_start || 0} exercícios concluídos</p>
                        </div>
                        <span className="text-xs font-black text-[#f7931e] tabular-nums shrink-0">{fmtMinutes((s.activeMs || 0) / 60000)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Registro de atividades" icon={<Activity className="w-4 h-4 text-[#f7931e]" />} hint={`${history.length} exercícios concluídos no total.`}
              right={
                <div className="flex gap-2">
                  <select value={filterLevel} onChange={e => setFilterLevel(e.target.value as any)} className="bg-[#222222] border border-white/5 text-gray-400 text-[10px] font-black p-2 rounded-xl outline-none">
                    <option value="All">Nível</option>{Object.values(Level).map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <select value={filterTheme} onChange={e => setFilterTheme(e.target.value as any)} className="bg-[#222222] border border-white/5 text-gray-400 text-[10px] font-black p-2 rounded-xl outline-none">
                    <option value="All">Habilidade</option>{Object.values(Theme).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              }>
              {filteredHistory.length === 0 ? <Empty text="Nenhuma atividade com estes filtros." /> : (
                <div className="max-h-[420px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                  {filteredHistory.slice(0, 150).map(rec => {
                    const pc = Math.round((rec.score / (rec.total || 1)) * 100);
                    return (
                      <div key={rec.id} className="flex items-center gap-3 bg-[#222222] border border-white/5 rounded-2xl px-4 py-3">
                        <div className="w-9 h-9 rounded-xl bg-[#333333] flex items-center justify-center shrink-0 text-[#f7931e]">{rec.theme === Theme.Writing ? <PenTool className="w-4 h-4" /> : <Activity className="w-4 h-4" />}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-white truncate">{rec.topic}</p>
                          <p className="text-[10px] font-bold text-gray-500 truncate"><span className="text-[#f7931e]">{rec.level}</span> · {rec.theme} · {new Date(rec.date).toLocaleDateString('pt-BR')} {new Date(rec.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{rec.xpGained === 0 ? ' · repetição' : ''}</p>
                        </div>
                        <span className={`text-sm font-black tabular-nums shrink-0 ${pc >= 70 ? 'text-green-400' : 'text-gray-300'}`}>{pc}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </>
      )}

      {/* ── Modais ── */}
      {modal && (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in" onClick={() => !busy && setModal(null)}>
          <div className="bg-[#2a2a2a] w-full max-w-md rounded-[2.5rem] border border-white/10 p-8 shadow-2xl animate-pop" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter">
                {{ message: 'Enviar mensagem', password: 'Senha provisória', balance: 'Ajustar XP e FR$', block: 'Bloquear acesso' }[modal]}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-white"><X /></button>
            </div>
            <p className="text-[11px] text-gray-400 mb-5 leading-relaxed">
              {{
                message: <>O aviso aparece para <b className="text-white">{user.fullName}</b> dentro do app.</>,
                password: <>Define uma nova senha para <b className="text-white">{user.email}</b>. Passe a senha ao aluno e peça para ele trocar depois. Mínimo de 6 caracteres.</>,
                balance: <>Use valores negativos para remover. O saldo nunca fica abaixo de zero.</>,
                block: <><b className="text-white">{user.fullName}</b> sai do app na hora e não consegue mais entrar até você desbloquear. O progresso dele fica guardado.</>,
              }[modal]}
            </p>

            {modal === 'message' && <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Escreva sua mensagem para o aluno..." className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl p-4 h-36 focus:border-blue-500 outline-none text-sm resize-none" />}
            {modal === 'password' && <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Ex: Freedom2026" className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-[#f7931e] outline-none text-sm" />}
            {modal === 'block' && <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Motivo (opcional, só você vê)" className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-red-500 outline-none text-sm" />}
            {modal === 'balance' && (
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">XP
                  <input type="number" value={xpDelta} onChange={e => setXpDelta(parseInt(e.target.value) || 0)} className="mt-1.5 w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-3.5 px-4 focus:border-orange-500 outline-none text-sm" /></label>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">FR$ (Freedom Reais)
                  <input type="number" step="0.01" value={frDelta} onChange={e => setFrDelta(parseFloat(e.target.value) || 0)} className="mt-1.5 w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-3.5 px-4 focus:border-orange-500 outline-none text-sm" /></label>
              </div>
            )}

            <button disabled={busy || (modal === 'message' && !text.trim()) || (modal === 'password' && text.length < 6) || (modal === 'balance' && !xpDelta && !frDelta)}
              onClick={() => {
                if (modal === 'message') run(() => api.admin_sendNotification(user.userId, text.trim()), 'Mensagem enviada para o aluno!');
                if (modal === 'password') run(() => api.admin_resetUserPassword(user.userId, text), `Senha de ${user.email} alterada.`);
                if (modal === 'balance') run(() => api.admin_updateUserGamification(user.userId, xpDelta, frDelta), 'Saldo atualizado.');
                if (modal === 'block') run(() => api.admin_decideAccess(user.userId, 'block', { reason: text.trim() }), `${user.fullName} foi bloqueado(a).`);
              }}
              className={`mt-5 w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${modal === 'block' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#f7931e] text-[#222222] hover:scale-[1.02]'}`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : modal === 'message' ? <Send className="w-4 h-4" /> : modal === 'block' ? <Ban className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              {{ message: 'Enviar agora', password: 'Definir senha', balance: 'Salvar ajuste', block: 'Bloquear agora' }[modal]}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDetail;
