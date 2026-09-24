
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GuideCharacter, ChatMessage, Level, Theme, UserSession } from '../types';
import { chatWithGuide } from '../services/geminiService';
import { api } from '../services/api';
import {
  User, X, Send, Play, Clock, Maximize2, Minimize2, History, MessageCircle,
  MessageSquarePlus, Trash2, Loader2, RefreshCw, ChevronRight, MoveDiagonal2,
} from 'lucide-react';
import { FRED_FACE } from './FredAvatar';
import { parseChatMarkdown, InlinePiece } from '../chatMarkdown';
import { fredChatHistory, FredChatSummary, getActiveChat, setActiveChat } from '../services/fredChatHistory';

interface GuideChatProps {
  guide: GuideCharacter;
  userName: string;
  user: UserSession;
  onUserUpdate: (user: UserSession) => void;
  onGenerateActivity: (level: Level, theme: Theme, topic: string) => void;
}

const MAX_DAILY_CHAT = 3;

// Quantas mensagens anteriores vão junto para a IA como "contexto".
// Sem esse teto, uma conversa antiga reaberta pelo Histórico mandaria
// dezenas de mensagens a cada pergunta — mais lento e mais caro.
const CONTEXT_MESSAGES = 20;

// ── Tamanho da janela ───────────────────────────────────────────
// O aluno pode arrastar o canto superior esquerdo (a janela fica
// presa no canto inferior direito, então é esse o canto que "cresce")
// ou usar o botão de ampliar. A escolha fica salva neste navegador.
const SIZE_KEY = 'freedom_fred_chat_size';
const DEFAULT_SIZE = { w: 384, h: 520 };
const MIN_SIZE = { w: 300, h: 380 };
const EXPANDED_MAX_W = 760;

interface SavedSize { w: number; h: number; expanded: boolean }

const loadSize = (): SavedSize => {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
    if (v && typeof v.w === 'number' && typeof v.h === 'number') return { w: v.w, h: v.h, expanded: !!v.expanded };
  } catch { /* sem storage: usa o padrão */ }
  return { ...DEFAULT_SIZE, expanded: false };
};
const saveSize = (s: SavedSize) => {
  try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch { /* ignora */ }
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Espaço livre na tela: a janela fica a 24px da direita e acima do
// botão redondo (24px de margem + 64px do botão + 16px de folga).
const viewportLimits = () => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  return { maxW: Math.max(260, vw - 36), maxH: Math.max(320, vh - 124) };
};

// ── Desenho do texto do Fred (Markdown já interpretado) ─────────
const Inline: React.FC<{ pieces: InlinePiece[] }> = ({ pieces }) => (
  <>
    {pieces.map((p, i) => {
      if (p.code) return <code key={i} className="px-1.5 py-0.5 rounded bg-black/30 text-[#f7931e] text-[0.9em] font-mono">{p.text}</code>;
      if (p.bold && p.italic) return <strong key={i} className="font-bold italic text-white">{p.text}</strong>;
      if (p.bold) return <strong key={i} className="font-bold text-white">{p.text}</strong>;
      if (p.italic) return <em key={i} className="italic text-gray-300">{p.text}</em>;
      return <React.Fragment key={i}>{p.text}</React.Fragment>;
    })}
  </>
);

const BotText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parseChatMarkdown(text);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h':
            return <p key={i} className="font-black text-[#f7931e] pt-1"><Inline pieces={b.pieces} /></p>;
          case 'hr':
            return <hr key={i} className="border-[#444444] my-1" />;
          case 'li':
            return (
              <div key={i} className="flex gap-2 -mt-1" style={{ paddingLeft: `${b.depth * 14}px` }}>
                <span className={`shrink-0 ${b.ordered ? 'font-bold text-[#f7931e] min-w-[1.4em]' : 'text-[#f7931e]'}`}>{b.marker}</span>
                <span className="min-w-0"><Inline pieces={b.pieces} /></span>
              </div>
            );
          case 'table':
            return (
              <div key={i} className="overflow-x-auto -mx-1">
                <table className="text-xs border-collapse min-w-full">
                  <thead>
                    <tr>{b.header.map((c, j) => <th key={j} className="text-left font-bold text-white border-b border-[#555] px-2 py-1"><Inline pieces={c} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k} className="border-b border-[#444] px-2 py-1 align-top"><Inline pieces={c} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i} className="whitespace-pre-wrap"><Inline pieces={b.pieces} /></p>;
        }
      })}
    </div>
  );
};

