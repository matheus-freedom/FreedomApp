
import React, { useState, useEffect, useRef } from 'react';
import { GeneratedContent, QuizQuestion, VoiceGender, VoiceAccent, Level, Theme, GuideCharacter } from '../types';
import { generateAudioFromText, translateWordToPortuguese } from '../services/geminiService';
import GuideReaction, { ReactionEvent } from './GuideReaction';
import { ArrowRight, Check, X, Home, Play, Pause, Volume2, FileText, Loader2, Languages, ChevronDown, ChevronUp, FastForward, Rewind, Image as ImageIcon, Sparkles, Gauge } from 'lucide-react';

import { showToast } from './Toast';
interface QuizScreenProps {
  content: GeneratedContent;
  onFinish: (score: number, total: number) => void;
  onHome: () => void;
  level: Level;
  theme: Theme;
  topic: string;
  // Guia (Fred/Frida) que reage aos acertos e erros. Opcional: quando
  // não vem, o quiz funciona exatamente como antes, sem balões.
  guide?: GuideCharacter;
  userName?: string;
  // Rótulo do contexto da trilha, ex.: "Season 1 · Step 3".
  journeyLabel?: string;
}

// Singleton AudioContext para evitar overhead de criação
let sharedAudioCtx: AudioContext | null = null;

const playFeedbackSound = (isCorrect: boolean) => {
  try {
    if (!sharedAudioCtx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      sharedAudioCtx = new AudioContext();
    }
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (isCorrect) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.2);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
    }
    
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) {
    console.warn("Audio feedback failed", e);
  }
};

function decode(base64: string) {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Base64 decoding failed", e);
    return new Uint8Array(0);
  }
}

