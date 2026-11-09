// ════════════════════════════════════════════════════════════════
// Histórico de conversas com o Fred (chat do canto da tela)
// ────────────────────────────────────────────────────────────────
// ONDE FICA: users/{uid}/fred_chats/{chatId} — uma SUBcoleção dentro
// do documento do aluno. Assim o histórico acompanha a CONTA: o aluno
// vê as mesmas conversas no celular e no computador, e não perde
// nada ao limpar o navegador.
//
// QUEM LÊ/ESCREVE: só o próprio aluno (e o admin pode ler). A regra
// está em firestore.rules, bloco "Histórico do chat do Fred" — ela
// PRECISA ser publicada no Console do Firebase, senão o Firestore
// recusa (o chat continua funcionando, só não salva).
//
// FORMATO de cada conversa (1 documento):
//   { title, preview, messageCount, createdAt, updatedAt,
//     messages: [{ id, role, text }] }
// A saudação inicial do Fred não é salva (é igual para todo mundo).
//
// LIMITES (para o documento nunca passar de 1 MB, o teto do
// Firestore, e a lista não ficar pesada):
//   • até MAX_SAVED_MESSAGES mensagens por conversa (as mais antigas
//     saem primeiro);
//   • a aba Histórico carrega as MAX_LISTED conversas mais recentes.
// ════════════════════════════════════════════════════════════════

import { collection, doc, getDocs, setDoc, deleteDoc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { ChatMessage } from '../types';
import { chatPlainText } from '../chatMarkdown';

export const MAX_SAVED_MESSAGES = 80;
export const MAX_LISTED = 40;

export interface FredChatSummary {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FredChatDoc extends FredChatSummary {
  messages: ChatMessage[];
}

const chatsCol = (uid: string) => collection(db, 'users', uid, 'fred_chats');

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// Título = primeira pergunta do aluno (é como ele vai reconhecer a
// conversa depois). Prévia = última resposta do Fred, sem Markdown.
export const buildSummary = (messages: ChatMessage[]): { title: string; preview: string } => {
  const firstUser = messages.find(m => m.role === 'user');
  const lastModel = [...messages].reverse().find(m => m.role === 'model');
  return {
    title: cut((firstUser?.text || 'Conversa com o Fred').replace(/\s+/g, ' ').trim(), 70),
    preview: cut(lastModel ? chatPlainText(lastModel.text) : '', 110),
  };
};

// Só o que interessa guardar (sem a saudação, sem mensagens de erro
// de conexão — ids "err-..." — e sem campos vazios —
// o Firestore recusa "undefined").
export const toStorable = (messages: ChatMessage[]): ChatMessage[] =>
  messages
    .filter(m => m.id !== 'init' && !m.id.startsWith('err-') && m.text)
    .slice(-MAX_SAVED_MESSAGES)
    .map(m => {
      const out: ChatMessage = { id: m.id, role: m.role, text: m.text };
      if (m.isActivityLink && m.activityParams) {
        out.isActivityLink = true;
        out.activityParams = m.activityParams;
      }
      return out;
    });

export const fredChatHistory = {
  // Grava (ou regrava) a conversa inteira. Chamado depois de cada
  // troca pergunta/resposta.
  save: async (uid: string, chatId: string, messages: ChatMessage[], createdAt: number): Promise<void> => {
    const stored = toStorable(messages);
    if (!stored.some(m => m.role === 'user')) return; // nada do aluno ainda
    const { title, preview } = buildSummary(stored);
    await setDoc(doc(chatsCol(uid), chatId), {
      title,
      preview,
      messageCount: stored.length,
      createdAt,
      updatedAt: Date.now(),
      messages: stored,
    });
  },

  list: async (uid: string): Promise<FredChatSummary[]> => {
    const snap = await getDocs(query(chatsCol(uid), orderBy('updatedAt', 'desc'), limit(MAX_LISTED)));
    return snap.docs.map(d => {
      const x = d.data() as Partial<FredChatDoc>;
      return {
        id: d.id,
        title: x.title || 'Conversa com o Fred',
        preview: x.preview || '',
        messageCount: x.messageCount || (x.messages?.length ?? 0),
        createdAt: x.createdAt || 0,
        updatedAt: x.updatedAt || 0,
      };
    });
  },

  get: async (uid: string, chatId: string): Promise<FredChatDoc | null> => {
    const snap = await getDoc(doc(chatsCol(uid), chatId));
    if (!snap.exists()) return null;
    const x = snap.data() as FredChatDoc;
    return { ...x, id: snap.id, messages: Array.isArray(x.messages) ? x.messages : [] };
  },

  remove: async (uid: string, chatId: string): Promise<void> => {
    await deleteDoc(doc(chatsCol(uid), chatId));
  },
};

// ── Conversa "em andamento" neste aparelho ──────────────────────
// Guarda no navegador QUAL conversa estava aberta, para o aluno não
// cair numa conversa vazia ao recarregar a página. Depois de
// RESUME_WINDOW sem mexer, o chat abre numa conversa nova (o antigo
// continua na aba Histórico).
const ACTIVE_KEY = (uid: string) => `freedom_fred_chat_active_${uid}`;
export const RESUME_WINDOW = 6 * 60 * 60 * 1000; // 6 horas

export const getActiveChat = (uid: string): { id: string; at: number } | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY(uid));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.id || Date.now() - (v.at || 0) > RESUME_WINDOW) return null;
    return v;
  } catch { return null; }
};

export const setActiveChat = (uid: string, id: string | null) => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY(uid), JSON.stringify({ id, at: Date.now() }));
    else localStorage.removeItem(ACTIVE_KEY(uid));
  } catch { /* navegador sem storage: só não retoma */ }
};
