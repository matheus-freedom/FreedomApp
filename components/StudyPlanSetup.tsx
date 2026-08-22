
import React, { useState } from 'react';
import { Level, StudyPlanInput, UserSession, AccessType } from '../types';
import { generateStudyPlan } from '../services/geminiService';
import { Calendar, Clock, Target, BarChart2, CheckCircle, Loader2, ArrowLeft, AlertCircle, X, ShieldAlert } from 'lucide-react';

interface StudyPlanSetupProps {
  onCancel: () => void;
  onPlanGenerated: (plan: any) => void;
  user: UserSession;
}

const DAILY_OPTIONS = [
  { label: "1 exercício (5 min)", value: 1 },
  { label: "2 exercícios (10 min)", value: 2 },
  { label: "3 exercícios (15 min)", value: 3 },
  { label: "4 exercícios (20 min)", value: 4 },
  { label: "5 exercícios (25 min)", value: 5 },
  { label: "6 exercícios (30 min)", value: 6 },
  { label: "7 exercícios (35 min)", value: 7 },
  { label: "8 exercícios (40 min)", value: 8 },
];

const FOCUS_OPTIONS = [
  'Challenge Mode', 
  'General English', 
  'Business English', 
  'Grammar', 
  'Reading', 
  'Listening', 
  'Writing', 
  'Travel', 
  'Custom'
];

