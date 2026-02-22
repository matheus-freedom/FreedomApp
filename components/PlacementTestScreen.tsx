
import React, { useState, useEffect, useRef } from 'react';
import { Level, Theme, GeneratedContent, QuizQuestion, VoiceGender, VoiceAccent } from '../types';
import { 
  generatePlacementGrammar, 
  generateAdaptivePlacementStep, 
  evaluateWritingExercise,
  generateAudioFromText,
  translateWordToPortuguese
} from '../services/geminiService';
import { InteractiveWord } from './QuizScreen';
import { 
  Loader2, CheckCircle, Brain, BookOpen, Volume2, PenTool, 
  Target, ArrowRight, Home, LayoutDashboard, Star, Sparkles,
  BarChart, TrendingUp, Compass, Play, Pause, Trophy, Gauge, AlertTriangle, ChevronRight, X, HelpCircle, Send as SendIcon
} from 'lucide-react';

interface PlacementTestScreenProps {
  onFinish: (level: Level) => void;
  onHome: () => void;
}

type TestPhase = 'loading' | 'grammar' | 'reading' | 'listening' | 'writing' | 'results';

const CEFR_LEVELS = [Level.A1, Level.A2, Level.B1, Level.B2, Level.C1];

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createWavBlob(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataLen = pcmData.length;
  const writeString = (v: DataView, o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLen, true);
  return new Blob([header, pcmData], { type: 'audio/wav' });
}

export const InteractiveText: React.FC<{ text: string; voiceGender?: VoiceGender; voiceAccent?: VoiceAccent }> = ({ text, voiceGender, voiceAccent }) => {
  const paragraphs = text.split(/\n\s*\n/);
  
  return (
    <div className="space-y-8 pt-10">
      {paragraphs.map((para, pIdx) => (
        <div key={pIdx} className="leading-relaxed whitespace-pre-wrap text-gray-100">
          {para.split(/(\s+)/).map((part, i) => (
            /^\s+$/.test(part) ? <span key={i}>{part}</span> : <InteractiveWord key={i} word={part} voiceGender={voiceGender} voiceAccent={voiceAccent} />
          ))}
        </div>
      ))}
    </div>
  );
};

const SkillDashboardItem: React.FC<{ label: string; level: Level; score: number; total: number; icon: React.ReactNode }> = ({ label, level, score, total, icon }) => {
  const percentage = Math.min(100, (score / total) * 100);
  return (
    <div className="bg-[#222222] p-4 rounded-2xl border border-white/5 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-gray-400 font-bold uppercase text-[10px] tracking-widest">
          {icon} {label}
        </div>
        <div className="text-[#f7931e] font-black text-sm">{level}</div>
      </div>
      <div className="h-1.5 w-full bg-[#333333] rounded-full overflow-hidden">
        <div 
          className="h-full bg-[#f7931e] shadow-[0_0_8px_rgba(247,147,30,0.4)] transition-all duration-1000" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-[8px] font-black text-gray-600 uppercase tracking-widest">
        <span>Compatibilidade: {Math.round(percentage)}%</span>
        <span>{score}/{total}</span>
      </div>
    </div>
  );
};

