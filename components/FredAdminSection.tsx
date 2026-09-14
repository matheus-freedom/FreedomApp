import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ThumbsUp, ThumbsDown, Loader2, AlertTriangle, CheckCircle2, Clock, GraduationCap } from 'lucide-react';
import { api } from '../services/api';
import { FRED_CATALOG } from '../fredExplains';
import { showToast } from './Toast';

// ══════════════════════════════════════════════════════════════
// PAINEL ADMIN — aba "Fred explica"
// ──────────────────────────────────────────────────────────────
// Controle de qualidade do conteúdo gerado. Como cada aula é gerada
// UMA vez e vista por todos os alunos, o professor precisa de um
// lugar para ver: quais temas já têm aula, qual modelo escreveu,
// quantos 👍/👎 recebeu e — o principal — o botão "Regerar" para
// descartar uma aula ruim e pedir outra.
// ══════════════════════════════════════════════════════════════

type Row = Awaited<ReturnType<typeof api.listFredLessons>>[number];

const FredAdminSection: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyGenerated, setOnlyGenerated] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setRows(await api.listFredLessons()); } catch (e) { showToast('Não consegui listar as aulas.', 'error'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  const list = useMemo(() => FRED_CATALOG.map(c => ({ entry: c, row: byId.get(c.id) })).filter(x => !onlyGenerated || x.row), [byId, onlyGenerated]);

  const ready = rows.filter(r => r.status === 'ready').length;
  const errors = rows.filter(r => r.status === 'error').length;
  const generating = rows.filter(r => r.status === 'generating').length;
  const downs = rows.reduce((a, r) => a + (r.feedback?.down || 0), 0);

  const regenerate = async (id: string, topic: string) => {
    if (!window.confirm(`Regerar a aula "${topic}"? A atual será descartada e o Fred escreve outra (gasta uma geração).`)) return;
    setBusy(id);
    try { await api.regenerateFredLesson(id); showToast('Geração pedida. Em ~1 minuto a aula nova estará no ar.', 'success'); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Falha ao regerar.', 'error'); }
    setBusy(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Aulas prontas', value: `${ready}/${FRED_CATALOG.length}`, icon: <CheckCircle2 className="w-5 h-5 text-green-400" /> },
          { label: 'Gerando agora', value: generating, icon: <Clock className="w-5 h-5 text-[#f7931e]" /> },
          { label: 'Com erro', value: errors, icon: <AlertTriangle className="w-5 h-5 text-red-400" /> },
          { label: 'Votos negativos', value: downs, icon: <ThumbsDown className="w-5 h-5 text-red-400" /> },
        ].map((s, i) => (
          <div key={i} className="bg-[#2a2a2a] p-5 rounded-[1.5rem] border border-white/5">
            <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{s.label}</p>{s.icon}</div>
            <p className="text-2xl font-black text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer">
          <input type="checkbox" checked={onlyGenerated} onChange={e => setOnlyGenerated(e.target.checked)} className="accent-[#f7931e]" />
          Mostrar só temas com aula gerada
        </label>
        <button onClick={load} className="px-4 py-2 bg-[#333333] text-gray-300 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-white"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
      </div>

      <div className="bg-[#2a2a2a] rounded-[2rem] border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm font-bold"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#f7931e]" /> Carregando...</div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm font-bold flex flex-col items-center gap-2"><GraduationCap className="w-8 h-8 text-gray-600" /> Nenhuma aula gerada ainda. A primeira é criada quando um aluno abre um tema.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {list.map(({ entry, row }) => (
              <div key={entry.id} className="flex items-center gap-4 p-4">
                <span className="w-10 text-center text-[10px] font-black text-[#f7931e] bg-[#f7931e]/10 rounded-lg py-1">{entry.level}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{entry.topic}</p>
                  <p className="text-[10px] text-gray-500 font-bold truncate">
                    {!row ? 'Ainda não gerada'
                      : row.status === 'ready' ? `Pronta · ${row.model || '?'} · ${row.generatedAt ? new Date(row.generatedAt).toLocaleDateString('pt-BR') : ''}`
                      : row.status === 'generating' ? 'Gerando...'
                      : `Erro (${row.attempts || 0} tentativas): ${row.lastError || ''}`}
                  </p>
                </div>
                {row?.feedback && (
                  <div className="hidden md:flex items-center gap-3 text-xs font-black">
                    <span className="flex items-center gap-1 text-green-400"><ThumbsUp className="w-3.5 h-3.5" /> {row.feedback.up}</span>
                    <span className={`flex items-center gap-1 ${row.feedback.down > 0 ? 'text-red-400' : 'text-gray-600'}`}><ThumbsDown className="w-3.5 h-3.5" /> {row.feedback.down}</span>
                  </div>
                )}
                {row && row.status !== 'generating' && (
                  <button disabled={busy === row.id} onClick={() => regenerate(row.id, entry.topic)}
                    className="px-3 py-2 bg-[#333333] text-gray-300 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:text-white hover:bg-red-500/20 disabled:opacity-50">
                    {busy === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Regerar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FredAdminSection;