const StudyPlanSetup: React.FC<StudyPlanSetupProps> = ({ onCancel, onPlanGenerated, user }) => {
  const isChallengeOnly = user.accessType === AccessType.CHALLENGE_ONLY;
  const [level, setLevel] = useState<Level>(Level.A1);
  const [dailyAvailability, setDailyAvailability] = useState<number>(1);
  const [focusSkill, setFocusSkill] = useState(isChallengeOnly ? 'Challenge Mode' : 'General English');
  const [customFocus, setCustomFocus] = useState('');
  const [duration, setDuration] = useState(isChallengeOnly ? '40 Days' : '30 Days');
  const [isLoading, setIsLoading] = useState(false);
  // Mensagem de progresso: o plano agora é montado em blocos, então o
  // aluno acompanha o avanço em vez de olhar para um botão parado.
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showAccessAlert, setShowAccessAlert] = useState(false);

  const handleFocusChange = (skill: string) => {
    if (isChallengeOnly && skill !== 'Challenge Mode') {
      setShowAccessAlert(true);
      return;
    }
    if (skill === 'Challenge Mode') {
      setShowChallengeModal(true);
    } else {
      setFocusSkill(skill);
    }
  };

  const startChallenge = async () => {
    setShowChallengeModal(false);
    setFocusSkill('Challenge Mode');
    setDuration('40 Days'); // Fixed duration for challenge
    
    // Immediately trigger generation
    await generatePlan(true);
  };

  const [generatedChallengePlan, setGeneratedChallengePlan] = useState<any | null>(null);

  const generatePlan = async (isChallenge = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const inputs: StudyPlanInput = { 
        level, 
        timeAvailable: DAILY_OPTIONS.find(o => o.value === dailyAvailability)?.label || '30 mins/day',
        dailyAvailability,
        focusSkill: isChallenge ? 'Challenge Mode' : (focusSkill === 'Custom' ? customFocus : focusSkill), 
        duration: isChallenge ? '40 Days' : duration,
        isChallenge,
        customFocus: focusSkill === 'Custom' ? customFocus : undefined
      };

      const plan = await generateStudyPlan(inputs, (m) => setProgressMsg(m));
      
      if (!plan || !plan.weeks || plan.weeks.length === 0) {
        throw new Error("Não foi possível gerar um plano estruturado. Tente mudar o foco ou o nível.");
      }
      
      if (isChallenge) {
        setGeneratedChallengePlan(plan);
      } else {
        onPlanGenerated(plan);
      }
    } catch (error) {
      console.error("Study Plan Generation Error:", error);
      setError(error instanceof Error ? error.message : "Falha ao gerar o plano. Tente novamente em instantes.");
    } finally {
      setIsLoading(false);
      setProgressMsg('');
    }
  };

  const handleSubmit = () => generatePlan(false);

  if (generatedChallengePlan) {
    return (
        <div className="max-w-2xl mx-auto p-6 animate-fade-in text-center">
            <div className="text-6xl mb-6 animate-bounce">🏆</div>
            <h2 className="text-3xl font-black text-[#f7931e] uppercase tracking-tighter mb-6">
                Parabéns pela coragem!
            </h2>
            <p className="text-gray-300 text-lg mb-8 leading-relaxed">
                Serão 40 dias de bastante dedicação e pode ter certeza que no final, seu inglês estará em outro nível.
            </p>
            <button 
                onClick={() => onPlanGenerated(generatedChallengePlan)}
                className="w-full py-5 px-6 rounded-2xl font-black text-xl bg-[#f7931e] text-[#222222] hover:bg-[#e08215] shadow-xl shadow-[#f7931e]/20 transition-all uppercase tracking-widest flex items-center justify-center gap-3"
            >
                <Target className="w-6 h-6" /> Start Challenge
            </button>
        </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in relative">
      {/* Access Alert Modal */}
      {showAccessAlert && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowAccessAlert(false)}>
          <div className="bg-[#2a2a2a] w-full max-w-sm rounded-[2rem] border border-red-500/30 p-8 text-center space-y-6 animate-pop" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <h4 className="text-xl font-black text-white uppercase tracking-tighter">Acesso Restrito</h4>
            <p className="text-gray-400 text-sm font-medium">Funcionalidade exclusiva para alunos Freedom</p>
            <button 
              onClick={() => setShowAccessAlert(false)}
              className="w-full py-4 bg-white/5 text-white rounded-xl font-black uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Challenge Modal */}
      {showChallengeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#222222] border-2 border-[#f7931e] rounded-3xl w-full max-w-md p-8 shadow-2xl relative animate-pop text-center">
            <button 
              onClick={() => setShowChallengeModal(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="text-6xl mb-4">🐰🍫🥚</div>
            <h3 className="text-2xl font-black text-white mb-4 uppercase tracking-tight">
              Gostaria de Participar do Easter Challenge?
            </h3>
            <p className="text-gray-300 mb-8 font-medium">
              Serão 40 dias de dedicação intensa para transformar seu inglês!
            </p>
            <div className="space-y-3">
              <button 
                onClick={startChallenge}
                className="w-full py-4 px-6 rounded-xl font-black text-lg bg-[#f7931e] text-[#222222] hover:bg-[#e08215] shadow-lg shadow-[#f7931e]/20 transition-all uppercase tracking-widest"
              >
                Yes, Let's Go!
              </button>
              <button 
                onClick={() => setShowChallengeModal(false)}
                className="w-full py-4 px-6 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-[#333333] transition-all uppercase tracking-widest"
              >
                No, not now
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center gap-4">
        <button onClick={onCancel} className="p-2 rounded-full hover:bg-[#333333] transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div>
            <h2 className="text-3xl font-black text-[#f7931e] uppercase tracking-tighter">Plano de Estudos</h2>
            <p className="text-gray-400">Responda algumas perguntas para criarmos seu roadmap personalizado.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-bold animate-pop">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Level */}
        <div className="bg-[#333333] p-6 rounded-3xl border border-[#444444]">
          <label className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
            <BarChart2 className="w-4 h-4 text-[#f7931e]" /> Nível Atual
          </label>
          <div className="grid grid-cols-5 gap-2">
            {Object.values(Level).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`p-3 rounded-xl font-black transition-all ${
                  level === l 
                    ? 'bg-[#f7931e] text-[#222222]' 
                    : 'bg-[#222222] text-gray-500 hover:bg-[#444444]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Daily Availability */}
        <div className="bg-[#333333] p-6 rounded-3xl border border-[#444444]">
          <label className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
            <Clock className="w-4 h-4 text-[#f7931e]" /> Disponibilidade Diária
          </label>
          <select 
            value={dailyAvailability} 
            onChange={(e) => setDailyAvailability(Number(e.target.value))}
            className="w-full bg-[#222222] text-white p-4 rounded-xl border border-[#444444] focus:border-[#f7931e] outline-none font-bold text-sm"
          >
            {DAILY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Focus */}
        <div className="bg-[#333333] p-6 rounded-3xl border border-[#444444]">
          <label className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
            <Target className="w-4 h-4 text-[#f7931e]" /> Foco Principal
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FOCUS_OPTIONS.map(skill => (
              <button
                key={skill}
                onClick={() => handleFocusChange(skill)}
                className={`p-3 rounded-xl text-left transition-all border-2 text-[10px] font-black uppercase tracking-tight ${
                  focusSkill === skill
                  ? 'bg-[#f7931e]/10 border-[#f7931e] text-[#f7931e]'
                  : 'bg-[#222222] border-transparent text-gray-500 hover:bg-[#3a3a3a]'
                } ${isChallengeOnly && skill !== 'Challenge Mode' ? 'opacity-30' : ''}`}
              >
                {skill}
              </button>
            ))}
          </div>
          {focusSkill === 'Custom' && (
            <input
              type="text"
              value={customFocus}
              onChange={(e) => setCustomFocus(e.target.value)}
              placeholder="Digite seu foco específico..."
              className="w-full mt-4 bg-[#222222] text-white p-4 rounded-xl border border-[#444444] focus:border-[#f7931e] outline-none font-bold text-sm"
            />
          )}
        </div>

        {/* Duration (Hidden if Challenge Mode is selected, but visible otherwise) */}
        {focusSkill !== 'Challenge Mode' && (
          <div className="bg-[#333333] p-6 rounded-3xl border border-[#444444]">
             <label className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
               <Calendar className="w-4 h-4 text-[#f7931e]" /> Duração do Plano
             </label>
             <div className="flex flex-wrap gap-2">
                {['1 Week', '30 Days', '60 Days', '90 Days'].map(d => (
                   <button
                     key={d}
                     onClick={() => setDuration(d)}
                     className={`px-6 py-3 rounded-full font-black text-[10px] uppercase transition-all ${
                       duration === d
                         ? 'bg-[#f7931e] text-[#222222]'
                         : 'bg-[#222222] text-gray-500 hover:text-white'
                     }`}
                   >
                     {d}
                   </button>
                ))}
             </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading || (focusSkill === 'Custom' && !customFocus)}
        className="w-full mt-8 p-6 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-[#f7931e] text-[#222222] hover:bg-[#e08215] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-[#f7931e]/20 uppercase tracking-widest"
      >
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle className="w-6 h-6" />}
        {isLoading ? (progressMsg || "Gerando seu Plano Freedom...") : (focusSkill === 'Challenge Mode' ? "Start Challenge" : "Criar Meu Plano de Estudos")}
      </button>
    </div>
  );
};

export default StudyPlanSetup;
