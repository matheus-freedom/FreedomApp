
import React, { useState, useEffect, useRef } from 'react';
import { UserSession, DirectMessage } from '../types';
import { api } from '../services/api';
import { 
  ArrowLeft, Send, Search, User, AtSign, 
  Loader2, MessageSquare, Check, CheckCheck,
  MoreVertical, Trash2, Shield
} from 'lucide-react';

interface ChatScreenProps {
  user: UserSession;
  onHome: () => void;
  activeChatUserId?: string | null;
}

const ChatScreen: React.FC<ChatScreenProps> = ({ user, onHome, activeChatUserId }) => {
  const [conversations, setConversations] = useState<{user: UserSession, lastMsg: DirectMessage}[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSession | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadConversations = async () => {
      const allMsgs = await api.getMessages(user.userId);
      const allUsers = await api.admin_getAllUsers();
      
      const userMap: Record<string, DirectMessage> = {};
      allMsgs.forEach(m => {
        const otherId = m.senderId === user.userId ? m.receiverId : m.senderId;
        if (!userMap[otherId] || m.timestamp > userMap[otherId].timestamp) {
          userMap[otherId] = m;
        }
      });

      const convos = Object.entries(userMap).map(([otherId, lastMsg]) => {
        const otherUser = allUsers.find(u => u.userId === otherId);
        return otherUser ? { user: otherUser, lastMsg } : null;
      }).filter(Boolean) as {user: UserSession, lastMsg: DirectMessage}[];

      setConversations(convos.sort((a, b) => b.lastMsg.timestamp - a.lastMsg.timestamp));
      setIsLoading(false);

      if (activeChatUserId) {
        const target = allUsers.find(u => u.userId === activeChatUserId);
        if (target) setSelectedUser(target);
      }
    };
    loadConversations();
  }, [user.userId, activeChatUserId]);

  useEffect(() => {
    if (selectedUser) {
      const loadMessages = async () => {
        const msgs = await api.getMessages(user.userId);
        const filtered = msgs.filter(m => 
          (m.senderId === user.userId && m.receiverId === selectedUser.userId) ||
          (m.senderId === selectedUser.userId && m.receiverId === user.userId)
        );
        setMessages(filtered.sort((a, b) => a.timestamp - b.timestamp));
        await api.markMessagesRead(user.userId, selectedUser.userId);
      };
      loadMessages();
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedUser, user.userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const allUsers = await api.admin_getAllUsers();
    const filtered = allUsers.filter(u => 
      u.userId !== user.userId && 
      (u.username.toLowerCase().includes(query.toLowerCase()) || 
       u.fullName.toLowerCase().includes(query.toLowerCase()))
    );
    setSearchResults(filtered);
    setIsSearching(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;

    const msg = {
      senderId: user.userId,
      receiverId: selectedUser.userId,
      text: newMessage.trim(),
    };

    await api.sendMessage(msg);
    setNewMessage('');
    
    // Refresh local messages
    const msgs = await api.getMessages(user.userId);
    const filtered = msgs.filter(m => 
      (m.senderId === user.userId && m.receiverId === selectedUser.userId) ||
      (m.senderId === selectedUser.userId && m.receiverId === user.userId)
    );
    setMessages(filtered.sort((a, b) => a.timestamp - b.timestamp));
  };

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-120px)] flex flex-col md:flex-row gap-6 p-4 md:p-6 animate-fade-in">
      {/* Sidebar: Conversations & Search */}
      <div className={`w-full md:w-80 flex flex-col bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 shadow-xl overflow-hidden ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-[#f7931e]" /> Conversas
            </h3>
            <button onClick={onHome} className="p-2 text-gray-500 hover:text-white md:hidden">
              <ArrowLeft className="w-6 h-6" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-3 pl-12 pr-4 focus:border-[#f7931e] outline-none text-xs"
              placeholder="Buscar usuários..."
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {searchQuery.length >= 2 ? (
            <div className="p-2 space-y-1">
              <p className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">Resultados da Busca</p>
              {isSearching ? (
                <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 text-[#f7931e] animate-spin" /></div>
              ) : searchResults.length > 0 ? (
                searchResults.map(u => (
                  <button 
                    key={u.userId}
                    onClick={() => { setSelectedUser(u); setSearchQuery(''); }}
                    className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-all rounded-3xl"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#333333] border border-white/10 overflow-hidden flex-shrink-0">
                      {u.profilePhoto ? <img src={u.profilePhoto} className="w-full h-full object-cover" /> : <User className="w-5 h-5 m-auto text-gray-500" />}
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black text-white">{u.username}</p>
                      <p className="text-[10px] text-gray-500 font-bold">{u.fullName}</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-center py-4 text-xs text-gray-500">Nenhum usuário encontrado.</p>
              )}
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-[#f7931e] animate-spin" /></div>
          ) : conversations.length > 0 ? (
            <div className="p-2 space-y-1">
              {conversations.map(convo => (
                <button 
                  key={convo.user.userId}
                  onClick={() => setSelectedUser(convo.user)}
                  className={`w-full flex items-center gap-3 p-4 transition-all rounded-3xl ${selectedUser?.userId === convo.user.userId ? 'bg-[#f7931e]/10 border border-[#f7931e]/20' : 'hover:bg-white/5'}`}
                >
                  <div className="w-12 h-12 rounded-full bg-[#333333] border border-white/10 overflow-hidden flex-shrink-0 relative">
                    {convo.user.profilePhoto ? <img src={convo.user.profilePhoto} className="w-full h-full object-cover" /> : <User className="w-6 h-6 m-auto text-gray-500" />}
                    {!convo.lastMsg.read && convo.lastMsg.receiverId === user.userId && (
                      <div className="absolute top-0 right-0 w-3 h-3 bg-[#f7931e] rounded-full border-2 border-[#2a2a2a]" />
                    )}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-xs font-black text-white truncate">{convo.user.username}</p>
                      <p className="text-[8px] text-gray-500 font-bold">{new Date(convo.lastMsg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                    <p className={`text-[10px] truncate ${!convo.lastMsg.read && convo.lastMsg.receiverId === user.userId ? 'text-[#f7931e] font-black' : 'text-gray-500 font-medium'}`}>
                      {convo.lastMsg.senderId === user.userId ? 'Você: ' : ''}{convo.lastMsg.text}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center space-y-4">
              <MessageSquare className="w-12 h-12 text-gray-600 mx-auto" />
              <p className="text-xs text-gray-500 font-medium">Nenhuma conversa iniciada. Busque um usuário para começar!</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col bg-[#2a2a2a] rounded-[2.5rem] border border-white/5 shadow-xl overflow-hidden ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#2d2d2d]">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedUser(null)} className="p-2 text-gray-500 hover:text-white md:hidden">
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="w-12 h-12 rounded-full bg-[#333333] border-2 border-[#f7931e] overflow-hidden flex-shrink-0">
                  {selectedUser.profilePhoto ? <img src={selectedUser.profilePhoto} className="w-full h-full object-cover" /> : <User className="w-6 h-6 m-auto text-gray-500" />}
                </div>
                <div>
                  <h4 className="text-lg font-black text-white leading-none">{selectedUser.username}</h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{selectedUser.fullName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white transition-all">
                  <Shield className="w-5 h-5" />
                </button>
                <button className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white transition-all">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[#222222]/30">
              {messages.map((m, idx) => {
                const isMe = m.senderId === user.userId;
                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-3xl text-sm font-medium shadow-lg relative group ${isMe ? 'bg-[#f7931e] text-[#222222] rounded-tr-none' : 'bg-[#333333] text-white rounded-tl-none'}`}>
                      <p className="leading-relaxed">{m.text}</p>
                      <div className={`flex items-center gap-1 mt-2 ${isMe ? 'justify-end text-[#222222]/60' : 'justify-start text-gray-500'}`}>
                        <span className="text-[8px] font-black uppercase">{new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        {isMe && (m.read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-6 border-t border-white/5 bg-[#2d2d2d]">
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-6 focus:border-[#f7931e] outline-none text-sm"
                  placeholder="Digite sua mensagem..."
                />
                <button 
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="p-4 bg-[#f7931e] text-[#222222] rounded-2xl font-black hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 shadow-xl shadow-[#f7931e]/20"
                >
                  <Send className="w-6 h-6" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-6">
            <div className="w-24 h-24 bg-[#333333] rounded-full flex items-center justify-center border-2 border-dashed border-white/10">
              <MessageSquare className="w-12 h-12 text-gray-600" />
            </div>
            <div>
              <h4 className="text-2xl font-black text-white uppercase tracking-tighter">Suas Mensagens</h4>
              <p className="text-gray-500 max-w-xs mx-auto text-sm font-medium mt-2">Selecione uma conversa ou busque um usuário para começar a interagir.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatScreen;