// "Hoje, 14:32" / "Ontem, 09:10" / "12/09, 18:40"
const formatWhen = (ts: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Hoje, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${time}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`;
};

const GuideChat: React.FC<GuideChatProps> = ({ guide, userName, user, onUserUpdate, onGenerateActivity }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Conversa atual (id no Firestore). Uma conversa nova só vira
  // documento quando o aluno manda a primeira pergunta.
  const [chatId, setChatId] = useState<string>(() => crypto.randomUUID());
  const chatCreatedAtRef = useRef<number>(Date.now());
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const [saveFailed, setSaveFailed] = useState(false);

  // Aba Histórico
  const [historyList, setHistoryList] = useState<FredChatSummary[]>([]);
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // Tamanho
  const [size, setSize] = useState<SavedSize>(loadSize);
  const [limits, setLimits] = useState(viewportLimits);
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const uid = user.userId;
  const today = new Date().toISOString().split('T')[0];
  const chatCount = user.gamification.lastChatDate === today ? user.gamification.dailyChatCount : 0;
  const isLimitReached = chatCount >= MAX_DAILY_CHAT;

  const buildGreeting = useCallback((): ChatMessage => {
    const limitInfo = `\n\n⚠️ Lembre-se: Como seu assistente, posso tirar até ${MAX_DAILY_CHAT} dúvidas por dia para manter seu foco. Escolha bem as suas perguntas.`;
    const text = guide === 'Fred'
      ? `Olá, eu sou o Fred! Bem-vindo à versão Beta da plataforma de exercícios da Freedom. Estou aqui para te ajudar a evoluir no inglês. Como posso ser útil hoje?\n\n• Tire dúvidas gramaticais\n• Peça novos vocabulários\n• Peça exemplos, dicas e ideias${limitInfo}`
      : `Olá, eu sou a Frida! Que bom te ver na versão Beta da plataforma de exercícios da Freedom. Pronta para praticar? Conte comigo para qualquer dúvida ou dica!\n\n• Tire dúvidas gramaticais\n• Peça novos vocabulários\n• Peça exemplos, dicas e ideias${limitInfo}`;
    return { id: 'init', role: 'model', text };
  }, [guide]);

  const startNewChat = useCallback(() => {
    setChatId(crypto.randomUUID());
    chatCreatedAtRef.current = Date.now();
    setMessages([buildGreeting()]);
    setActiveChat(uid, null);
    setSaveFailed(false);
    setTab('chat');
  }, [buildGreeting, uid]);

  // Ao entrar: retoma a conversa que estava aberta neste aparelho
  // (se foi usada nas últimas horas); senão, começa uma nova.
  useEffect(() => {
    let cancelled = false;
    setMessages([buildGreeting()]);
    const active = getActiveChat(uid);
    if (active) {
      fredChatHistory.get(uid, active.id)
        .then(doc => {
          if (cancelled || !doc || !doc.messages.length) return;
          setChatId(doc.id);
          chatCreatedAtRef.current = doc.createdAt || Date.now();
          setMessages([buildGreeting(), ...doc.messages]);
        })
        .catch(() => { /* sem permissão/rede: segue com conversa nova */ });
    }
    return () => { cancelled = true; };
  }, [uid, buildGreeting]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (tab === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isTyping, tab]);

  // Recalcula o espaço disponível quando a janela do navegador muda
  // (girar o celular, redimensionar o navegador).
  useEffect(() => {
    const onResize = () => setLimits(viewportLimits());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const persist = async (all: ChatMessage[]) => {
    try {
      await fredChatHistory.save(uid, chatId, all, chatCreatedAtRef.current);
      setActiveChat(uid, chatId);
      setSaveFailed(false);
    } catch (err) {
      // O mais provável é a regra do Firestore ainda não publicada.
      // O chat continua funcionando; só avisamos discretamente.
      console.error('Não foi possível salvar o histórico do chat', err);
      setSaveFailed(true);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLimitReached || isTyping) return;

    const previous = messagesRef.current;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text };
    const withUser = [...previous, userMsg];

    setMessages(withUser);
    setInputText('');
    setIsTyping(true);

    let finalMessages = withUser;
    try {
      // Increment chat count in API and user object
      const newCount = await api.incrementChatCount(user.userId);
      onUserUpdate({
        ...user,
        gamification: {
          ...user.gamification,
          dailyChatCount: newCount,
          lastChatDate: today
        }
      });

      // Get AI response
      const newMessages = await chatWithGuide(previous.slice(-CONTEXT_MESSAGES), text, userName, guide);
      finalMessages = [...withUser, ...newMessages];
      setMessages(finalMessages);
    } catch (error) {
      console.error("Chat error", error);
      // A mensagem de erro aparece na tela, mas não vai para o
      // histórico (não faz sentido reler um erro de conexão depois).
      setMessages([...withUser, {
        id: `err-${crypto.randomUUID()}`,
        role: 'model',
        text: error instanceof Error ? error.message : "Desculpe, estou com dificuldades de conexão agora. Tente novamente em alguns instantes."
      }]);
    } finally {
      setIsTyping(false);
    }
    persist(finalMessages);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Histórico ─────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryState('loading');
    try {
      setHistoryList(await fredChatHistory.list(uid));
      setHistoryState('idle');
    } catch (err) {
      console.error('Erro ao carregar histórico do chat', err);
      setHistoryState('error');
    }
  }, [uid]);

  const openHistoryTab = () => {
    setTab('history');
    setConfirmDeleteId(null);
    loadHistory();
  };

  const openConversation = async (id: string) => {
    if (id === chatId || isTyping) { setTab('chat'); return; }
    setOpeningId(id);
    try {
      const doc = await fredChatHistory.get(uid, id);
      if (doc) {
        setChatId(doc.id);
        chatCreatedAtRef.current = doc.createdAt || Date.now();
        setMessages([buildGreeting(), ...doc.messages]);
        setActiveChat(uid, doc.id);
        setTab('chat');
      }
    } catch (err) {
      console.error('Erro ao abrir conversa', err);
      setHistoryState('error');
    } finally {
      setOpeningId(null);
    }
  };

  const deleteConversation = async (id: string) => {
    setConfirmDeleteId(null);
    const before = historyList;
    setHistoryList(list => list.filter(c => c.id !== id)); // some da tela na hora
    try {
      await fredChatHistory.remove(uid, id);
      if (id === chatId) startNewChat();
    } catch (err) {
      console.error('Erro ao apagar conversa', err);
      setHistoryList(before);
      setHistoryState('error');
    }
  };

  // ── Tamanho: arrastar e ampliar ───────────────────────────────
  const width = size.expanded ? Math.min(EXPANDED_MAX_W, limits.maxW) : clamp(size.w, Math.min(MIN_SIZE.w, limits.maxW), limits.maxW);
  const height = size.expanded ? limits.maxH : clamp(size.h, Math.min(MIN_SIZE.h, limits.maxH), limits.maxH);

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, w: width, h: height };
    document.body.style.userSelect = 'none';
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // Arrastar para a ESQUERDA/CIMA aumenta, porque a janela está
    // presa no canto inferior direito.
    setSize({
      w: clamp(d.w + (d.x - e.clientX), MIN_SIZE.w, limits.maxW),
      h: clamp(d.h + (d.y - e.clientY), MIN_SIZE.h, limits.maxH),
      expanded: false,
    });
  };
  const onResizeEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.style.userSelect = '';
    setSize(s => { saveSize(s); return s; });
  };
  const resetSize = () => {
    const s = { ...DEFAULT_SIZE, expanded: false };
    setSize(s); saveSize(s);
  };
  const toggleExpanded = () => {
    setSize(s => { const n = { ...s, expanded: !s.expanded }; saveSize(n); return n; });
  };

  const hasConversation = messages.some(m => m.role === 'user');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">

      {/* Chat Window */}
      {isOpen && (
        <div
          className="relative mb-4 bg-[#222222] border border-[#f7931e]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in origin-bottom-right"
          style={{ width, height }}
        >
          {/* Alça de redimensionar (canto superior esquerdo).
              Dois cliques voltam ao tamanho padrão. */}
          <div
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
            onDoubleClick={resetSize}
            title="Arraste para mudar o tamanho (dois cliques: tamanho padrão)"
            className="absolute top-0 left-0 z-10 w-6 h-6 flex items-center justify-center cursor-nwse-resize text-gray-500 hover:text-[#f7931e]"
            style={{ touchAction: 'none' }}
          >
            <MoveDiagonal2 className="w-3.5 h-3.5" />
          </div>

          {/* Header */}
          <div className="bg-[#333333] pl-5 pr-3 py-3 flex items-center justify-between border-b border-[#444444] gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-2 overflow-hidden ${guide === 'Fred' ? 'bg-blue-900/50 border-blue-500' : 'bg-pink-900/50 border-pink-500'}`}>
                {guide === 'Fred'
                  ? <img src={FRED_FACE} alt="Fred" className="w-full h-full object-cover select-none" draggable={false} />
                  : <User className="w-6 h-6 text-pink-400" />
                }
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-white">{guide}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#f7931e] flex items-center gap-1 font-black uppercase tracking-widest whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Beta Guide
                  </span>
                  <span className="text-[9px] text-gray-400 font-bold uppercase">
                    ({chatCount}/{MAX_DAILY_CHAT})
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={startNewChat} disabled={isTyping} title="Nova conversa" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-40">
                <MessageSquarePlus className="w-4 h-4" />
              </button>
              <button onClick={toggleExpanded} title={size.expanded ? 'Tamanho normal' : 'Ampliar'} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
                {size.expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsOpen(false)} title="Fechar" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Abas */}
          <div className="flex bg-[#2a2a2a] border-b border-[#444444] text-[11px] font-black uppercase tracking-widest">
            <button
              onClick={() => setTab('chat')}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${tab === 'chat' ? 'border-[#f7931e] text-[#f7931e]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              <MessageCircle className="w-3.5 h-3.5" /> Conversa
            </button>
            <button
              onClick={openHistoryTab}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${tab === 'history' ? 'border-[#f7931e] text-[#f7931e]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              <History className="w-3.5 h-3.5" /> Histórico
            </button>
          </div>

          {tab === 'chat' ? (
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#1a1a1a]">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#f7931e] text-[#222222] rounded-tr-none font-medium shadow-lg whitespace-pre-wrap'
                          : 'bg-[#333333] text-gray-200 border border-[#444444] rounded-tl-none'
                      }`}
                    >
                      {msg.role === 'model' ? <BotText text={msg.text} /> : msg.text}

                      {msg.isActivityLink && msg.activityParams && (
                        <button
                          onClick={() => onGenerateActivity(msg.activityParams!.level, msg.activityParams!.theme, msg.activityParams!.topic)}
                          className="mt-3 w-full bg-[#222222] text-[#f7931e] border border-[#f7931e] py-2 px-3 rounded-xl flex items-center justify-center gap-2 hover:bg-[#f7931e] hover:text-[#222222] transition-colors font-bold text-xs uppercase tracking-wider"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Start Activity
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                     <div className="bg-[#333333] border border-[#444444] rounded-2xl rounded-tl-none p-4 flex gap-1">
                        <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></span>
                        <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></span>
                     </div>
                  </div>
                )}
                {saveFailed && hasConversation && (
                  <p className="text-center text-[10px] text-gray-500">Não foi possível salvar esta conversa no histórico.</p>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 bg-[#333333] border-t border-[#444444]">
                {isLimitReached ? (
                  <div className="bg-[#222222] p-3 rounded-xl flex items-center gap-3 border border-red-500/30">
                    <Clock className="w-5 h-5 text-[#f7931e]" />
                    <p className="text-[10px] font-black text-gray-400 uppercase leading-tight tracking-widest">
                      Limite de 3 dúvidas diárias atingido. Volte amanhã para mais!
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Pergunte qualquer coisa..."
                      className="w-full bg-[#222222] border border-[#444444] text-white rounded-xl pl-4 pr-12 py-3 text-sm focus:border-[#f7931e] focus:outline-none"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!inputText.trim() || isTyping || isLimitReached}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#f7931e] hover:bg-[#f7931e]/10 rounded-lg disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Aba Histórico ── */
            <div className="flex-1 overflow-y-auto bg-[#1a1a1a] p-3 space-y-2">
              {historyState === 'loading' && historyList.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-gray-500 text-sm py-10">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando conversas...
                </div>
              )}

              {historyState === 'error' && (
                <div className="bg-[#222222] border border-red-500/30 rounded-xl p-3 text-xs text-gray-300 flex items-center justify-between gap-3">
                  <span>Não consegui acessar o histórico agora.</span>
                  <button onClick={loadHistory} className="flex items-center gap-1 text-[#f7931e] font-bold shrink-0">
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
                  </button>
                </div>
              )}

              {historyState === 'idle' && historyList.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-10 px-4 leading-relaxed">
                  Nenhuma conversa salva ainda.<br />
                  Suas perguntas ao {guide} vão aparecer aqui.
                </div>
              )}

              {historyList.map(c => (
                <div
                  key={c.id}
                  className={`group rounded-xl border p-3 transition-colors ${c.id === chatId ? 'border-[#f7931e]/60 bg-[#f7931e]/5' : 'border-[#333333] bg-[#222222] hover:border-[#f7931e]/40'}`}
                >
                  {confirmDeleteId === c.id ? (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-300">Apagar esta conversa?</span>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setConfirmDeleteId(null)} className="px-2.5 py-1 rounded-lg text-gray-400 hover:text-white">Cancelar</button>
                        <button onClick={() => deleteConversation(c.id)} className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 font-bold hover:bg-red-500/30">Apagar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <button onClick={() => openConversation(c.id)} className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{formatWhen(c.updatedAt)}</span>
                          {c.id === chatId && <span className="text-[9px] font-black text-[#f7931e] uppercase tracking-widest">aberta</span>}
                        </div>
                        <p className="text-sm font-bold text-white truncate">{c.title}</p>
                        {c.preview && <p className="text-xs text-gray-400 truncate mt-0.5">{c.preview}</p>}
                      </button>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        {openingId === c.id
                          ? <Loader2 className="w-4 h-4 text-[#f7931e] animate-spin mt-1" />
                          : <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#f7931e] mt-1" />}
                        <button onClick={() => setConfirmDeleteId(c.id)} title="Apagar conversa" className="p-1 rounded text-gray-600 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center justify-center w-16 h-16 rounded-full bg-[#f7931e] shadow-[0_4px_20px_rgba(247,147,30,0.4)] hover:scale-110 transition-all duration-300 relative"
      >
        {isOpen ? (
          <X className="w-8 h-8 text-[#222222]" />
        ) : (
          <>
             {/* O rosto do Fred preenche o botão inteiro (a borda laranja
                 vira uma "moldura"), para ele ficar bem visível e carismático */}
             {guide === 'Fred'
               ? <img src={FRED_FACE} alt="Abrir chat com o Fred" className="w-full h-full rounded-full object-cover border-[3px] border-[#f7931e] select-none" draggable={false} />
               : <User className="w-8 h-8 text-[#222222]" />}
             {!isLimitReached && (
               <span className="absolute -top-1 -right-1 w-6 h-6 bg-[#222222] border-2 border-[#f7931e] rounded-full flex items-center justify-center text-[10px] font-black text-[#f7931e] animate-bounce">
                 {MAX_DAILY_CHAT - chatCount}
               </span>
             )}
          </>
        )}
      </button>
    </div>
  );
};

export default GuideChat;
