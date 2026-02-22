
import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowRight, Loader2, User, Calendar, Users, AtSign, AlertCircle, CheckCircle2, UserPlus, HelpCircle, BookOpen, Key, ArrowLeft, Send, Sparkles, Camera } from 'lucide-react';
import { api } from '../services/api';
import { UserSession } from '../types';

interface LoginScreenProps {
  onLogin: (user: UserSession) => void;
}

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  
  // States comuns
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Login/Forgot specific
  const [loginIdentifier, setLoginIdentifier] = useState(''); 

  // Signup specific
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Masculino');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Reset specific
  const [resetToken, setResetToken] = useState('');

  // Verificar disponibilidade do username em tempo real
  useEffect(() => {
    if (mode !== 'signup' || !username || username.length < 4) {
      setUsernameStatus('idle');
      return;
    }

    const timer = setTimeout(async () => {
      setUsernameStatus('checking');
      const cleanUsername = username.startsWith('@') ? username : `@${username}`;
      const taken = await api.isUsernameTaken(cleanUsername);
      setUsernameStatus(taken ? 'taken' : 'available');
      if (taken) {
        setError("Este nome de usuário já está em utilização.");
      } else {
        setError(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, mode]);

  const handleUsernameChange = (val: string) => {
    let formatted = val.toLowerCase().replace(/\s/g, '');
    if (formatted && !formatted.startsWith('@')) {
      formatted = '@' + formatted;
    }
    setUsername(formatted);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);
    
    try {
      if (mode === 'login') {
        const user = await api.login(loginIdentifier, password);
        if (user) {
          onLogin(user);
        } else {
          setError("Usuário não encontrado ou senha incorreta.");
        }
      } else if (mode === 'signup') {
        if (usernameStatus === 'taken') {
          setError("Este nome de usuário já está em utilização.");
        } else if (!username.startsWith('@') || username.length < 3) {
          setError("O nome de usuário deve começar com @ e ter pelo menos 2 caracteres.");
        } else {
          const newUser = await api.register({ 
            username, 
            fullName, 
            age, 
            gender, 
            email, 
            password,
            profilePhoto: profilePhoto || undefined 
          });
          onLogin(newUser);
        }
      } else if (mode === 'forgot') {
        const result = await api.requestPasswordReset(email);
        if (result.success) {
          setSuccessMsg(`Um link de recuperação foi enviado para ${email}.`);
          setResetToken(result.resetToken || '');
          setTimeout(() => setMode('reset'), 3000);
        } else {
          setError("Não encontramos uma conta vinculada a este e-mail.");
        }
      } else if (mode === 'reset') {
        const success = await api.resetPassword(email, password);
        if (success) {
          setSuccessMsg("Sua senha foi redefinida com sucesso! Você já pode entrar.");
          setTimeout(() => setMode('login'), 2000);
        } else {
          setError("Erro ao redefinir a senha. Tente novamente.");
        }
      }
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro inesperado.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderHeader = () => {
    let title = 'Login do Aluno';
    let subtitle = 'Acesse sua conta para continuar sua jornada rumo à fluência.';
    
    if (mode === 'signup') {
      title = 'Novo Perfil';
      subtitle = 'Crie seu perfil único e comece a aprender agora mesmo.';
    } else if (mode === 'forgot') {
      title = 'Recuperar Senha';
      subtitle = 'Informe seu e-mail para receber as instruções de recuperação.';
    } else if (mode === 'reset') {
      title = 'Nova Senha';
      subtitle = 'Defina uma nova senha segura para sua conta Freedom.';
    }

    return (
      <div className="text-center mb-10">
        <h2 className="text-4xl font-black text-white mb-1 uppercase tracking-tighter flex items-center justify-center gap-1">
          <span>FREE</span><span className="text-[#f7931e]">DOM</span>
        </h2>
        <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-[10px] mb-6">
          {title}
        </p>
        <p className="text-gray-400 text-sm font-medium px-4">
          {subtitle}
        </p>
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto pt-16 pb-24 px-4 animate-fade-in">
      {renderHeader()}

      <div className="bg-[#2a2a2a] rounded-[2.5rem] p-8 border border-white/5 shadow-2xl relative overflow-hidden">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-bold animate-pop">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-2xl flex items-center gap-3 text-green-400 text-xs font-bold animate-pop">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p>{successMsg}</p>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {mode === 'login' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">E-mail ou Usuário</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="text" 
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] focus:outline-none text-sm transition-all"
                    placeholder="ex: @voce ou email@exemplo.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Senha</label>
                  <button 
                    type="button" 
                    onClick={() => setMode('forgot')}
                    className="text-[9px] font-black text-[#f7931e] uppercase hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] focus:outline-none text-sm transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'signup' && (
            <>
              <div className="flex flex-col items-center mb-6">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-full bg-[#222222] border-2 border-dashed border-[#333333] flex items-center justify-center cursor-pointer hover:border-[#f7931e] transition-all overflow-hidden relative group"
                >
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-500 group-hover:text-[#f7931e]">
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="text-[8px] font-black uppercase">Foto</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handlePhotoUpload} 
                  className="hidden" 
                  accept="image/*" 
                />
                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mt-2">Toque para carregar sua foto</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome de Usuário</label>
                <div className="relative">
                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    className={`w-full bg-[#222222] border ${usernameStatus === 'taken' ? 'border-red-500' : 'border-[#333333]'} text-white rounded-2xl py-4 pl-12 pr-12 focus:border-[#f7931e] focus:outline-none text-sm transition-all`}
                    placeholder="@seunome"
                    required
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-[#f7931e] animate-spin" />}
                    {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    {usernameStatus === 'taken' && <AlertCircle className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] focus:outline-none text-sm"
                    placeholder="Seu nome completo"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Data de nascimento</label>
                  <input 
                    type="date" 
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-[#f7931e] focus:outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Gênero</label>
                  <select 
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-[#f7931e] focus:outline-none text-sm appearance-none"
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] focus:outline-none text-sm"
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] focus:outline-none text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'forgot' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Informe seu E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] focus:outline-none text-sm transition-all"
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">E-mail Confirmado</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="email" 
                    value={email}
                    disabled
                    className="w-full bg-[#1a1a1a] border border-[#333333] text-gray-500 rounded-2xl py-4 pl-12 pr-4 text-sm cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nova Senha</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] focus:outline-none text-sm transition-all"
                    placeholder="Sua nova senha segura"
                  />
                </div>
              </div>
            </>
          )}

          <div className="pt-6">
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl ${
                isLoading 
                  ? 'bg-[#444444] text-gray-500 cursor-not-allowed opacity-50' 
                  : 'bg-[#f7931e] text-[#222222] hover:bg-[#e08215] shadow-[#f7931e]/20'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === 'login' && 'Entrar Agora'}
                  {mode === 'signup' && 'Finalizar Cadastro'}
                  {mode === 'forgot' && 'Enviar Instruções'}
                  {mode === 'reset' && 'Atualizar Senha'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5 text-center flex flex-col gap-4">
          {mode === 'login' ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Novo por aqui?</p>
                <button 
                  onClick={() => { setMode('signup'); setError(null); setSuccessMsg(null); }}
                  className="w-full py-4 rounded-2xl border-2 border-white/5 text-gray-400 font-black uppercase tracking-widest text-[11px] hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" /> Criar minha conta Freedom
                </button>
              </div>
            </>
          ) : (
            <button 
              onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
              className="w-full py-4 rounded-2xl text-gray-400 font-black uppercase tracking-widest text-[11px] hover:text-white transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar para o Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