const PlacementTestScreen: React.FC<PlacementTestScreenProps> = ({ onFinish, onHome }) => {
  const [phase, setPhase] = useState<TestPhase>('loading');
  const [grammarContent, setGrammarContent] = useState<GeneratedContent | null>(null);
  const [readingContent, setReadingContent] = useState<GeneratedContent | null>(null);
  const [listeningContent, setListeningContent] = useState<GeneratedContent | null>(null);
  const [writingContent, setWritingContent] = useState<GeneratedContent | null>(null);

  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [grammarScore, setGrammarScore] = useState(0);
  const [readingScore, setReadingScore] = useState(0);
  const [listeningScore, setListeningScore] = useState(0);
  const [writingScore, setWritingScore] = useState(0);
  
  const [userWriting, setUserWriting] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioLoaded, setAudioLoaded] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const content = await generatePlacementGrammar();
        setGrammarContent(content);
        setPhase('grammar');
      } catch (e) {
        alert("Erro ao carregar teste de gramática. Verifique sua conexão.");
        onHome();
      }
    };
    init();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const getEstimatedLevel = (score: number, total: number): Level => {
    const pct = score / total;
    if (pct >= 0.85) return Level.C1;
    if (pct >= 0.70) return Level.B2;
    if (pct >= 0.50) return Level.B1;
    if (pct >= 0.30) return Level.A2;
    return Level.A1;
  };

  const handleNextPhase = async () => {
    const currentPhase = phase;
    setPhase('loading');
    try {
      const seedLevel = getEstimatedLevel(grammarScore, 30);
      if (currentPhase === 'grammar') {
        const content = await generateAdaptivePlacementStep(Theme.Reading, seedLevel);
        setReadingContent(content);
        setCurrentQIdx(0);
        setAnswered(false);
        setSelectedOption(null);
        setPhase('reading');
      } else if (currentPhase === 'reading') {
        const content = await generateAdaptivePlacementStep(Theme.Listening, seedLevel);
        setListeningContent(content);
        setCurrentQIdx(0);
        setAnswered(false);
        setSelectedOption(null);
        setPhase('listening');
      } else if (currentPhase === 'listening') {
        const content = await generateAdaptivePlacementStep(Theme.Writing, seedLevel);
        setWritingContent(content);
        setPhase('writing');
      }
    } catch (e) {
      console.error("Erro na transição de fase:", e);
      alert("Houve um erro ao carregar a próxima etapa. Finalizando diagnóstico...");
      setPhase('results');
    }
  };

  const handleAnswer = (idx: number | 'unknown') => {
    if (answered) return;
    
    const isUnknown = idx === 'unknown';
    setSelectedOption(isUnknown ? -1 : idx);
    setAnswered(true);
    
    let content = phase === 'grammar' ? grammarContent : (phase === 'reading' ? readingContent : listeningContent);
    const correct = !isUnknown && content?.questions[currentQIdx].correctAnswerIndex === idx;
    
    if (correct) {
      if (phase === 'grammar') setGrammarScore(s => s + 1);
      else if (phase === 'reading') setReadingScore(s => s + 1);
      else if (phase === 'listening') setListeningScore(s => s + 1);
    }

    setTimeout(() => {
      const nextIdx = currentQIdx + 1;
      const total = content?.questions.length || 0;
      if (nextIdx < total) {
        setCurrentQIdx(nextIdx);
        setAnswered(false);
        setSelectedOption(null);
      } else {
        handleNextPhase();
      }
    }, 800);
  };

  const handleWritingSubmit = async () => {
    if (userWriting.length < 50) {
        alert("Por favor, escreva um pouco mais para uma avaliação precisa.");
        return;
    }
    setIsSubmitting(true);
    try {
      const seedLevel = getEstimatedLevel(grammarScore, 30);
      const feedback = await evaluateWritingExercise(userWriting, writingContent?.writingPrompt || '', seedLevel);
      // O score da escrita vem de 0 a 100, transformamos para base 10 para o dashboard
      setWritingScore(Math.round(feedback.score / 10)); 
      setPhase('results');
    } catch (e) {
      console.error("Erro ao avaliar escrita:", e);
      // Se falhar, assume nota proporcional à gramática
      setWritingScore(Math.round((grammarScore / 30) * 10));
      setPhase('results');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const playAudio = async () => {
    if (audioRef.current && audioLoaded) {
      toggleAudio();
      return;
    }
    
    const script = listeningContent?.listeningScript;
    if (script) {
      setIsSubmitting(true);
      try {
        const b64 = await generateAudioFromText(script, 'Female', 'American');
        const pcmData = decodeBase64(b64);
        const wavBlob = createWavBlob(pcmData);
        const url = URL.createObjectURL(wavBlob);
        
        const audio = new Audio(url);
        audio.onloadedmetadata = () => setDuration(audio.duration);
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audio.onended = () => {
          setIsPlaying(false);
          setCurrentTime(0);
        };
        
        audioRef.current = audio;
        setAudioLoaded(true);
        audio.play();
        setIsPlaying(true);
      } catch (e) {
        alert("Erro ao gerar áudio de nivelamento.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const resultsData = phase === 'results' ? {
    grammar: getEstimatedLevel(grammarScore, 30),
    reading: getEstimatedLevel(readingScore, 10),
    listening: getEstimatedLevel(listeningScore, 10),
    writing: getEstimatedLevel(writingScore, 10),
  } : null;

  const getConservativeLevel = () => {
    if (!resultsData) return Level.A1;
    const levels = [resultsData.grammar, resultsData.reading, resultsData.listening, resultsData.writing];
    const levelScores = levels.map(l => CEFR_LEVELS.indexOf(l));
    const minScore = Math.min(...levelScores);
    return CEFR_LEVELS[minScore];
  };

  const recommendedLevel = getConservativeLevel();

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <Loader2 className="w-16 h-16 text-[#f7931e] animate-spin" />
        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Calibrando Motor Freedom</h2>
        <p className="text-gray-400 max-w-sm">Analisando suas respostas para adaptar a próxima fase do teste...</p>
      </div>
    );
  }

  if (phase === 'results' && resultsData) {
    return (
      <div className="max-w-5xl mx-auto p-6 animate-fade-in space-y-12 pb-32 flex flex-col items-center">
        <div className="text-center space-y-4">
          <div className="inline-block p-4 bg-[#f7931e]/10 border border-[#f7931e]/40 rounded-full mb-2">
            <Trophy className="w-12 h-12 text-[#f7931e]" />
          </div>
          <h2 className="text-5xl font-black text-white uppercase tracking-tighter">Diagnóstico Final</h2>
          <p className="text-gray-400 font-medium">Seu mapeamento completo está pronto. Honestidade é a base da fluência.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 w-full">
          <div className="bg-[#333333] p-10 rounded-3xl border border-white/5 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden group min-h-[400px]">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform"><Compass className="w-32 h-32 text-[#f7931e]" /></div>
            <span className="text-gray-500 font-black uppercase text-[10px] tracking-widest mb-4">Inicie nesta turma</span>
            <div className="text-9xl font-black text-[#f7931e] drop-shadow-[0_0_30px_rgba(247,147,30,0.5)] animate-pop">{recommendedLevel}</div>
            <div className="mt-8 text-center space-y-3">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed px-4">
                 Recomendamos este nível com base na sua habilidade mais desafiadora para evitar gaps no aprendizado.
               </p>
            </div>
          </div>

          <div className="md:col-span-2 space-y-6">
            <div className="bg-[#2a2a2a] p-8 rounded-3xl border border-white/5 shadow-xl space-y-8">
               <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-3"><LayoutDashboard className="w-5 h-5 text-[#f7931e]" /> Níveis por Habilidade</h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SkillDashboardItem label="Gramática" level={resultsData.grammar} score={grammarScore} total={30} icon={<Brain className="w-4 h-4" />} />
                  <SkillDashboardItem label="Reading" level={resultsData.reading} score={readingScore} total={10} icon={<BookOpen className="w-4 h-4" />} />
                  <SkillDashboardItem label="Listening" level={resultsData.listening} score={listeningScore} total={10} icon={<Volume2 className="w-4 h-4" />} />
                  <SkillDashboardItem label="Writing" level={resultsData.writing} score={writingScore} total={10} icon={<PenTool className="w-4 h-4" />} />
               </div>
            </div>

            <div className="bg-[#f7931e] p-6 rounded-3xl flex items-start gap-4 shadow-xl shadow-[#f7931e]/10">
               <AlertTriangle className="w-6 h-6 text-[#222222] shrink-0 mt-1" />
               <div className="space-y-1">
                 <h4 className="text-[#222222] font-black uppercase text-xs tracking-widest">Atenção Pedagógica</h4>
                 <p className="text-[#222222]/80 text-sm font-bold leading-relaxed">
                   Seu desempenho em <strong>{recommendedLevel}</strong> sugere que existem tópicos fundamentais que precisam ser recapitulados. Iniciar por este nível garantirá que você construa uma fluência inabalável.
                 </p>
               </div>
            </div>
          </div>
        </div>

        <button onClick={() => onFinish(recommendedLevel)} className="group px-16 py-6 bg-[#f7931e] text-[#222222] rounded-2xl font-black text-2xl flex items-center gap-4 hover:scale-105 transition-all shadow-2xl shadow-[#f7931e]/30 uppercase tracking-tighter">
          Aceitar Nível e Começar <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    );
  }

  const currentContent = phase === 'grammar' ? grammarContent : (phase === 'reading' ? readingContent : listeningContent);
  const currentQuestion = currentContent?.questions[currentQIdx];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pb-32 animate-fade-in flex flex-col items-center">
      <div className="w-full flex justify-between items-end border-b border-[#333333] pb-6 mb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#f7931e] font-black uppercase text-[10px] tracking-widest">
            {phase === 'grammar' && <><Brain className="w-3 h-3" /> Gramática ({currentQIdx + 1}/30)</>}
            {phase === 'reading' && <><BookOpen className="w-3 h-3" /> Reading ({currentQIdx + 1}/10)</>}
            {phase === 'listening' && <><Volume2 className="w-3 h-3" /> Listening ({currentQIdx + 1}/10)</>}
            {phase === 'writing' && <><PenTool className="w-3 h-3" /> Writing (Final)</>}
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Teste de Nivelamento</h2>
        </div>
      </div>

      <div className="w-full space-y-8">
        {phase === 'reading' && readingContent?.readingText && (
          <div className="bg-[#333333] p-8 rounded-3xl border border-white/5 shadow-xl font-serif text-lg leading-relaxed text-gray-200 overflow-visible">
             <InteractiveText text={readingContent.readingText} />
          </div>
        )}

        {phase === 'listening' && (
          <div className="bg-[#2a2a2a] p-8 rounded-3xl border border-white/5 shadow-xl space-y-8">
             <div className="flex flex-col md:flex-row items-center gap-8">
                <button 
                  onClick={playAudio} 
                  disabled={isSubmitting}
                  className="w-20 h-20 rounded-full bg-[#f7931e] text-[#222222] flex items-center justify-center shadow-lg hover:scale-105 transition-transform shrink-0"
                >
                  {isSubmitting ? <Loader2 className="w-8 h-8 animate-spin" /> : (isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />)}
                </button>
                <div className="flex-1 w-full space-y-3">
                    <div className="flex justify-between text-[10px] font-black text-gray-500 uppercase tracking-widest">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                    <div className="h-2 w-full bg-[#333333] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#f7931e] shadow-[0_0_10px_rgba(247,147,30,0.5)] transition-all"
                          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        />
                    </div>
                </div>
             </div>

             <div className="pt-6 border-t border-white/5 space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                   <Gauge className="w-3 h-3 text-[#f7931e]" /> Velocidade
                </div>
                <div className="grid grid-cols-5 gap-2">
                   {[0.5, 0.75, 1, 1.5, 2].map(rate => (
                     <button 
                       key={rate} 
                       onClick={() => handleRateChange(rate)}
                       className={`py-3 rounded-xl text-[10px] font-black transition-all border ${playbackRate === rate ? 'bg-[#f7931e] border-[#f7931e] text-[#222222]' : 'bg-[#333333] border-transparent text-gray-500 hover:border-gray-500'}`}
                     >
                       {rate === 1 ? 'NORMAL' : `${rate}x`}
                     </button>
                   ))}
                </div>
             </div>
          </div>
        )}

        {phase === 'writing' && writingContent?.writingPrompt && (
          <div className="space-y-6 w-full">
             <div className="bg-[#333333] p-8 rounded-3xl border border-white/5 shadow-xl space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><PenTool className="w-32 h-32" /></div>
                <h3 className="text-[#f7931e] font-black uppercase text-[10px] tracking-widest">Produção Textual</h3>
                <p className="text-2xl text-white font-black leading-tight pr-12">{writingContent.writingPrompt}</p>
                <p className="text-sm text-gray-500 italic font-medium">{writingContent.writingPromptPT}</p>
             </div>
             <textarea 
                value={userWriting}
                onChange={(e) => setUserWriting(e.target.value)}
                placeholder="Write your answer here in English... (min. 50 characters)"
                className="w-full h-80 bg-[#222222] border-2 border-[#333333] rounded-3xl p-8 text-lg text-white placeholder-gray-700 outline-none focus:border-[#f7931e] transition-all"
             />
             <div className="flex justify-end">
                <button 
                  onClick={handleWritingSubmit}
                  disabled={isSubmitting || userWriting.length < 50}
                  className="px-12 py-5 bg-[#f7931e] text-[#222222] rounded-2xl font-black uppercase tracking-widest flex items-center gap-3 hover:scale-105 transition-all shadow-xl shadow-[#f7931e]/20 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <SendIcon className="w-6 h-6" />} Finalizar Diagnóstico
                </button>
             </div>
          </div>
        )}

        {phase !== 'writing' && currentQuestion && (
          <div className="w-full space-y-6">
            <h3 className="text-2xl md:text-3xl font-black text-white leading-tight">{currentQuestion.question}</h3>
            
            <div className="grid grid-cols-1 gap-3">
              {currentQuestion.options.map((opt, i) => (
                <button 
                  key={i} 
                  onClick={() => handleAnswer(i)}
                  disabled={answered}
                  className={`w-full p-6 rounded-3xl border-2 text-left font-bold text-lg transition-all ${
                    selectedOption === i 
                      ? (i === currentQuestion.correctAnswerIndex ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-red-500/20 border-red-500 text-red-400') 
                      : (answered && i === currentQuestion.correctAnswerIndex && selectedOption !== -1 ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-[#333333] border-transparent text-gray-300 hover:border-white/10')
                  }`}
                >
                  {opt}
                </button>
              ))}

              <button 
                onClick={() => handleAnswer('unknown')}
                disabled={answered}
                className={`w-full mt-4 p-8 rounded-3xl border-4 font-black text-lg uppercase tracking-widest transition-all flex items-center justify-center gap-4 shadow-2xl animate-pulse active:animate-none ${
                  selectedOption === -1 
                    ? 'bg-red-500 text-white border-red-400' 
                    : 'bg-[#f7931e] border-white text-[#222222] hover:scale-105 hover:bg-white hover:text-[#f7931e]'
                }`}
              >
                <HelpCircle className="w-7 h-7" /> Eu não sei a resposta
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlacementTestScreen;
