
import React, { useState, useMemo } from 'react';
import { StudyPlan, StudyTask, StudyWeek, StudyDay, Theme, ActivityRecord, UserSession } from '../types';
import { Home, Download, FileSpreadsheet, FileText, CheckCircle, Circle, Trophy, Calendar, PieChart, ArrowRight, PlayCircle, RefreshCw, Trash2, Target, BarChart2, X, Play, Clock, History, Heart, Lock, Instagram, AlertTriangle } from 'lucide-react';

interface DashboardScreenProps {
  plan: StudyPlan;
  user: UserSession;
  history: ActivityRecord[];
  onUpdatePlan: (updatedPlan: StudyPlan) => void;
  onHome: () => void;
  onResetPlan: () => void;
  onStartTask: (task: StudyTask) => void;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ plan, user, history, onUpdatePlan, onHome, onResetPlan, onStartTask }) => {
  const [activeWeek, setActiveWeek] = useState(0);
  const [selectedTask, setSelectedTask] = useState<{
    task: StudyTask;
    weekIndex: number;
    dayIndex: number;
    taskIndex: number;
  } | null>(null);
  const [showChallengeSuccess, setShowChallengeSuccess] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const toggleTask = (weekIndex: number, dayIndex: number, taskIndex: number, isLateRecovery = false) => {
    if (!plan.weeks[weekIndex]?.days[dayIndex]?.tasks[taskIndex]) return;

    const newPlan = { ...plan };
    const task = newPlan.weeks[weekIndex].days[dayIndex].tasks[taskIndex];
    
    // Challenge Mode Logic
    if (plan.isChallenge) {
        // If completing, check for daily completion
        if (!task.isCompleted) {
            const dayTasks = newPlan.weeks[weekIndex].days[dayIndex].tasks;
            const allOthersCompleted = dayTasks.every((t, idx) => idx === taskIndex || t.isCompleted);
            
            if (allOthersCompleted) {
                setShowChallengeSuccess(true);
            }
        }
    }

    task.isCompleted = !task.isCompleted;
    if (!task.isCompleted) {
        delete task.score;
        delete task.totalQuestions;
    }
    newPlan.completedTasks = task.isCompleted ? (newPlan.completedTasks || 0) + 1 : Math.max(0, (newPlan.completedTasks || 0) - 1);
    onUpdatePlan(newPlan);
    setSelectedTask(null);
  };

  const calculateProgress = () => {
    if (!plan.totalTasks || plan.totalTasks === 0) return 0;
    return Math.round(((plan.completedTasks || 0) / plan.totalTasks) * 100);
  };

  const exportPlanAsText = () => {
    let content = `PLANO DE ESTUDOS PERSONALIZADO FREEDOM\n`;
    content += `==========================================\n`;
    content += `ALUNO: ${user.fullName}\n`;
    content += `NÍVEL CEFR: ${plan.inputs.level}\n`;
    content += `FOCO: ${plan.inputs.focusSkill}\n`;
    content += `DURAÇÃO: ${plan.inputs.duration}\n`;
    content += `DATA DE CRIAÇÃO: ${new Date(plan.createdAt).toLocaleDateString()}\n`;
    content += `==========================================\n\n`;

    plan.weeks.forEach((week, wIdx) => {
      content += `SEMANA ${week.weekNumber || wIdx + 1}\n`;
      content += `------------------------------------------\n`;
      week.days.forEach(day => {
        content += `> ${day.dayName.toUpperCase()}:\n`;
        day.tasks.forEach((task, tIdx) => {
          content += `   [ ] Tarefa ${tIdx + 1}: No aplicativo Freedom, selecione:\n`;
          content += `       • NÍVEL: ${plan.inputs.level}\n`;
          content += `       • HABILIDADE: ${task.relatedTheme || 'Geral'}\n`;
          content += `       • TÓPICO: ${task.description}\n\n`;
        });
      });
      content += `\n`;
    });

    content += `==========================================\n`;
    content += `Freedom English School - Sua Fluência, Sua Liberdade.\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Plano_Estudos_Freedom_${user.userName}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const progress = calculateProgress();

  if (!plan.weeks || plan.weeks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center space-y-6">
        <h3 className="text-2xl font-black text-white uppercase">Plano Incompleto</h3>
        <p className="text-gray-400">Houve um problema ao carregar as semanas do seu plano. Recomendamos resetar e gerar um novo.</p>
        <button onClick={onResetPlan} className="px-8 py-4 bg-red-500 text-white rounded-2xl font-black uppercase">Resetar Plano</button>
      </div>
    );
  }

  const isDisqualified = plan.isChallenge && (plan.lives !== undefined && plan.lives <= 0) && !localStorage.getItem(`disqualified_modal_seen_${plan.id}`);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 animate-fade-in">
      
      {/* Challenge Success Modal */}
      {showChallengeSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowChallengeSuccess(false)}>
           <div className="bg-[#222222] border-2 border-green-500 rounded-3xl w-full max-w-md p-8 shadow-2xl relative animate-pop text-center" onClick={e => e.stopPropagation()}>
              <div className="text-6xl mb-4">🚀🔥</div>
              <h3 className="text-2xl font-black text-white mb-2 uppercase">Mandou bem!</h3>
              <p className="text-gray-300 mb-6">Mais um passo rumo à fluência.</p>
              
              <div className="bg-[#333333] p-4 rounded-xl mb-6 border border-[#444444]">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Dica Pro</p>
                <p className="text-sm text-white">
                  "Lembre-se, se você postar um print desse desafio no seu instagram marcando a gente, suas chances de ganhar o prêmio, podem ser triplicadas! Confira o regulamento"
                </p>
                <div className="flex justify-center mt-3">
                    <Instagram className="w-5 h-5 text-[#f7931e]" />
                </div>
              </div>

              <p className="text-[#f7931e] font-black uppercase tracking-widest text-xs mb-6">Por hoje é só, volte amanhã para mais uma tarefa diária</p>

              <button onClick={() => setShowChallengeSuccess(false)} className="w-full py-3 rounded-xl bg-green-500 text-black font-black uppercase">
                Continuar
              </button>
           </div>
        </div>
      )}

      {/* Disqualified Modal */}
      {isDisqualified && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
           <div className="bg-red-900/20 border-2 border-red-500 rounded-3xl w-full max-w-md p-8 shadow-2xl relative animate-pop text-center">
              <div className="text-6xl mb-4">💔</div>
              <h3 className="text-2xl font-black text-red-500 mb-4 uppercase">Desclassificado</h3>
              <p className="text-gray-300 mb-8">Você perdeu todas as suas vidas no Easter Challenge. Você não concorre mais aos prêmios, mas pode continuar seus estudos até o fim!</p>
              <button onClick={() => {
                // Just close the modal for now by setting a local state or similar
                // But wait, isDisqualified is derived from plan.lives.
                // I should probably add a state to hide this modal once seen.
                const modalKey = `disqualified_modal_seen_${plan.id}`;
                localStorage.setItem(modalKey, 'true');
                window.location.reload(); // Simple way to re-render and check localstorage
              }} className="w-full py-4 rounded-xl bg-red-500 text-white font-black uppercase">
                Entendido, continuar estudando
              </button>
           </div>
        </div>
      )}

      {/* Modal de Task */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
           <div className="bg-[#333333] border border-[#444444] rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-pop">
              <button onClick={() => setSelectedTask(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X className="w-6 h-6" /></button>
              <h3 className="text-xl font-bold text-white mb-2 pr-8">Detalhes da Atividade</h3>
              <p className="text-gray-300 mb-6 leading-relaxed">{selectedTask.task.description}</p>
              
              {plan.isChallenge && selectedTask.task.date && selectedTask.task.date < todayStr && !selectedTask.task.isCompleted && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-xs font-bold">
                    <AlertTriangle className="w-5 h-5" />
                    <p>Esta é uma tarefa de um dia anterior.</p>
                  </div>
              )}

              <div className="space-y-3">
                 {selectedTask.task.relatedTheme && !plan.isChallenge && (
                    <button onClick={() => onStartTask(selectedTask.task)} className="w-full py-4 px-4 rounded-xl font-black flex items-center justify-center gap-3 bg-[#f7931e] text-[#222222] hover:bg-[#e08215] shadow-lg shadow-[#f7931e]/20 transition-all">
                        <Play className="w-5 h-5 fill-current" /> Iniciar Agora
                    </button>
                 )}
                 {/* For Challenge Mode, if it's a real activity (not speaking), allow start */}
                 {plan.isChallenge && selectedTask.task.relatedTheme && (
                    <button onClick={() => onStartTask(selectedTask.task)} className="w-full py-4 px-4 rounded-xl font-black flex items-center justify-center gap-3 bg-[#f7931e] text-[#222222] hover:bg-[#e08215] shadow-lg shadow-[#f7931e]/20 transition-all">
                        {selectedTask.task.isCompleted ? <RefreshCw className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                        {selectedTask.task.isCompleted ? "Refazer Atividade" : "Iniciar Agora"}
                    </button>
                 )}

                 <button 
                    onClick={() => {
                        toggleTask(selectedTask.weekIndex, selectedTask.dayIndex, selectedTask.taskIndex);
                    }} 
                    className="w-full py-4 px-4 rounded-xl font-bold flex items-center justify-center gap-2 border-2 border-[#444444] text-gray-300 hover:bg-[#444444] transition-all"
                 >
                    {selectedTask.task.isCompleted ? <Circle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                    {selectedTask.task.isCompleted ? "Marcar como não concluída" : "Marcar como concluída"}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            {plan.isChallenge ? (
                <>
                    🐰 Easter Challenge
                    <div className="flex gap-1 ml-4">
                        {[1, 2, 3].map(i => (
                            <Heart 
                                key={i} 
                                className={`w-6 h-6 ${i <= (plan.lives ?? 3) ? 'text-red-500 fill-red-500' : 'text-gray-600'}`} 
                            />
                        ))}
                    </div>
                </>
            ) : "Painel de Estudos"}
          </h2>
          <p className="text-gray-400">{plan.isChallenge ? "40 dias de dedicação total!" : "Gerencie sua trilha de aprendizado diária."}</p>
        </div>
        <button 
          onClick={exportPlanAsText}
          className="flex items-center gap-2 px-6 py-3 bg-[#f7931e]/10 text-[#f7931e] border border-[#f7931e]/40 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#f7931e] hover:text-[#222222] transition-all shadow-lg"
        >
          <FileText className="w-4 h-4" /> Baixar Plano Detalhado (DOC/TXT)
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
         <div className="bg-[#333333] p-6 rounded-2xl border border-[#444444] shadow-lg">
            <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">Progresso Geral</h3>
            <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-[#f7931e]">{progress}%</span>
                <span className="text-gray-500 text-xs mb-1 font-bold uppercase tracking-widest">completo</span>
            </div>
         </div>
         <div className="bg-[#333333] p-6 rounded-2xl border border-[#444444] shadow-lg">
            <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">Seu Nível</h3>
            <span className="text-4xl font-black text-white">{plan.inputs?.level || 'N/A'}</span>
         </div>
         <div className="bg-[#333333] p-6 rounded-2xl border border-[#444444] shadow-lg">
            <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">Práticas Concluídas</h3>
            <span className="text-4xl font-black text-green-500">{history.length}</span>
         </div>
         <div className="bg-[#333333] p-6 rounded-2xl border border-[#444444] shadow-lg">
            <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">Duração do Plano</h3>
            <span className="text-4xl font-black text-blue-400">{plan.inputs?.duration || 'N/A'}</span>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Weekly Plan */}
        <div className="lg:col-span-2 space-y-6">
           <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white flex items-center gap-3">
                 <Calendar className="w-6 h-6 text-[#f7931e]" /> 
                 Seu Cronograma
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                 {plan.weeks.map((w, idx) => (
                    <button 
                      key={w.weekNumber || idx} 
                      onClick={() => setActiveWeek(idx)}
                      className={`px-4 py-2 rounded-xl text-xs font-black border-2 transition-all whitespace-nowrap ${activeWeek === idx ? 'bg-[#f7931e] border-[#f7931e] text-[#222222]' : 'bg-[#333333] border-[#444444] text-gray-500 hover:border-gray-500'}`}
                    >
                      SEMANA {w.weekNumber || idx + 1}
                    </button>
                 ))}
              </div>
           </div>

           <div className="grid md:grid-cols-2 gap-4">
              {plan.weeks[activeWeek]?.days?.map((day, dIdx) => (
                <div key={dIdx} className="bg-[#333333] rounded-3xl border border-[#444444] overflow-hidden shadow-lg group">
                   <div className="p-4 bg-[#2a2a2a] border-b border-[#444444] flex justify-between font-black text-[10px] text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">
                      {day.dayName}
                      <span className="text-[#f7931e]">{day.tasks?.filter(t => t.isCompleted).length || 0}/{day.tasks?.length || 0}</span>
                   </div>
                   <div className="p-3 space-y-2">
                      {day.tasks?.map((task, tIdx) => {
                         const isAdmin = user.username.toLowerCase() === 'admin';
                         const isLocked = !isAdmin && plan.isChallenge && task.date && task.date > todayStr;
                         const isLate = plan.isChallenge && task.date && task.date < todayStr && !task.isCompleted;
                         
                         return (
                            <div 
                                key={task.id || tIdx} 
                                onClick={() => {
                                    if (!isLocked) {
                                        setSelectedTask({task, weekIndex: activeWeek, dayIndex: dIdx, taskIndex: tIdx});
                                    }
                                }}
                                className={`p-4 rounded-2xl flex items-center gap-4 transition-all border-2 
                                    ${isLocked ? 'opacity-50 cursor-not-allowed bg-[#222222] border-transparent' : 'cursor-pointer'}
                                    ${task.isCompleted ? 'bg-[#222222]/50 border-transparent opacity-50' : (isLate ? 'bg-red-900/10 border-red-500/30' : 'bg-[#222222] border-transparent hover:border-[#f7931e]/50 hover:bg-[#222222]/80')}
                                `}
                            >
                                {isLocked ? (
                                    <Lock className="w-6 h-6 text-gray-600" />
                                ) : (
                                    task.isCompleted ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Circle className={`w-6 h-6 ${isLate ? 'text-red-500' : 'text-gray-600'}`} />
                                )}
                                
                                <span className={`text-sm font-medium flex-1 truncate ${task.isCompleted ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                    {task.description}
                                </span>
                            </div>
                         );
                      })}
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* Activity History & Reset */}
        <div className="space-y-6">
           <h3 className="text-xl font-black text-white flex items-center gap-3">
              <History className="w-6 h-6 text-green-500" /> 
              Atividade Recente
           </h3>
           <div className="bg-[#333333] rounded-3xl border border-[#444444] overflow-hidden max-h-[500px] overflow-y-auto scrollbar-hide shadow-xl">
              {history.length === 0 ? (
                 <div className="p-12 text-center text-gray-600 font-bold italic text-sm">Nenhuma atividade concluída. Inicie sua jornada hoje!</div>
              ) : (
                <div className="divide-y divide-[#444444]">
                   {history.map(record => (
                      <div key={record.id} className="p-5 hover:bg-[#3a3a3a] transition-all">
                         <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-black text-[#f7931e] uppercase tracking-widest">{record.theme}</span>
                            <span className="text-[10px] text-gray-500 font-mono">{new Date(record.date).toLocaleDateString()}</span>
                         </div>
                         <h4 className="text-sm font-bold text-white mb-3 truncate leading-tight">{record.topic}</h4>
                         <div className="flex items-center justify-between">
                            <span className="text-[9px] bg-[#222222] px-2 py-1 rounded-lg text-gray-400 font-black border border-white/5">{record.level}</span>
                            <span className={`text-xs font-black ${record.score / (record.total || 1) >= 0.7 ? 'text-green-500' : 'text-blue-400'}`}>
                               {Math.round((record.score / (record.total || 1)) * 100)}%
                            </span>
                         </div>
                      </div>
                   ))}
                </div>
              )}
           </div>
           
           <div className="pt-4 border-t border-[#444444]">
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  onResetPlan();
                }} 
                className="w-full py-5 rounded-2xl border-2 border-red-500/20 text-red-500 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all shadow-lg active:scale-95"
              >
                <Trash2 className="w-5 h-5" /> Apagar Plano de Estudos
              </button>
              <p className="text-center text-[9px] text-gray-500 mt-3 font-bold uppercase tracking-widest px-4">Esta ação é irreversível e removerá todo o seu progresso atual.</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardScreen;