function createWavBlob(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
  if (!pcmData || pcmData.length === 0) return new Blob([], { type: 'audio/wav' });
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

export const InteractiveWord: React.FC<{ word: string; voiceGender?: VoiceGender; voiceAccent?: VoiceAccent }> = ({ word, voiceGender = 'Female', voiceAccent = 'American' }) => {
  const [translation, setTranslation] = useState<string | null>(null);
  const [loadingTranslation, setLoadingTranslation] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const cleanWord = word.trim().replace(/[^\w\s-]/gi, '');

  const handleMouseEnter = async () => {
    if (cleanWord.length < 2 || translation || loadingTranslation) return;
    setLoadingTranslation(true);
    try {
      const result = await translateWordToPortuguese(cleanWord);
      setTranslation(result);
    } catch (e) {
      console.error("Translation error", e);
    } finally {
      setLoadingTranslation(false);
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cleanWord || isPlaying || loadingAudio) return;
    
    setLoadingAudio(true);
    let audioUrl: string | null = null;
    try {
      const b64 = await generateAudioFromText(cleanWord, voiceGender as VoiceGender, voiceAccent as VoiceAccent);
      if (!b64 || b64.length < 10) throw new Error("Invalid audio data");
      
      const pcm = decode(b64);
      const blob = createWavBlob(pcm);
      audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      
      audio.onplay = () => {
        setLoadingAudio(false);
        setIsPlaying(true);
      };

      audio.onended = () => {
        setIsPlaying(false);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();
    } catch (error) {
      console.warn("Word audio play failed", error);
      setLoadingAudio(false);
      setIsPlaying(false);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    }
  };

  if (!cleanWord) return <span>{word}</span>;

  return (
    <span 
      className={`relative group cursor-pointer inline-block mx-0.5 transition-all rounded px-0.5 ${isPlaying || loadingAudio ? 'text-[#f7931e] font-bold bg-[#f7931e]/10 scale-105' : 'hover:text-[#f7931e] hover:bg-white/5'}`}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
    >
      <span className={`decoration-dotted underline-offset-4 group-hover:underline ${loadingAudio ? 'animate-pulse' : ''}`}>{word}</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block z-[250] pointer-events-none animate-pop">
         <div className="bg-[#1a1a1a] text-white text-[11px] px-3 py-2 rounded-xl border-2 border-[#f7931e] shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-normal max-w-[150px] text-center flex items-center justify-center gap-2">
            {loadingTranslation ? <Loader2 className="w-3 h-3 animate-spin text-[#f7931e]" /> : <span className="font-bold">{translation || "..."}</span>}
            {(isPlaying || loadingAudio) && <Volume2 className={`w-3 h-3 text-[#f7931e] ${loadingAudio ? 'animate-bounce' : 'animate-pulse'}`} />}
            <div className="absolute top-[98%] left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#f7931e]"></div>
         </div>
      </span>
    </span>
  );
};

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

const QuizScreen: React.FC<QuizScreenProps> = ({ content, onFinish, onHome, theme, level, topic, guide, userName, journeyLabel }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [reaction, setReaction] = useState<ReactionEvent>(null);
  const streaks = useRef({ correct: 0, wrong: 0, seq: 0 });
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showQuestionTranslation, setShowQuestionTranslation] = useState(false);
  const [localAudioData, setLocalAudioData] = useState<string | null>(null);
  // Vira true quando o arquivo de áudio pronto (Storage) não carrega:
  // daí em diante o exercício usa o TTS gerado no navegador.
  const [audioUrlFailed, setAudioUrlFailed] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const explanationRef = useRef<HTMLDivElement>(null);

  const currentQuestion: QuizQuestion = content.questions[currentIdx];
  const isListening = theme === Theme.Listening;
  const isReading = theme === Theme.Reading || theme === Theme.Business;
  const isBusiness = theme === Theme.Business;
  
  const voiceGender = content.voiceConfig?.gender || 'Female';
  const voiceAccent = content.voiceConfig?.accent || 'American';

  const audioRates = [0.5, 0.75, 1, 1.5, 2];

  useEffect(() => {
    setShowQuestionTranslation(false);
  }, [currentIdx]);

  useEffect(() => {
    if (isAnswered && explanationRef.current) {
      explanationRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isAnswered]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleGenerateAudio = async () => {
    // ── Caminho barato: áudio já pronto no Storage ───────────────
    // Exercícios da Journey têm o WAV gerado UMA vez pelo servidor e
    // guardado no Firebase Storage. Quando a URL existe, não se pede
    // TTS nenhum: é só tocar o arquivo.
    if (content.audioUrl && !audioUrlFailed) {
      setIsGeneratingAudio(true);
      const ok = await new Promise<boolean>((resolve) => {
        const audio = new Audio(content.audioUrl);
        // new Audio() NUNCA lança erro para URL quebrada — a falha
        // chega por onerror. Sem escutar isso, o player abriria mudo
        // e o aluno ficaria olhando um botão de "Pause" que não toca.
        audio.onerror = () => resolve(false);
        audio.onloadedmetadata = () => { setDuration(audio.duration); resolve(true); };
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audio.onended = () => { setIsPlaying(false); setCurrentTime(0); };
        audioRef.current = audio;
        // Rede lenta não é falha: passados 12s seguimos para o TTS.
        setTimeout(() => resolve(false), 12000);
      });
      if (ok) {
        setLocalAudioData(content.audioUrl);
        setIsGeneratingAudio(false);
        return;
      }
      // Arquivo indisponível: cai no caminho antigo (gerar no
      // navegador) em vez de deixar o exercício sem áudio.
      console.warn('Áudio pronto indisponível; gerando na hora.');
      audioRef.current = null;
      setAudioUrlFailed(true);
      setIsGeneratingAudio(false);
    }

    const text = content.listeningScript || content.readingText;
    if (!text) return;
    setIsGeneratingAudio(true);
    try {
      const b64 = await generateAudioFromText(text, voiceGender as VoiceGender, voiceAccent as VoiceAccent);
      if (!b64) throw new Error("No audio data received");
      
      setLocalAudioData(b64);
      const pcm = decode(b64);
      const blob = createWavBlob(pcm);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onloadedmetadata = () => setDuration(audio.duration);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audioRef.current = audio;
    } catch (error) {
      showToast("Não foi possível carregar o áudio. Tente de novo em instantes.", 'error');
    }
    setIsGeneratingAudio(false);
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleOptionClick = (idx: number) => {
    if (isAnswered) return;
    setSelectedOptionIdx(idx);
    setIsAnswered(true);
    const isCorrect = idx === currentQuestion.correctAnswerIndex;
    playFeedbackSound(isCorrect);
    if (isCorrect) setScore(s => s + 1);

    // Reação do guia: sequências de acerto viram elogio, erros viram
    // incentivo. Contadores em ref para não disparar re-render extra.
    streaks.current.correct = isCorrect ? streaks.current.correct + 1 : 0;
    streaks.current.wrong = isCorrect ? 0 : streaks.current.wrong + 1;
    streaks.current.seq += 1;
    if (guide) {
      const lastQuestion = currentIdx === content.questions.length - 1;
      setReaction({
        seq: streaks.current.seq, correct: isCorrect,
        correctStreak: streaks.current.correct, wrongStreak: streaks.current.wrong,
        isLast: lastQuestion, perfect: isCorrect && score + 1 === content.questions.length,
      });
    }
  };

  const handleNext = () => {
    if (currentIdx < content.questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setIsAnswered(false);
      setSelectedOptionIdx(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      onFinish(score, content.questions.length);
    }
  };

  const isLastQuestion = currentIdx === content.questions.length - 1;

  const showAudioControls = isListening || isBusiness;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pb-40 flex flex-col items-center">
      {guide && <GuideReaction guide={guide} userName={userName || ''} event={reaction} />}
      <div className="w-full flex justify-between items-start mb-8">
        <div className="flex flex-col gap-1">
          {journeyLabel && (
            <div className="inline-flex items-center gap-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest bg-[#f7931e]/10 border border-[#f7931e]/30 text-[#f7931e] px-3 py-1 rounded-lg w-fit">
              🧭 {journeyLabel}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest bg-[#2a2a2a] px-3 py-1 rounded-lg border border-white/5">
             <span className="text-[#f7931e]">{level}</span>
             <span className="opacity-30">•</span>
             <span>{theme}</span>
             <span className="opacity-30">•</span>
             <span className="truncate max-w-[120px] md:max-w-[200px]">{topic}</span>
          </div>
          <button onClick={onHome} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs mt-1 transition-colors"><Home className="w-3.5 h-3.5" /> Sair</button>
        </div>
        <div className="text-[#f7931e] font-black uppercase tracking-widest text-xs pt-1">Questão {currentIdx + 1} de {content.questions.length}</div>
      </div>

      <div className={`w-full grid ${((isReading || isListening) && !currentQuestion.questionImage) ? 'md:grid-cols-2' : 'grid-cols-1 max-w-2xl mx-auto'} gap-8 items-start`}>
        {(isReading || isListening) && (
          <div className="space-y-6 w-full">
            <div className="bg-[#333333] p-6 rounded-2xl border border-[#444444] shadow-lg w-full">
              <h3 className="text-[#f7931e] font-bold mb-4 flex items-center gap-2 uppercase text-[10px] tracking-widest">
                {isReading ? "Conteúdo de Interpretação" : "Controle de Áudio"}
              </h3>
              
              {isReading && (
                <div className={`max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar ${showAudioControls && isBusiness ? 'mb-6 border-b border-white/5 pb-6' : ''}`}>
                  <InteractiveText text={content.readingText || ""} voiceGender={voiceGender as VoiceGender} voiceAccent={voiceAccent as VoiceAccent} />
                </div>
              )}
              
              {showAudioControls && (
                <div className="space-y-6">
                  {isBusiness && (
                    <div className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-[#f7931e]" /> Business Audio Enabled
                    </div>
                  )}
                  {!localAudioData ? (
                    <div className="flex justify-center p-8 bg-[#222222] rounded-xl border border-dashed border-[#444444]">
                      <button 
                        onClick={handleGenerateAudio} 
                        disabled={isGeneratingAudio} 
                        className="px-8 py-4 rounded-xl font-black bg-[#f7931e] text-[#222222] flex items-center gap-3 hover:scale-105 transition-transform disabled:opacity-50"
                      >
                        {isGeneratingAudio ? <Loader2 className="w-6 h-6 animate-spin"/> : <Volume2 className="w-6 h-6" />} 
                        {isGeneratingAudio ? "Carregando..." : "Liberar Áudio"}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#222222] p-6 rounded-xl border border-[#444444] space-y-6">
                      <div className="flex flex-col md:flex-row items-center gap-6">
                        <button 
                          onClick={toggleAudio} 
                          className="w-14 h-14 rounded-full bg-[#f7931e] text-[#222222] flex items-center justify-center shadow-lg hover:scale-105 transition-transform shrink-0"
                        >
                          {isPlaying ? <Pause className="w-7 h-7 fill-current"/> : <Play className="w-7 h-7 fill-current ml-1" />}
                        </button>

                        <div className="flex-1 w-full space-y-2">
                          <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max={duration || 0} 
                            step="0.1"
                            value={currentTime} 
                            onChange={handleSeek}
                            className="w-full accent-[#f7931e] h-1.5 bg-[#444444] rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5 space-y-3">
                         <div className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                           <Gauge className="w-3 h-3 text-[#f7931e]" /> Velocidade de Reprodução
                         </div>
                         <div className="grid grid-cols-5 gap-1.5">
                            {audioRates.map(rate => (
                              <button 
                                key={rate} 
                                onClick={() => handleRateChange(rate)}
                                className={`py-2 rounded-lg text-[9px] md:text-[10px] font-black transition-all border ${playbackRate === rate ? 'bg-[#f7931e] border-[#f7931e] text-[#222222]' : 'bg-[#333333] border-white/10 text-gray-500 hover:border-gray-400'}`}
                              >
                                {rate === 1 ? '1.0x' : `${rate}x`}
                              </button>
                            ))}
                         </div>
                      </div>
                    </div>
                  )}

                  {isListening && (
                    <>
                      <button onClick={() => setShowTranscript(!showTranscript)} className="flex items-center gap-2 text-xs text-[#f7931e] font-bold uppercase hover:underline">
                        <FileText className="w-4 h-4" /> {showTranscript ? "Ocultar Transcrição" : "Ver Transcrição"}
                      </button>

                      {showTranscript && (
                        <div className="mt-4 p-4 bg-[#222222] rounded-lg border border-[#444444] text-sm text-gray-300 italic animate-fade-in max-h-40 overflow-y-auto custom-scrollbar">
                          <InteractiveText text={content.listeningScript || ""} voiceGender={voiceGender as VoiceGender} voiceAccent={voiceAccent as VoiceAccent} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6 w-full">
          <div className="space-y-4">
            <h2 className="text-xl md:text-2xl font-black text-white leading-tight">{currentQuestion.question}</h2>
            <button 
              onClick={() => setShowQuestionTranslation(!showQuestionTranslation)} 
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-[#444444] text-gray-400 hover:text-white transition-all"
            >
              <Languages className="w-3 h-3" /> Traduzir enunciado
            </button>

            {showQuestionTranslation && (
              <div className="p-3 bg-[#222222] rounded-xl border border-[#f7931e]/20 animate-pop text-[#f7931e]/80 text-xs italic">
                {currentQuestion.questionPT || "Tradução não disponível."}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {currentQuestion.options.map((opt, i) => (
              <button 
                key={i} 
                onClick={() => handleOptionClick(i)} 
                disabled={isAnswered} 
                className={`w-full p-5 rounded-2xl border-2 text-left transition-all font-bold text-sm ${
                  !isAnswered 
                    ? 'border-[#333333] bg-[#2a2a2a] hover:border-[#f7931e] text-gray-300' 
                    : i === currentQuestion.correctAnswerIndex 
                      ? 'border-green-500 bg-green-500/10 text-green-400' 
                      : i === selectedOptionIdx 
                        ? 'border-red-500 bg-red-500/10 text-red-400' 
                        : 'border-[#333333] opacity-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{opt}</span>
                  {isAnswered && i === currentQuestion.correctAnswerIndex && <Check className="w-4 h-4 text-green-500" />}
                  {isAnswered && i === selectedOptionIdx && i !== currentQuestion.correctAnswerIndex && <X className="w-4 h-4 text-red-500" />}
                </div>
              </button>
            ))}
          </div>
          {isAnswered && (
            <div ref={explanationRef} className={`p-5 rounded-2xl bg-[#222222] border border-[#f7931e]/10 text-sm animate-pop text-gray-400 shadow-inner overflow-hidden flex flex-col`}>
              <strong className="block mb-1 text-[10px] uppercase font-black text-[#f7931e] tracking-widest shrink-0">Explicação:</strong> 
              <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar leading-relaxed">
                {currentQuestion.explanation}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#1a1a1a]/90 border-t border-[#333333] flex justify-center backdrop-blur z-[100]">
        <button 
          onClick={handleNext} 
          disabled={!isAnswered} 
          className={`px-12 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 transition-all transform active:scale-95 ${
            isAnswered 
              ? 'bg-[#f7931e] text-[#222222] shadow-xl shadow-[#f7931e]/20' 
              : 'bg-[#333333] text-gray-600 cursor-not-allowed'
          }`}
        >
          {isLastQuestion ? 'Finalizar Atividade' : 'Próxima Questão'}
          {!isLastQuestion && <ArrowRight className="w-4 h-4" />}
          {isLastQuestion && <Sparkles className="w-4 h-4" />}
        </button>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #f7931e;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default QuizScreen;
