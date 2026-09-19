import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { HeartPulse, Filter, CalendarRange, LifeBuoy, Repeat, UserMinus, UserPlus, Magnet, ChevronRight, Ghost } from 'lucide-react';
import { Engagement, StudentRow, StudentStatus, STATUS_META, fmtAgo } from '../../services/analytics';
import { Section, KpiCard, ChartTip, BarList, Empty, Pill, C, axisProps } from './ui';

// ════════════════════════════════════════════════════════════════
// ABA "ENGAJAMENTO" — quem está ficando, quem está indo embora
// ────────────────────────────────────────────────────────────────
// A dor nº 1 do FreedomApp: o aluno começa animado e para. Esta aba
// existe para transformar isso em lista de nomes e em tendência:
// quem resgatar esta semana, e se o conjunto está melhorando.
// ════════════════════════════════════════════════════════════════

interface Props { data: Engagement; rows: StudentRow[]; onSelect: (userId: string) => void }

const ORDER: StudentStatus[] = ['ativo', 'esfriando', 'em_risco', 'inativo', 'nunca_praticou'];

const EngagementTab: React.FC<Props> = ({ data, rows, onSelect }) => {
  const total = rows.length || 1;
  // Quem vale mais a pena resgatar: já provou que gosta (muitos
  // exercícios feitos) e começou a sumir agora.
  const rescue = useMemo(() => rows.filter(r => r.status === 'esfriando' || r.status === 'em_risco').sort((a, b) => b.totalExercises - a.totalExercises).slice(0, 12), [rows]);
  const never = useMemo(() => rows.filter(r => r.status === 'nunca_praticou' && r.accessStatus === 'approved').slice(0, 12), [rows]);

  const StudentLine: React.FC<{ r: StudentRow; right: string }> = ({ r, right }) => (
    <button onClick={() => onSelect(r.userId)} className="w-full flex items-center gap-3 bg-[#222222] hover:bg-[#2f2f2f] border border-white/5 rounded-2xl px-4 py-3 text-left transition-colors group">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-white truncate">{r.fullName}</p>
        <p className="text-[10px] font-bold text-gray-500 truncate">{r.username} · {right}</p>
      </div>
      <Pill kind={r.status}>{STATUS_META[r.status].label}</Pill>
      <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-[#f7931e] shrink-0" />
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Situação da base ── */}
      <Section title="Situação dos alunos hoje" icon={<HeartPulse className="w-4 h-4 text-[#f7931e]" />}
        hint="Cada aluno cai em uma faixa conforme o tempo desde o último uso. O objetivo da semana é simples: mover gente de 'esfriando' e 'em risco' de volta para 'ativo'.">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ORDER.map(s => (
            <div key={s} className="bg-[#222222] border border-white/5 rounded-2xl p-4">
              <Pill kind={s}>{STATUS_META[s].label}</Pill>
              <p className="text-3xl font-black text-white tabular-nums mt-3">{data.statusCounts[s]}</p>
              <p className="text-[10px] text-gray-500 font-medium mt-1">{Math.round((data.statusCounts[s] / total) * 100)}% · {STATUS_META[s].hint}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard showDelta={false} icon={<Repeat className="w-5 h-5" />} label="Voltaram esta semana" value={data.returnRate !== null ? `${data.returnRate}%` : '—'} sub="dos alunos ativos nos 7 dias anteriores, quantos usaram de novo nos últimos 7" />
        <KpiCard showDelta={false} icon={<Magnet className="w-5 h-5" />} label="Frequência (DAU/MAU)" value={data.stickiness !== null ? `${data.stickiness}%` : '—'} sub="em um dia típico, que fatia dos alunos do mês aparece. 20% já é um hábito saudável" />
        <KpiCard showDelta={false} icon={<UserMinus className="w-5 h-5" />} label="Fizeram 1–2 e sumiram" value={String(data.oneAndDone)} sub="testaram e não voltaram há mais de 14 dias: o primeiro contato não convenceu" />
        <KpiCard showDelta={false} icon={<UserPlus className="w-5 h-5" />} label="Contas novas (30 dias)" value={String(data.newAccounts30)} sub="conta criada a partir desta versão (as antigas não têm data)" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Alunos ativos por semana" icon={<CalendarRange className="w-4 h-4 text-[#f7931e]" />}
          hint="Últimas 12 semanas (cada barra começa na data indicada). É o gráfico que mostra se o engajamento está subindo ou caindo.">
          <div className="h-56"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weekly} barCategoryGap="22%">
              <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axisProps} /><YAxis allowDecimals={false} width={26} {...axisProps} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="alunos" name="Alunos ativos" fill={C.series[2]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer></div>
        </Section>
        <Section title="Exercícios por semana" icon={<CalendarRange className="w-4 h-4 text-[#f7931e]" />} hint="Mesmo período, contando exercícios concluídos.">
          <div className="h-56"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weekly} barCategoryGap="22%">
              <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axisProps} /><YAxis allowDecimals={false} width={30} {...axisProps} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="exercicios" name="Exercícios" fill={C.series[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer></div>
        </Section>
      </div>

      <Section title="Funil: da conta criada ao hábito" icon={<Filter className="w-4 h-4 text-[#f7931e]" />}
        hint={`Quantos alunos chegaram a cada etapa. A maior queda entre duas barras vizinhas é onde vale investir primeiro. À parte: ${data.placementPct}% dos alunos já fizeram algum nivelamento.`}>
        <BarList color={C.series[0]} rows={data.funnel.map(f => ({ label: f.step, value: f.count, right: `${f.count} aluno${f.count === 1 ? '' : 's'}`, sub: `${f.pct}%` }))} />
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Para resgatar esta semana" icon={<LifeBuoy className="w-4 h-4 text-[#f7931e]" />}
          hint="Já praticaram bastante e começaram a sumir. Um recado pessoal agora costuma render mais do que qualquer recurso novo. Clique para abrir a ficha e mandar mensagem.">
          {rescue.length === 0 ? <Empty text="Ninguém esfriando no momento. 🎉" /> : (
            <div className="space-y-2">{rescue.map(r => <StudentLine key={r.userId} r={r} right={`${r.totalExercises} exercícios · visto ${fmtAgo(r.lastSeen)}`} />)}</div>
          )}
        </Section>
        <Section title="Criaram conta e nunca praticaram" icon={<Ghost className="w-4 h-4 text-[#f7931e]" />}
          hint="Têm acesso liberado, mas não concluíram nenhum exercício. Vale apresentar o app em aula.">
          {never.length === 0 ? <Empty text="Todo mundo com acesso já fez pelo menos um exercício." /> : (
            <div className="space-y-2">{never.map(r => <StudentLine key={r.userId} r={r} right={r.lastSeen ? `entrou ${fmtAgo(r.lastSeen)}` : 'ainda não entrou no app'} />)}</div>
          )}
        </Section>
      </div>
    </div>
  );
};

export default EngagementTab;
