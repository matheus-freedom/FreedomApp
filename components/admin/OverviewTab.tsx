import React from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { LogIn, Users, CheckSquare, Timer, Hourglass, Target, LayoutGrid, EyeOff, CalendarClock, BookOpen, Activity, Smartphone, Info, Layers } from 'lucide-react';
import { Overview, PeriodKey, PERIOD_LABEL, fmtMinutes } from '../../services/analytics';
import { Section, KpiCard, ChartTip, BarList, Heatmap, Empty, C, axisProps } from './ui';

// ════════════════════════════════════════════════════════════════
// ABA "VISÃO GERAL" — o pulso da plataforma no período escolhido
// ════════════════════════════════════════════════════════════════

interface Props { data: Overview; period: PeriodKey; totalStudents: number }

// Texto da legenda em cinza: quem carrega a cor é a bolinha, não a palavra.
const legendText = (value: string) => <span style={{ color: '#c9c9c9' }}>{value}</span>;

const DEVICE_LABEL: Record<string, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet' };

const OverviewTab: React.FC<Props> = ({ data, period, totalStudents }) => {
  const isToday = period === 'today';
  const prevLabel = isToday ? 'vs. ontem' : `vs. ${PERIOD_LABEL[period]} anteriores`;
  const features = data.screens.filter(s => s.feature);
  const few = data.daily.length <= 7;
  const noTracking = data.trackingSince === null;

  return (
    <div className="space-y-6 animate-fade-in">
      {noTracking && (
        <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-100 leading-relaxed">
            <span className="font-black">O rastreamento de acessos começa a contar a partir de agora.</span> Exercícios, notas e alunos ativos já aparecem
            (vêm do histórico, que existe desde o lançamento). Acessos, tempo de permanência e abas visitadas vão se preenchendo conforme os alunos usarem esta nova versão.
          </p>
        </div>
      )}

      {/* ── Números-chave ── */}
      <div>
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Comparação {prevLabel}</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="Acessos" value={String(data.accesses.value)} delta={data.accesses.delta} icon={<LogIn className="w-5 h-5" />} sub="voltar em menos de 30 min conta como o mesmo acesso" />
          <KpiCard label="Alunos ativos" value={`${data.activeStudents.value}`} delta={data.activeStudents.delta} icon={<Users className="w-5 h-5" />} sub={`de ${totalStudents} cadastrados (${totalStudents ? Math.round((data.activeStudents.value / totalStudents) * 100) : 0}%)`} />
          <KpiCard label="Exercícios feitos" value={String(data.exercises.value)} delta={data.exercises.delta} icon={<CheckSquare className="w-5 h-5" />} sub={data.avgScore !== null ? `nota média ${data.avgScore}%` : undefined} />
          <KpiCard label="Tempo médio por acesso" value={fmtMinutes(data.avgSessionMin.value)} delta={data.avgSessionMin.delta} icon={<Timer className="w-5 h-5" />} sub="só tempo ativo: aba esquecida aberta não conta" />
          <KpiCard label="Tempo por aluno / dia" value={fmtMinutes(data.avgStudentDayMin.value)} delta={data.avgStudentDayMin.delta} icon={<Hourglass className="w-5 h-5" />} sub={`${data.totalHours}h de estudo somadas`} />
          <KpiCard label="Conclusão de exercícios" value={data.completionRate !== null ? `${data.completionRate}%` : '—'} showDelta={false} icon={<Target className="w-5 h-5" />} sub={data.started ? `${data.finished} concluídos de ${data.started} iniciados` : 'aparece quando houver exercícios rastreados'} />
        </div>
      </div>

      {/* ── Evolução diária ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Section className="xl:col-span-2" title="Acessos, alunos e exercícios por dia" icon={<Activity className="w-4 h-4 text-[#f7931e]" />}
          hint="As três linhas usam a mesma escala (quantidade). Passe o mouse para ver o dia.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {few ? (
                <BarChart data={data.daily} barGap={2} barCategoryGap="24%">
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} formatter={legendText} />
                  <Bar dataKey="acessos" name="Acessos" fill={C.series[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="exercicios" name="Exercícios" fill={C.series[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="alunos" name="Alunos ativos" fill={C.series[2]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              ) : (
                <LineChart data={data.daily}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 700 }} formatter={legendText} />
                  <Line type="monotone" dataKey="acessos" name="Acessos" stroke={C.series[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="exercicios" name="Exercícios" stroke={C.series[1]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="alunos" name="Alunos ativos" stroke={C.series[2]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Minutos de estudo por dia" icon={<Timer className="w-4 h-4 text-[#f7931e]" />} hint="Soma do tempo ativo de todos os alunos.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} barCategoryGap={few ? '30%' : '12%'}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                <YAxis allowDecimals={false} width={32} {...axisProps} />
                <Tooltip content={<ChartTip unit=" min" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="minutos" name="Tempo ativo" fill={C.brand} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      {/* ── Abas ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Abas mais acessadas" icon={<LayoutGrid className="w-4 h-4 text-[#f7931e]" />}
          hint="Quantas vezes cada área foi aberta, quanto tempo os alunos ficaram nela e quantos alunos diferentes passaram por lá.">
          <BarList empty="Ainda sem visitas rastreadas neste período."
            rows={features.map(s => ({ label: s.label, value: s.visits, right: `${s.visits} visita${s.visits === 1 ? '' : 's'}`, sub: `${fmtMinutes(s.minutes)} · ${s.students} aluno${s.students === 1 ? '' : 's'}` }))} />
        </Section>

        <Section title="O que os alunos NÃO estão acessando" icon={<EyeOff className="w-4 h-4 text-[#f7931e]" />}
          hint="Recursos abertos por menos de 15% dos alunos que entraram no período. É aqui que mora a pergunta: o recurso é ruim ou só está escondido?">
          {noTracking ? <Empty text="Aparece depois dos primeiros acessos rastreados." /> : data.unused.length === 0 ? (
            <Empty text="Todos os recursos foram usados por pelo menos 15% dos alunos. 👏" />
          ) : (
            <div className="space-y-2">
              {data.unused.map(u => (
                <div key={u.key} className="flex items-center justify-between gap-3 bg-[#222222] border border-white/5 rounded-2xl px-4 py-3">
                  <span className="text-xs font-bold text-gray-200 truncate">{u.label}</span>
                  <span className="text-[11px] font-black text-white tabular-nums shrink-0">
                    {u.students === 0 ? 'ninguém abriu' : `${u.students} aluno${u.students === 1 ? '' : 's'} · ${u.share}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Quando estudam ── */}
      <Section title="Quando os alunos entram" icon={<CalendarClock className="w-4 h-4 text-[#f7931e]" />}
        hint="Acessos por dia da semana e hora (horário de Brasília). Útil para escolher a hora de mandar lembrete no WhatsApp ou postar no Instagram.">
        <Heatmap matrix={data.heatmap} />
      </Section>

      {/* ── Conteúdo ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Section className="xl:col-span-2" title="Exercícios por habilidade" icon={<BookOpen className="w-4 h-4 text-[#f7931e]" />}
          hint={data.journeyShare !== null ? `${data.journeyShare}% dos exercícios do período vieram da Journey to Fluency; o resto, da prática livre.` : undefined}>
          <BarList rows={data.themes.map(t => ({ label: t.theme, value: t.count, right: `${t.count} exercício${t.count === 1 ? '' : 's'}`, sub: `nota média ${t.avgPct}% · ${t.students} aluno${t.students === 1 ? '' : 's'}` }))} />
        </Section>
        <div className="space-y-6">
          <Section title="Por nível" icon={<Layers className="w-4 h-4 text-[#f7931e]" />}>
            <BarList color={C.series[0]} rows={data.levels.map(l => ({ label: l.level, value: l.count, right: String(l.count) }))} />
          </Section>
          <Section title="Por aparelho" icon={<Smartphone className="w-4 h-4 text-[#f7931e]" />}>
            <BarList color={C.series[2]} empty="Sem acessos rastreados." rows={data.devices.map(d => ({ label: DEVICE_LABEL[d.device] || d.device, value: d.count, right: `${d.count} acesso${d.count === 1 ? '' : 's'}` }))} />
          </Section>
        </div>
      </div>

      {/* ── Atritos ── */}
      <Section title="Pontos de atrito" icon={<Target className="w-4 h-4 text-[#f7931e]" />}
        hint="Onde o aluno esbarra. Abandono alto ou espera longa costumam explicar queda de engajamento melhor do que o conteúdo em si.">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { l: 'Exercícios abandonados', v: data.abandoned, s: data.started ? `${Math.round((data.abandoned / data.started) * 100)}% dos iniciados` : '' },
            { l: 'Espera média', v: data.avgWaitSec !== null ? `${data.avgWaitSec}s` : '—', s: 'tela "carregando" por exercício' },
            { l: 'Bateram no limite diário', v: data.limitHits, s: 'vezes que o limite barrou' },
            { l: 'Pacotes extras comprados', v: data.extraBought, s: 'FR$ gastos para continuar' },
            { l: 'Exercícios retomados', v: data.resumed, s: 'recuperados após queda/recarga' },
            { l: 'Horas de estudo', v: `${data.totalHours}h`, s: 'tempo ativo somado' },
          ].map(x => (
            <div key={x.l} className="bg-[#222222] border border-white/5 rounded-2xl p-4">
              <p className="text-2xl font-black text-white tabular-nums">{x.v}</p>
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-1">{x.l}</p>
              {x.s && <p className="text-[10px] text-gray-600 mt-1 leading-snug">{x.s}</p>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};

export default OverviewTab;
