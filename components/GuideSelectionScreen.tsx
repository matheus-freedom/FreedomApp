
import React from 'react';
import { GuideCharacter } from '../types';
import { Bot, User, ArrowLeft } from 'lucide-react';

interface GuideSelectionScreenProps {
  onSelect: (guide: GuideCharacter) => void;
  userName: string;
  // Added onHome to allow going back to the main screen
  onHome: () => void;
}

const GuideSelectionScreen: React.FC<GuideSelectionScreenProps> = ({ onSelect, userName, onHome }) => {
  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade-in flex flex-col items-center justify-center min-h-[70vh]">
      {/* Added Back button container */}
      <div className="w-full max-w-2xl mb-4">
        <button onClick={onHome} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
      </div>

      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Hello, <span className="text-[#f7931e]">{userName}</span>!
        </h2>
        <p className="text-gray-400 text-lg max-w-lg mx-auto">
          Choose your personal AI guide. They will be with you throughout your journey to answer questions and help you practice.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-2xl">
        {/* Fred */}
        <button 
          onClick={() => onSelect('Fred')}
          className="group relative bg-[#333333] border-2 border-[#444444] hover:border-[#f7931e] rounded-3xl p-8 flex flex-col items-center transition-all duration-300 hover:transform hover:scale-105 hover:shadow-[0_0_30px_rgba(247,147,30,0.2)]"
        >
          <div className="w-32 h-32 bg-blue-500/20 rounded-full flex items-center justify-center mb-6 group-hover:bg-blue-500/30 transition-colors">
             <Bot className="w-16 h-16 text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Fred</h3>
          <p className="text-gray-400 text-center text-sm mb-6">
            Helpful, calm, and analytical. I'll explain grammar in detail and help you with structure.
          </p>
          <div className="mt-auto px-6 py-2 rounded-full bg-[#222222] text-[#f7931e] font-bold text-sm border border-[#f7931e]/30 group-hover:bg-[#f7931e] group-hover:text-[#222222] transition-colors">
            Select Fred
          </div>
        </button>

        {/* Frida */}
        <button 
          onClick={() => onSelect('Frida')}
          className="group relative bg-[#333333] border-2 border-[#444444] hover:border-[#f7931e] rounded-3xl p-8 flex flex-col items-center transition-all duration-300 hover:transform hover:scale-105 hover:shadow-[0_0_30px_rgba(247,147,30,0.2)]"
        >
          <div className="w-32 h-32 bg-pink-500/20 rounded-full flex items-center justify-center mb-6 group-hover:bg-pink-500/30 transition-colors">
             <User className="w-16 h-16 text-pink-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Frida</h3>
          <p className="text-gray-400 text-center text-sm mb-6">
            Energetic, creative, and fun! I'll encourage you to speak and learn through practice.
          </p>
          <div className="mt-auto px-6 py-2 rounded-full bg-[#222222] text-[#f7931e] font-bold text-sm border border-[#f7931e]/30 group-hover:bg-[#f7931e] group-hover:text-[#222222] transition-colors">
            Select Frida
          </div>
        </button>
      </div>
    </div>
  );
};

export default GuideSelectionScreen;
