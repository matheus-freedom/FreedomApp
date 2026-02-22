
import React, { useState, useEffect } from 'react';
import { BookOpen, LogOut, MessageSquare } from 'lucide-react';
import { UserSession } from '../types';
import { api } from '../services/api';

interface HeaderProps {
  onLogout?: () => void;
  onHome?: () => void;
  onOpenChat?: () => void;
  user?: UserSession | null;
}

const Header: React.FC<HeaderProps> = ({ onLogout, onHome, onOpenChat, user }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      const checkMessages = async () => {
        const msgs = await api.getMessages(user.userId);
        const unread = msgs.filter(m => m.receiverId === user.userId && !m.read).length;
        setUnreadCount(unread);
      };
      checkMessages();
      const interval = setInterval(checkMessages, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  return (
    <header className="bg-[#1a1a1a]/80 backdrop-blur-md border-b border-[#f7931e]/30 p-4 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <div 
          className={`flex items-center gap-3 ${onHome ? 'cursor-pointer group' : ''}`}
          onClick={onHome}
        >
          <div className="bg-[#f7931e] p-2 rounded-xl shadow-lg shadow-[#f7931e]/20 group-hover:scale-110 transition-transform">
            <BookOpen className="w-6 h-6 text-[#222222]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter leading-none flex items-center">
              <span className="text-white">FREE</span>
              <span className="text-[#f7931e]">DOM</span>
              <span className="ml-2 bg-[#f7931e] text-[#222222] text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest">BETA</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {onOpenChat && (
            <button 
              onClick={onOpenChat}
              className="relative p-2 text-gray-400 hover:text-[#f7931e] transition-colors"
            >
              <MessageSquare className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#f7931e] text-[#222222] text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#1a1a1a]">
                  {unreadCount}
                </span>
              )}
            </button>
          )}

          {onLogout && (
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 text-gray-400 hover:text-[#f7931e] transition-colors text-xs font-black uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
