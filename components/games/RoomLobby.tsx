import React, { useEffect, useState } from 'react';
import { Copy, Crown, Loader2, LogOut, Play, Search, UserPlus, X, Presentation } from 'lucide-react';
import { showToast } from '../Toast';
import { GameRoom, QuizCat, gamesApi, toLocal } from '../../services/gamesApi';
import { duelApi, DuelSearchPlayer } from '../../services/duelApi';
import { CAT_META } from '../../duelConfig';
import { gameAudio } from '../../services/gameAudio';
import { Avatar, GZ, LEVELS, useNow } from './theme';

// ════════════════════════════════════════════════════════════════
// SAGUÃO DA SALA (Quiz Party e Draw It!)
// Mostra o código bem grande (para o professor projetar na aula),
// quem já entrou, os ajustes do host e o botão Começar.
// ════════════════════════════════════════════════════════════════

const QUIZ_CATS: QuizCat[] = ['grammar', 'vocabulary', 'reading', 'listening', 'travel', 'everyday'];
const MIN = { quiz: 2, draw: 2 };

interface Props { room: GameRoom; uid: string; onLeave: () => void; accept: (r: GameRoom) => void }

const RoomLobby: React.FC<Props> = ({ room, uid, onLeave, accept }) => {
  const isHost = room.hostId === uid;
  const players = room.order.filter((u) => room.players[u] && !room.players[u].left);
  const [busy, setBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const now = useNow(500);
  const min = room.game === 'quiz' && !room.hostPlays ? 1 : MIN[room.game];
  const canStart = players.length >= min;
  const gameName = room.game === 'quiz' ? 'Quiz Party' : 'Draw It!';
  const accent = room.game === 'quiz' ? GZ.orange : GZ.cyan;

  // Som de "pop" quando alguém entra.
  const count = players.length;
  const prev = React.useRef(count);
  useEffect(() => { if (count > prev.current) gameAudio.fx('join'); prev.current = count; }, [count]);

  const autoLeft = room.autoStart && room.nextAt ? Math.max(0, Math.ceil((toLocal(room.nextAt) - now) / 1000)) : null;

  const change = async (s: { settings?: GameRoom['settings']; level?: string }) => {
    try { const r = await gamesApi.settings(room.id, s); accept(r.room); gameAudio.fx('click'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para mudar.', 'error'); }
  };
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try { const r = await gamesApi.start(room.id); gameAudio.fx('start'); accept(r.room); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para começar.', 'error'); }
    finally { setBusy(false); }
  };
  const kick = async (target: string) => {
    try { const r = await gamesApi.kick(room.id, target); accept(r.room); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para remover.', 'error'); }
  };
  const copy = async () => {
    const text = `Bora jogar ${gameName} no FreedomApp! Abra Games → Entrar com código e digite ${room.code}`;
    try { await navigator.clipboard.writeText(text); showToast('Convite copiado! Cole no WhatsApp da turma.', 'success'); }
    catch { showToast(`Código: ${room.code}`, 'info'); }
  };

  const presenter = !room.hostPlays;
  return (
    <div className="space-y-5">
      <div className="gz-card p-5 md:p-8 text-center relative overflow-hidden">
        <p className="text-sm font-medium" style={{ color: GZ.muted }}>
          {gameName} · nível {room.level}{room.public ? ' · partida rápida' : ''}
        </p>
        {room.code && (
          <>
            <p className="mt-3 text-base md:text-lg" style={{ color: GZ.muted }}>Entre em <b style={{ color: GZ.text }}>Games → Entrar com código</b> e digite</p>
            <div className="mt-3 flex items-center justify-center gap-2 md:gap-3" aria-label={`Código ${room.code.split('').join(' ')}`}>
              {room.code.split('').map((ch, i) => (
                <span key={i} className="gz-num font-bold flex items-center justify-center"
                  style={{ width: presenter ? 'min(18vw,110px)' : 'min(15vw,72px)', height: presenter ? 'min(22vw,130px)' : 'min(18vw,84px)', fontSize: presenter ? 'min(13vw,80px)' : 'min(10vw,46px)', background: GZ.cream, color: GZ.ink, border: `3px solid ${GZ.ink}`, borderRadius: 18, boxShadow: `0 6px 0 ${GZ.ink}` }}>
                  {ch}
                </span>
              ))}
            </div>
            <button onClick={copy} className="gz-btn gz-btn-ghost gz-btn-sm mt-5"><Copy className="w-4 h-4" /> Copiar convite</button>
          </>
        )}
        {autoLeft !== null && (
          <p className="mt-4 text-lg font-semibold" style={{ color: accent }}>Começa sozinho em {autoLeft}s…</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="gz-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h3 className="text-xl font-semibold">Jogadores <span className="gz-num" style={{ color: GZ.muted }}>({players.length})</span></h3>
            <button onClick={() => setShowInvite(true)} className="gz-btn gz-btn-cyan gz-btn-sm"><UserPlus className="w-4 h-4" /> Convidar colega</button>
          </div>
          {presenter && (
            <div className="flex items-center gap-2 mb-3 text-sm" style={{ color: GZ.muted }}>
              <Presentation className="w-4 h-4" /> {isHost ? 'Você está apresentando (não joga).' : `${room.hostInfo.username || room.hostInfo.name} está apresentando.`}
            </div>
          )}
          {players.length === 0 ? (
            <p className="py-8 text-center" style={{ color: GZ.muted }}>Ninguém entrou ainda. Mostre o código para a turma.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {players.map((u, i) => {
                const p = room.players[u];
                return (
                  <div key={u} className="gz-inset p-3 flex flex-col items-center text-center relative gz-pop" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                    {u === room.hostId && <Crown className="w-4 h-4 absolute top-2 left-2" style={{ color: '#ffc93c' }} aria-label="Host" />}
                    {isHost && u !== uid && (
                      <button onClick={() => kick(u)} className="absolute top-1.5 right-1.5 p-1 rounded-lg gz-focus" style={{ color: GZ.muted }} aria-label={`Remover ${p.username}`} title="Remover da sala">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <Avatar photo={p.photo} name={p.username || p.name} size={52} ring={u === uid ? accent : undefined} />
                    <p className="mt-2 text-sm font-semibold truncate max-w-full">{p.username || p.name}</p>
                    <p className="text-xs" style={{ color: GZ.muted }}>{p.level || '—'}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="gz-card p-5 space-y-4">
          <h3 className="text-xl font-semibold">Ajustes</h3>
          <Setting label="Nível das perguntas" disabled={!isHost}>
            {LEVELS.map((l) => <Pill key={l} on={room.level === l} disabled={!isHost} onClick={() => change({ level: l })}>{l}</Pill>)}
          </Setting>
          {room.game === 'quiz' ? (
            <>
              <Setting label="Perguntas" disabled={!isHost}>
                {[5, 10, 15].map((n) => <Pill key={n} on={room.settings.count === n} disabled={!isHost} onClick={() => change({ settings: { count: n } })}>{n}</Pill>)}
              </Setting>
              <Setting label="Categorias" disabled={!isHost}>
                {QUIZ_CATS.map((c) => {
                  const on = (room.settings.cats || []).includes(c);
                  const nextCats = on ? (room.settings.cats || []).filter((x) => x !== c) : [...(room.settings.cats || []), c];
                  return <Pill key={c} on={on} disabled={!isHost || (on && nextCats.length === 0)} onClick={() => change({ settings: { cats: nextCats } })}>{CAT_META[c].emoji} {CAT_META[c].label}</Pill>;
                })}
              </Setting>
            </>
          ) : (
            <>
              <Setting label="Rodadas (cada um desenha uma vez por rodada)" disabled={!isHost}>
                {[1, 2, 3].map((n) => <Pill key={n} on={room.settings.rounds === n} disabled={!isHost} onClick={() => change({ settings: { rounds: n } })}>{n}</Pill>)}
              </Setting>
              <Setting label="Tempo para desenhar" disabled={!isHost}>
                {[60000, 80000, 100000].map((n) => <Pill key={n} on={room.settings.drawMs === n} disabled={!isHost} onClick={() => change({ settings: { drawMs: n } })}>{n / 1000}s</Pill>)}
              </Setting>
            </>
          )}

          <div className="pt-2 space-y-2">
            {isHost ? (
              <button onClick={start} disabled={!canStart || busy} className="gz-btn gz-btn-orange w-full text-lg py-3.5">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Play className="w-5 h-5" /> Começar</>}
              </button>
            ) : (
              <p className="text-center py-2" style={{ color: GZ.muted }}>Esperando {room.hostInfo.username || 'o host'} começar…</p>
            )}
            {isHost && !canStart && <p className="text-xs text-center" style={{ color: GZ.muted }}>Precisa de {min} jogador{min > 1 ? 'es' : ''} para começar.</p>}
            <button onClick={onLeave} className="gz-btn gz-btn-ghost w-full"><LogOut className="w-4 h-4" /> Sair da sala</button>
          </div>
        </div>
      </div>

      {showInvite && <InviteModal roomId={room.id} uid={uid} inRoom={room.order} onClose={() => setShowInvite(false)} />}
    </div>
  );
};

const Setting: React.FC<{ label: string; disabled?: boolean; children: React.ReactNode }> = ({ label, disabled, children }) => (
  <div style={{ opacity: disabled ? 0.75 : 1 }}>
    <p className="text-sm mb-2" style={{ color: GZ.muted }}>{label}</p>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export const Pill: React.FC<{ on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, disabled, onClick, children }) => (
  <button onClick={onClick} disabled={disabled} aria-pressed={on}
    className="gz-btn gz-btn-sm" style={{ background: on ? GZ.lime : GZ.grapeDeep, color: on ? GZ.ink : GZ.text, opacity: disabled && !on ? 0.55 : 1 }}>
    {children}
  </button>
);

// Convidar: busca pelo @ (mesma busca do Duelo) e o convite aparece
// na tela do colega na hora, onde quer que ele esteja no app.
const InviteModal: React.FC<{ roomId: string; uid: string; inRoom: string[]; onClose: () => void }> = ({ roomId, inRoom, onClose }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState<DuelSearchPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await duelApi.search(q); if (alive) setList(r.players); }
      catch { if (alive) setList([]); }
      finally { if (alive) setLoading(false); }
    }, q ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  const send = async (p: DuelSearchPlayer) => {
    try { await gamesApi.invite(roomId, p.uid); setSent((s) => ({ ...s, [p.uid]: true })); gameAudio.fx('pop'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Não deu para convidar.', 'error'); }
  };
  return (
    <div className="fixed inset-0 z-[650] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(34,34,34,.55)' }} onClick={onClose}>
      <div className="gz gz-card w-full max-w-md p-5 gz-pop max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Convidar colega">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold">Convidar colega</h3>
          <button onClick={onClose} className="p-2 gz-focus rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: GZ.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o @ ou o nome" className="gz-input w-full pl-9" autoFocus />
        </div>
        <div className="mt-3 space-y-2 overflow-y-auto gz-scroll pr-1">
          {loading && <Loader2 className="w-5 h-5 animate-spin mx-auto my-4" style={{ color: GZ.cyan }} />}
          {!loading && list.length === 0 && <p className="text-center py-4 text-sm" style={{ color: GZ.muted }}>Ninguém encontrado.</p>}
          {!loading && list.map((p) => {
            const here = inRoom.includes(p.uid);
            return (
              <div key={p.uid} className="gz-inset flex items-center gap-3 p-2.5">
                <Avatar photo={p.photo} name={p.username || p.name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.username}</p>
                  <p className="text-xs truncate" style={{ color: GZ.muted }}>{p.name}{p.level ? ` · ${p.level}` : ''}</p>
                </div>
                <button onClick={() => send(p)} disabled={here || sent[p.uid]} className="gz-btn gz-btn-orange gz-btn-sm">
                  {here ? 'Na sala' : sent[p.uid] ? 'Enviado' : 'Convidar'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RoomLobby;
