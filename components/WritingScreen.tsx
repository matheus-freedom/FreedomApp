
import React, { useState } from 'react';
import { GeneratedContent, Level, WritingFeedback, Theme } from '../types';
import { evaluateWritingExercise, generateWritingExample } from '../services/geminiService';
import { InteractiveText } from './QuizScreen';
import { Home, Send, PenTool, Lightbulb, Loader2, BookOpen, Sparkles, Languages, ChevronDown, ChevronUp, RotateCcw, CheckCircle2, AlertCircle, Book, Target } from 'lucide-react';

import { showToast } from './Toast';
interface WritingScreenProps {
  content: GeneratedContent;
  level: Level;
  theme: Theme;
  topic: string;
  onHome: () => void;
  onFinish: (score: number) => void;
}

const WritingScreen: React.FC<WritingScreenProps> = ({ content, level, theme, topic, onHome, onFinish }) => {
  const [userText, setUserText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  const [example, setExample] = useState<string | null>(null);
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);

  // Helper function to clean markdown characters that clutter the UI
  const cleanMarkdown = (text: string | undefined): string => {
    if (!text) return "";
    return text.replace(/(\*\*|__|\*|_|#+|---)/g, '');
  };

  const handleSubmit = async () => {
    if (!userText.trim()) return;
    setIsSubmitting(true);
    try {
      const result = await evaluateWritingExercise(userText, content.writingPrompt || '', level);
      setFeedback(result);
    } catch (e) { 
      console.error(e);
      showToast("Erro ao avaliar sua escrita. Verifique sua conexão e tente novamente.", 'error');
    }
    setIsSubmitting(false);
  };

  const handleRetry = () => {
    setFeedback(null);
  };

  const handleFinishWriting = () => {
    if (feedback) {
      onFinish(feedback.score);
    }
  };

  const handleSeeExample = async () => {
    if (example) return;
    setIsGeneratingExample(true);
    const text = await generateWritingExample(content.writingPrompt || '', level);
    setExample(text);
    setIsGeneratingExample(false);
  };

  if (feedback) {
    return (
      <div className="max-w-5xl mx-auto p-6 pb-24 animate-fade-in">
        <div className="flex justify-between items-center mb-8">
          <button onClick={onHome} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm"><Home className="w-4 h-4" /> Início</button>
          <div className="text-[#f7931e] font-black text-xl uppercase tracking-tighter">Análise Pedagógica</div>
        </div>

        <div className="grid md:grid-cols-12 gap-8">
          {/* Sidebar - Score & Stats */}
          <div className="md:col-span-4 space-y-6">
            <div className="bg-[#333333] p-8 rounded-3xl border border-[#444444] text-center shadow-2xl relative overflow-hidden group">
              <div className="absolute -top-4 -right-4 opacity-10 group-hover:scale-110 transition-transform"><CheckCircle2 className="w-24 h-24 text-[#f7931e]" /></div>
              <div className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em] mb-2">Desempenho Final</div>
              <div className="text-8xl font-black text-[#f7931e] mb-2 animate-pop">{feedback.score}</div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pontos / 100</div>
            </div>

            {/* Recommended Topics to Study */}
            {feedback.recommendedTopics && feedback.recommendedTopics.length > 0 && (
              <div className="bg-[#2a2a2a] p-6 rounded-3xl border border-[#f7931e]/20 shadow-xl">
                 <h4 className="text-[#f7931e] text-[10px] font-black uppercase mb-4 flex items-center gap-2 tracking-widest">
                   <Target className="w-4 h-4" /> Plano de Reforço
                 </h4>
                 <div className="space-y-2">
                    {feedback.recommendedTopics.map((topic, i) => (
                      <div key={i} className="flex items-center gap-3 bg-[#333333] p-3 rounded-xl border border-white/5 group hover:border-[#f7931e]/50 transition-all">
                        <div className="w-2 h-2 rounded-full bg-[#f7931e]"></div>
                        <span className="text-xs font-bold text-gray-300 uppercase tracking-tighter">{topic}</span>
                      </div>
                    ))}
                 </div>
                 <p className="mt-4 text-[9px] text-gray-500 italic font-medium leading-relaxed">
                   Baseado nos seus erros, foque nestes temas para evoluir sua escrita no nível {level}.
                 </p>
              </div>
            )}

            {/* General Tips */}
            <div className="bg-[#333333] p-6 rounded-3xl border border-[#444444] shadow-xl">
               <h4 className="text-white text-[10px] font-black uppercase mb-4 flex items-center gap-2 tracking-widest">
                 <Lightbulb className="w-4 h-4 text-yellow-400" /> Dicas Rápidas
               </h4>
               <ul className="space-y-3">
                  {feedback.suggestions.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-300 leading-relaxed bg-[#222222] p-3 rounded-xl border border-white/5">
                       <span className="text-[#f7931e] font-bold">{i+1}.</span> {tip}
                    </li>
                  ))}
               </ul>
            </div>
          </div>

          {/* Main Correction Display */}
          <div className="md:col-span-8 space-y-6">
            <div className="bg-[#333333] p-8 rounded-3xl border border-[#444444] shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-4">
                <h3 className="text-white font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#f7931e]" /> Correção Comparativa</h3>
                <div className="flex flex-wrap gap-4 text-[9px] font-black uppercase tracking-widest">
                  <span className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 rounded-md text-red-500 border border-red-500/20"><AlertCircle className="w-3 h-3"/> Seu texto</span>
                  <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-md text-green-500 border border-green-500/20"><CheckCircle2 className="w-3 h-3"/> Sugestão</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-[#f7931e] text-[10px] font-black uppercase tracking-widest italic">Comentário do Professor:</p>
                <div className="bg-[#222222] p-5 rounded-2xl border-l-4 border-[#f7931e] text-gray-300 text-sm italic leading-relaxed shadow-inner">
                  "{feedback.feedback}"
                </div>
              </div>
              
              <div className="bg-[#222222] p-8 rounded-2xl border border-[#444444] text-gray-100 font-serif text-lg md:text-xl leading-[2.5] shadow-inner selection:bg-[#f7931e] selection:text-[#222222]">
                <div 
                  className="correction-container"
                  dangerouslySetInnerHTML={{ __html: feedback.annotatedHtml }} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
               <button 
                 onClick={handleRetry} 
                 className="py-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 bg-[#444444] text-white hover:bg-gray-600 transition-all border border-white/5 active:scale-95 shadow-lg"
               >
                 <RotateCcw className="w-4 h-4" /> Tentar Novamente
               </button>
               <button 
                 onClick={handleFinishWriting} 
                 className="py-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 bg-[#f7931e] text-[#222222] hover:bg-[#e08215] shadow-xl shadow-[#f7931e]/20 active:scale-95 transition-all"
               >
                 Finalizar Atividade <Send className="w-4 h-4" />
               </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 pb-24 animate-fade-in">
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black text-gray-500 uppercase tracking-widest bg-[#2a2a2a] px-3 py-1 rounded-lg border border-white/5">
             <span className="text-[#f7931e]">{level}</span>
             <span className="opacity-30">•</span>
             <span>{theme}</span>
             <span className="opacity-30">•</span>
             <span className="truncate max-w-[120px] md:max-w-[200px]">{topic}</span>
          </div>
          <button onClick={onHome} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs mt-1 transition-colors"><Home className="w-3.5 h-3.5" /> Sair</button>
        </div>
        <div className="text-[#f7931e] font-bold uppercase tracking-widest text-xs flex items-center gap-2 pt-1"><PenTool className="w-4 h-4" /> Prática de Escrita</div>
      </div>
      
      <div className="space-y-6">
        <div className="bg-[#333333] p-6 rounded-2xl border border-[#444444] shadow-lg relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-5"><PenTool className="w-24 h-24 text-[#f7931e]" /></div>
           <h3 className="text-[#f7931e] text-[10px] font-bold uppercase tracking-tighter mb-1">Tarefa (Assignment)</h3>
           <p className="text-lg md:text-xl text-white font-medium leading-relaxed mb-4">{content.writingPrompt}</p>
           {/* Tamanho esperado — vem da trilha e cresce a cada Season
               (frases curtas → parágrafo → texto). Deixa claro quanto se
               espera do aluno antes de ele começar a escrever. */}
           {content.writingLengthHint && (
             <p className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-xl bg-[#f7931e]/10 border border-[#f7931e]/30 text-[#f7931e] text-[11px] font-black uppercase tracking-widest">
               ✍️ {content.writingLengthHint}
             </p>
           )}

           <div className="flex flex-wrap gap-3">
             <button 
                onClick={handleSeeExample} 
                disabled={isGeneratingExample} 
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#222222] text-[#f7931e] border border-[#f7931e]/30 text-xs font-bold hover:bg-[#f7931e] hover:text-[#222222] transition-all disabled:opacity-50"
             >
               {isGeneratingExample ? <Loader2 className="w-4 h-4 animate-spin"/> : <BookOpen className="w-4 h-4" />} 
               {example ? "Exemplo Ativo" : "Ver um Exemplo"}
             </button>

             <button 
                onClick={() => setShowTranslation(!showTranslation)} 
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all ${showTranslation ? 'bg-[#f7931e] text-[#222222] border-[#f7931e]' : 'bg-[#222222] text-gray-400 border-[#444444] hover:border-gray-300'}`}
             >
               <Languages className="w-4 h-4" />
               Traduzir enunciado
               {showTranslation ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
             </button>
           </div>

           {showTranslation && (
             <div className="mt-4 p-4 bg-[#222222] rounded-xl border border-blue-500/20 animate-pop text-blue-100/80 text-sm leading-relaxed italic">
                <span className="text-blue-400 font-bold block mb-1 text-[10px] uppercase">Tradução:</span>
                {cleanMarkdown(content.writingPromptPT) || "Tradução não disponível para esta atividade."}
             </div>
           )}

           {example && (
             <div className="mt-6 p-4 bg-[#222222] rounded-xl border border-[#f7931e]/20 animate-pop">
                <h4 className="text-[#f7931e] font-bold text-[10px] uppercase mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Modelo Sugerido</h4>
                <div className="text-gray-300 text-sm italic leading-relaxed">
                   <InteractiveText text={cleanMarkdown(example)} />
                </div>
             </div>
           )}
        </div>

        <textarea 
          value={userText} 
          onChange={(e) => setUserText(e.target.value)} 
          placeholder="Escreva seu texto aqui em inglês..." 
          className="w-full h-80 bg-[#222222] border-2 border-[#333333] focus:border-[#f7931e] rounded-2xl p-6 text-lg text-white placeholder-gray-600 resize-none outline-none transition-all shadow-inner" 
          spellCheck={false}
          disabled={isSubmitting}
        />

        <div className="flex justify-end pt-4">
           <button 
             onClick={handleSubmit} 
             disabled={!userText.trim() || isSubmitting} 
             className="px-10 py-4 rounded-xl font-black text-lg bg-[#f7931e] text-[#222222] hover:bg-[#e08215] flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl disabled:opacity-50 min-w-[300px]"
           >
             {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />} {isSubmitting ? "O Professor está corrigindo..." : "Entregar para Correção"}
           </button>
        </div>
      </div>
    </div>
  );
};

export default WritingScreen;
