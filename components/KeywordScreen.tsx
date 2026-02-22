
import React, { useState } from 'react';
import { Key, ArrowRight, Lock, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { AccessType } from '../types';

interface KeywordScreenProps {
  onSuccess: (accessType: AccessType) => void;
  onLogout: () => void;
}

const KeywordScreen: React.FC<KeywordScreenProps> = ({ onSuccess, onLogout }) => {
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = keyword.toLowerCase().trim();
    if (val === 'thebestschool') {
      onSuccess(AccessType.FULL);
    } else if (val === 'desafio') {
      onSuccess(AccessType.CHALLENGE_ONLY);
    } else {
      setError(true);
      setTimeout(() => setError(false), 3000);
    }
  };

  return (
    <div className="max-w-md mx-auto pt-20 px-4 animate-fade-in">
      <div className="text-center mb-10">
        <div className="inline-block p-4 bg-[#f7931e]/10 rounded-full mb-4">
          <ShieldCheck className="w-12 h-12 text-[#f7931e]" />
        </div>
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Acesso Restrito</h2>
        <p className="text-gray-400 text-sm font-medium">
          Para garantir a segurança do ambiente Freedom, insira a palavra-chave de acesso à plataforma.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#2a2a2a] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Palavra-Chave</label>
          <div className="relative">
            <Key className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${error ? 'text-red-500' : 'text-gray-500'}`} />
            <input 
              type="password" 
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Digite o código de acesso..."
              className={`w-full bg-[#222222] border-2 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none transition-all ${error ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#333333] focus:border-[#f7931e]'}`}
              autoFocus
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-500 text-[10px] font-bold uppercase tracking-wider mt-2 animate-pop">
              <AlertCircle className="w-3 h-3" /> Chave de acesso incorreta. Tente novamente.
            </div>
          )}
        </div>

        <button 
          type="submit"
          className="w-full py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-xl shadow-[#f7931e]/20"
        >
          Validar Acesso <ArrowRight className="w-5 h-5" />
        </button>

        <button 
          type="button"
          onClick={onLogout}
          className="w-full py-3 text-gray-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest"
        >
          Sair da conta
        </button>
      </form>

      <div className="mt-12 text-center">
        <p className="text-[9px] text-gray-600 font-black uppercase tracking-[0.3em] max-w-[250px] mx-auto leading-relaxed">
          Freedom English School &copy; 2024 <br/> Autenticação Obrigatória Beta
        </p>
      </div>
    </div>
  );
};

export default KeywordScreen;
