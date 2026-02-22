
import React, { useState, useEffect } from 'react';
import { UserSession, UserTier, AccessType } from '../types';
import { api } from '../services/api';
import { 
  X, User, MessageSquare, Sword, Heart, 
  Shield, Zap, Brain, Target, Crown,
  Users, Flame, Trophy, Loader2, Check, UserPlus, UserMinus, Clock
} from 'lucide-react';

interface ProfileViewModalProps {
  currentUser: UserSession;
  targetUserId: string;
  onClose: () => void;
  onOpenChat: (userId: string) => void;
  onOpenChallenge: (userId: string) => void;
  onUserUpdate: (user: UserSession) => void;
}

const TIER_THRESHOLDS = [
  { tier: UserTier.Starter, min: 0, max: 5000, color: 'text-gray-400', bg: 'bg-gray-400/10', icon: <Shield className="w-5 h-5" /> },
  { tier: UserTier.Warrior, min: 5001, max: 15000, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: <Zap className="w-5 h-5" /> },
  { tier: UserTier.Genius, min: 15001, max: 35000, color: 'text-purple-400', bg: 'bg-purple-400/10', icon: <Brain className="w-5 h-5" /> },
  { tier: UserTier.Pro, min: 35001, max: 60000, color: 'text-orange-400', bg: 'bg-orange-400/10', icon: <Target className="w-5 h-5" /> },
  { tier: UserTier.Legend, min: 60001, max: Infinity, color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: <Crown className="w-5 h-5" /> },
];

const ProfileViewModal: React.FC<ProfileViewModalProps> = ({ 
  currentUser, 
  targetUserId, 
  onClose, 
  onOpenChat, 
  onOpenChallenge,
  onUserUpdate
}) => {
  const [targetUser, setTargetUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState<'none' | 'pending' | 'following'>('none');

  useEffect(() => {
    const loadUser = async () => {
      const allUsers = await api.admin_getAllUsers();
      const found = allUsers.find(u => u.userId === targetUserId);
      if (found) {
        setTargetUser(found);
        
        const followers = found.gamification.followers || [];
        const requests = found.gamification.followRequests || [];

        if (followers.includes(currentUser.userId)) {
          setFollowStatus('following');
        } else if (requests.includes(currentUser.userId)) {
          setFollowStatus('pending');
        } else {
          setFollowStatus('none');
        }
      }
      setIsLoading(false);
    };
    loadUser();
  }, [targetUserId, currentUser.userId]);

  const handleFollow = async () => {
    if (!targetUser) return;
    if (followStatus === 'none') {
      await api.sendFollowRequest(currentUser.userId, targetUser.userId);
      setFollowStatus('pending');
    } else if (followStatus === 'following') {
      await api.unfollow(currentUser.userId, targetUser.userId);
      setFollowStatus('none');
      // Update current user locally to reflect unfollowing
      const updatedUser = { ...currentUser };
      updatedUser.gamification.following = updatedUser.gamification.following.filter(id => id !== targetUser.userId);
      onUserUpdate(updatedUser);
    }
  };

  if (isLoading) return null;
  if (!targetUser) return null;

  const tierInfo = TIER_THRESHOLDS.find(t => targetUser.gamification.xp >= t.min && targetUser.gamification.xp <= t.max) || TIER_THRESHOLDS[0];

  return (
    <div className="fixed inset-0 z-[600] bg-[#222222]/95 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#2a2a2a] w-full max-w-md rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden animate-pop" onClick={e => e.stopPropagation()}>
        <div className="relative h-32 bg-gradient-to-r from-[#f7931e]/20 to-purple-500/20">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-8 pb-8 -mt-12 text-center">
          <div className="relative inline-block mb-4">
            <div className={`w-24 h-24 rounded-full border-4 ${tierInfo.color.replace('text-', 'border-')} bg-[#222222] overflow-hidden shadow-2xl mx-auto`}>
              {targetUser.profilePhoto ? (
                <img src={targetUser.profilePhoto} className="w-full h-full object-cover" />
              ) : (
                <div className={`${tierInfo.color} flex items-center justify-center h-full scale-150`}>
                  {tierInfo.icon}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-[#f7931e] text-[#222222] px-2 py-0.5 rounded-lg text-[10px] font-black shadow-lg">
              LV.{TIER_THRESHOLDS.indexOf(tierInfo) + 1}
            </div>
          </div>

          <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{targetUser.username}</h3>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">{targetUser.fullName}</p>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-3 bg-[#222222] rounded-2xl border border-white/5">
              <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Seguidores</p>
              <p className="text-lg font-black text-white">{targetUser.gamification.followers?.length || 0}</p>
            </div>
            <div className="p-3 bg-[#222222] rounded-2xl border border-white/5">
              <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Seguindo</p>
              <p className="text-lg font-black text-white">{targetUser.gamification.following?.length || 0}</p>
            </div>
            <div className="p-3 bg-[#222222] rounded-2xl border border-white/5">
              <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Atividades</p>
              <p className="text-lg font-black text-white">{targetUser.gamification.totalActivities || 0}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleFollow}
                className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                  followStatus === 'following' 
                    ? 'bg-[#333333] text-white border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500' 
                    : followStatus === 'pending'
                    ? 'bg-[#333333] text-gray-400 border border-white/5 cursor-default'
                    : 'bg-[#f7931e] text-[#222222] hover:scale-105'
                }`}
              >
                {followStatus === 'following' ? (
                  <><UserMinus className="w-4 h-4" /> Seguindo</>
                ) : followStatus === 'pending' ? (
                  <><Clock className="w-4 h-4" /> Pendente</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Seguir</>
                )}
              </button>
              <button 
                onClick={() => { onClose(); onOpenChat(targetUser.userId); }}
                className="flex items-center justify-center gap-2 py-4 bg-[#333333] text-white rounded-2xl font-black uppercase tracking-widest text-xs border border-white/5 hover:bg-[#444444] transition-all"
              >
                <MessageSquare className="w-4 h-4" /> Mensagem
              </button>
            </div>
            <button 
              onClick={() => { onClose(); onOpenChallenge(targetUser.userId); }}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#222222] text-[#f7931e] border border-[#f7931e]/30 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#f7931e] hover:text-[#222222] transition-all"
            >
              <Sword className="w-4 h-4" /> Desafiar para Duelo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileViewModal;
