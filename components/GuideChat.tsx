
import React, { useState, useEffect, useRef } from 'react';
import { GuideCharacter, ChatMessage, Level, Theme, UserSession } from '../types';
import { chatWithGuide } from '../services/geminiService';
import { api } from '../services/api';
import { User, MessageCircle, X, Send, Play, Loader2, AlertCircle, Clock } from 'lucide-react';
import { FRED_FACE } from './FredAvatar';

interface GuideChatProps {
  guide: GuideCharacter;
  userName: string;
  user: UserSession;
  onUserUpdate: (user: UserSession) => void;
  onGenerateActivity: (level: Level, theme: Theme, topic: string) => void;
}

const MAX_DAILY_CHAT = 3;

const GuideChat: React.FC<GuideChatProps> = ({ guide, userName, user, onUserUpdate, onGenerateActivity }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const chatCount = user.gamification.lastChatDate === today ? user.gamification.dailyChatCount : 0;
  const isLimitReached = chatCount >= MAX_DAILY_CHAT;

  // Helper para limpar caracteres de markdown indesejados
  const formatBotText = (text: string): string => {
    return text
      .replace(/\*\*/g, '')          // Remove negrito
      .replace(/###/g, '')           // Remove headers nível 3
      .replace(/##/g, '')            // Remove headers nível 2
      .replace(/#/g, '')             // Remove headers nível 1
      .replace(/---/g, '')           // Remove divisores
      .replace(/\\n/g, '\n')         // Converte literal \n em quebra de linha real
      .replace(/`([^`]+)`/g, '$1')   // Remove backticks de código simples
      .trim();
  };

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      const limitInfo = `\n\n⚠️ Lembre-se: Como seu assistente, posso tirar até ${MAX_DAILY_CHAT} dúvidas por dia para manter seu foco. Escolha bem as suas perguntas.`;
      
      const greeting = guide === 'Fred' 
        ? `Olá, eu sou o Fred! Bem-vindo à versão Beta da plataforma de exercícios da Freedom. Estou aqui para te ajudar a evoluir no inglês. Como posso ser útil hoje?\n\n• Tire dúvidas gramaticais\n• Peça novos vocabulários\n• Peça exemplos, dicas e ideias${limitInfo}` 
        : `Olá, eu sou a Frida! Que bom te ver na versão Beta da plataforma de exercícios da Freedom. Pronta para praticar? Conte comigo para qualquer dúvida ou dica!\n\n• Tire dúvidas gramaticais\n• Peça novos vocabulários\n• Peça exemplos, dicas e ideias${limitInfo}`;
      
      setMessages([{
        id: 'init',
        role: 'model',
        text: greeting
      }]);
    }
  }, [guide, userName]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isTyping]);

  const handleSend = async () => {
    if (!inputText.trim() || isLimitReached) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: inputText
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

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
      const newMessages = await chatWithGuide(messages, inputText, userName, guide);
      setMessages(prev => [...prev, ...newMessages]);
    } catch (error) {
      console.error("Chat error", error);
      // Add error message to chat
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        text: error instanceof Error ? error.message : "Desculpe, estou com dificuldades de conexão agora. Tente novamente em alguns instantes."
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 md:w-96 bg-[#222222] border border-[#f7931e]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in origin-bottom-right h-[500px] max-h-[80vh]">
          {/* Header */}
          <div className="bg-[#333333] p-4 flex items-center justify-between border-b border-[#444444]">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 overflow-hidden ${guide === 'Fred' ? 'bg-blue-900/50 border-blue-500' : 'bg-pink-900/50 border-pink-500'}`}>
                {guide === 'Fred'
                  ? <img src={FRED_FACE} alt="Fred" className="w-full h-full object-cover select-none" draggable={false} />
                  : <User className="w-6 h-6 text-pink-400" />
                }
              </div>
              <div>
                <h3 className="font-bold text-white">{guide}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#f7931e] flex items-center gap-1 font-black uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Beta Guide
                  </span>
                  <span className="text-[9px] text-gray-400 font-bold uppercase">
                    ({chatCount}/{MAX_DAILY_CHAT})
                  </span>
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#1a1a1a]">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' 
                      ? 'bg-[#f7931e] text-[#222222] rounded-tr-none font-medium shadow-lg' 
                      : 'bg-[#333333] text-gray-200 border border-[#444444] rounded-tl-none'
                  }`}
                >
                  {msg.role === 'model' ? formatBotText(msg.text) : msg.text}
                  
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
