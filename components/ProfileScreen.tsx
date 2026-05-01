import React, { useState, useRef, useEffect } from 'react';
import { UserSession, GuideCharacter } from '../types';
import { api } from '../services/api';
import { 
  ArrowLeft, Camera, User, Mail, Calendar, Users, 
  Check, X, Loader2, AtSign, Shield, Zap, Flame, Star, Layers, Save, Trash2, Coins,
  Clock, UserCheck, UserX, Bot
} from 'lucide-react';

interface ProfileScreenProps {
  user: UserSession;
  onHome: () => void;
  onUpdate: (user: UserSession) => void;
}

const formatFR = (value: number) => {
  return "FR$ " + (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ProfileScreen: React.FC<ProfileScreenProps> = ({ user, onHome, onUpdate }) => {
  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.fullName);
  const [age, setAge] = useState(user.age);
  const [gender, setGender] = useState(user.gender);
  const [email, setEmail] = useState(user.email);
  const [selectedGuide, setSelectedGuide] = useState<GuideCharacter>(user.guide || 'Fred');

  const [profilePhotoPreview, setProfilePhotoPreview] = useState(user.profilePhoto || '');
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [followRequests, setFollowRequests] = useState<UserSession[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadRequests = async () => {
      const requests = user.gamification.followRequests || [];
      if (requests.length > 0) {
        setIsLoadingRequests(true);
        const allUsers = await api.admin_getAllUsers();
        const requesters = allUsers.filter(u => requests.includes(u.userId));
        setFollowRequests(requesters);
        setIsLoadingRequests(false);
      }
    };
    loadRequests();
  }, [user.gamification.followRequests]);

  const handleUsernameChange = async (val: string) => {
    let formatted = val.toLowerCase().replace(/\s/g, '');
    if (formatted && !formatted.startsWith('@')) formatted = '@' + formatted;
    setUsername(formatted);

    if (formatted === user.username) {
      setUsernameStatus('idle');
      return;
    }

    if (formatted.length < 4) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const taken = await api.isUsernameTaken(formatted);
    setUsernameStatus(taken ? 'taken' : 'available');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedPhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setError(null);
    if (usernameStatus === 'taken') {
      setError("Este nome de usuário já está em uso.");
      return;
    }
    if (username.length < 4) {
      setError("O nome de usuário deve ser mais longo.");
      return;
    }

    setIsSaving(true);
    try {
      let finalPhotoUrl = user.profilePhoto;
      if (selectedPhotoFile) {
        finalPhotoUrl = await api.uploadProfilePhoto(user.userId, selectedPhotoFile);
      }

      // Atualiza o guide se mudou
      if (selectedGuide !== user.guide) {
        await api.updateGuide(user.userId, selectedGuide);
      }

      const updatedUser: UserSession = {
        ...user,
        username,
        fullName,
        age,
        gender,
        email,
        profilePhoto: finalPhotoUrl,
        guide: selectedGuide,
        userName: fullName.split(' ')[0] || username.replace('@', '')
      };
      
      await api.saveUser(updatedUser);
      onUpdate(updatedUser);
      setIsSaving(false);
      alert("Perfil atualizado com sucesso!");
    } catch (e: any) {
      setError(e.message || "Erro ao salvar perfil.");
      setIsSaving(false);
    }
  };

  const handleRespondRequest = async (requesterId: string, accept: boolean) => {
    await api.respondToFollowRequest(user.userId, requesterId, accept);
    const updatedRequests = (user.gamification.followRequests || []).filter(id => id !== requesterId);
    const updatedFollowers = accept ? [...(user.gamification.followers || []), requesterId] : (user.gamification.followers || []);
    const updatedFollowing = accept ? [...(user.gamification.following || []), requesterId] : (user.gamification.following || []);
    
    const updatedUser = { 
      ...user, 
      gamification: { 
        ...user.gamification, 
        followRequests: updatedRequests,
        followers: updatedFollowers,
        following: updatedFollowing
      } 
    };
    onUpdate(updatedUser);
    setFollowRequests(prev => prev.filter(r => r.userId !== requesterId));
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 animate-fade-in space-y-8">
      <div className="flex items-center gap-4">
        <button 
          onClick={onHome} 
          className="p-3 bg-[#333333] text-gray-400 rounded-2xl border border-white/5 hover:text-white hover:border-[#f7931e]/50 transition-all"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Meu Perfil</h2>
          <p className="text-gray-400 text-sm">Gerencie suas informações e sua identidade Freedom.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="bg-[#2a2a2a] p-8 rounded-[2.5rem] border border-white/5 shadow-xl flex flex-col items-center">
            <div className="relative group">
              <div className="w-40 h-40 rounded-full border-4 border-[#f7931e] bg-[#222222] overflow-hidden shadow-2xl relative">
                {profilePhotoPreview ? (
                  <img src={profilePhotoPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#333333]">
                    <User className="w-20 h-20 text-gray-500" />
                  </div>
                )}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera className="w-8 h-8 text-white mb-1" />
                  <span className="text-[10px] font-black uppercase text-white">Alterar Foto</span>
                </button>
              </div>
              <div className="absolute -bottom-2 -right-2 bg-[#f7931e] text-[#222222] p-2 rounded-full shadow-lg">
                <Shield className="w-5 h-5" />
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoUpload} 
                className="hidden" 
                accept="image/*" 
              />
            </div>

            <div className="text-center mt-6">
              <h3 className="text-xl font-black text-white">{username}</h3>
              <p className="text-gray-500 font-bold uppercase text-[10px] tracking-[0.2em]">{user.fullName}</p>
              {/* Badge do guia atual */}
              <div className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${user.guide === 'Fred' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-pink-500/10 border-pink-500/30 text-pink-400'}`}>
                <Bot className="w-3 h-3" />
                Guia: {user.guide || 'Fred'}
              </div>
            </div>

            <div className="mt-8 w-full space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-[#222222] rounded-2xl border border-white/5 text-center">
                  <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Seguidores</p>
                  <p className="text-lg font-black text-white">{user.gamification.followers?.length || 0}</p>
                </div>
                <div className="p-4 bg-[#222222] rounded-2xl border border-white/5 text-center">
                  <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Seguindo</p>
                  <p className="text-lg font-black text-white">{user.gamification.following?.length || 0}</p>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-[#222222] rounded-2xl border border-white/5">
                <span className="text-[10px] font-black text-gray-500 uppercase">XP Acumulado</span>
                <span className="text-sm font-black text-white">{user.gamification.xp.toLocaleString()} XP</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-[#222222] rounded-2xl border border-white/5">
                <span className="text-[10px] font-black text-gray-500 uppercase">Saldo Freedom Reais</span>
                <span className="text-sm font-black text-[#f7931e]">{formatFR(user.gamification.frBalance)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-[#222222] rounded-2xl border border-white/5">
                <span className="text-[10px] font-black text-gray-500 uppercase">Ofensiva</span>
                <span className="text-sm font-black text-[#f7931e] flex items-center gap-1">
                  <Flame className="w-4 h-4 fill-current" /> {user.gamification.streak} dias
                </span>
              </div>
            </div>
          </div>

          {/* Solicitações de follow */}
          {(followRequests.length > 0 || isLoadingRequests) && (
            <div className="bg-[#2a2a2a] p-8 rounded-[2.5rem] border border-white/5 shadow-xl space-y-6">
              <h3 className="text-lg font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                <Clock className="w-5 h-5 text-[#f7931e]" /> Solicitações
              </h3>
              <div className="space-y-4">
                {isLoadingRequests ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 text-[#f7931e] animate-spin" /></div>
                ) : (
                  followRequests.map(req => (
                    <div key={req.userId} className="flex items-center justify-between p-4 bg-[#222222] rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#333333] overflow-hidden">
                          {req.profilePhoto ? <img src={req.profilePhoto} className="w-full h-full object-cover" /> : <User className="w-5 h-5 m-auto text-gray-500" />}
                        </div>
                        <p className="text-xs font-black text-white">{req.username}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleRespondRequest(req.userId, true)}
                          className="p-2 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleRespondRequest(req.userId, false)}
                          className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Formulário de edição */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#2a2a2a] p-8 rounded-[2.5rem] border border-white/5 shadow-xl space-y-6">
            <h3 className="text-xl font-black text-white flex items-center gap-3 border-b border-white/5 pb-4 uppercase tracking-tighter">
              <AtSign className="w-6 h-6 text-[#f7931e]" /> Informações da Conta
            </h3>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-bold animate-pop flex items-center gap-2">
                <X className="w-4 h-4" /> {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome de Usuário</label>
                <div className="relative">
                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    className={`w-full bg-[#222222] border ${usernameStatus === 'taken' ? 'border-red-500' : 'border-[#333333]'} text-white rounded-2xl py-4 pl-12 pr-12 focus:border-[#f7931e] outline-none text-sm`}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-[#f7931e] animate-spin" />}
                    {usernameStatus === 'available' && <Check className="w-4 h-4 text-green-500" />}
                    {usernameStatus === 'taken' && <X className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
              </div>

              {/* Nome completo */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] outline-none text-sm"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-12 pr-4 focus:border-[#f7931e] outline-none text-sm"
                  />
                </div>
              </div>

              {/* Data e gênero */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nascimento</label>
                  <input 
                    type="date" 
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-[#f7931e] outline-none text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Gênero</label>
                  <select 
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 px-4 focus:border-[#f7931e] outline-none text-sm appearance-none"
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>

              {/* Guia de IA — dropdown */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" /> Assistente de IA (Guia)
                </label>
                <div className="relative">
                  <select
                    value={selectedGuide}
                    onChange={(e) => setSelectedGuide(e.target.value as GuideCharacter)}
                    className="w-full bg-[#222222] border border-[#333333] text-white rounded-2xl py-4 pl-4 pr-10 focus:border-[#f7931e] outline-none text-sm appearance-none cursor-pointer"
                  >
                    <option value="Fred">Fred — Analítico e detalhista, explica gramática em detalhes</option>
                    <option value="Frida">Frida — Energética e criativa, incentiva você a praticar</option>
                  </select>
                  {/* Ícone indicativo da seleção atual */}
                  <div className={`absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center ${selectedGuide === 'Fred' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>
                    <Bot className="w-3 h-3" />
                  </div>
                </div>
                {selectedGuide !== user.guide && (
                  <p className="text-[9px] text-[#f7931e] font-black uppercase tracking-widest ml-1 flex items-center gap-1">
                    ✦ Guia será atualizado ao salvar
                  </p>
                )}
              </div>
            </div>

            <div className="pt-8 border-t border-white/5 flex gap-4">
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#e08215] transition-all disabled:opacity-50 shadow-xl shadow-[#f7931e]/20"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Salvar Alterações
              </button>
              <button 
                onClick={onHome}
                className="px-8 py-5 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-[#444444] transition-all border border-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileScreen;
