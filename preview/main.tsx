import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import FredExplainsScreen from '../components/FredExplainsScreen';
import FredLessonScreen from '../components/FredLessonScreen';
import { FRED_CATALOG } from '../fredExplains';
import { ToastHost } from '../components/Toast';
import ResultsScreen from '../components/ResultsScreen';
const user: any = { userId: 'u1', userName: 'Matheus Silva', gamification: { xp: 1000, dailyXpEarned: 0 } };
const params = new URLSearchParams(location.search);
const Preview = () => {
  const [entry, setEntry] = useState<any>(params.get('lesson') ? FRED_CATALOG.find(c => c.id === params.get('lesson')) : null);
  return (
    <div className="min-h-screen bg-[#222222] text-white font-sans">
      <ToastHost />
      <div className="h-[76px] bg-[#1a1a1a] border-b border-[#f7931e]/30 sticky top-0 z-50" />
      <main className="container mx-auto px-4">
        {params.get('results') ? <ResultsScreen score={5} totalQuestions={10} onRetry={() => {}} onHome={() => {}} xpGained={50} frGained={0.5} reviewTopic="Verbo to be (presente)" onReviewWithFred={() => {}} /> : entry
          ? <FredLessonScreen user={user} entry={entry} onBack={() => setEntry(null)} onOpenLesson={setEntry} onUserUpdate={() => {}} onPractice={() => {}} journeyOrigin={params.get('journey') ? { journeyId: 'freedom', season: 0, nodeIndex: 0, nextKind: 'grammar', stepLabel: 'Season 1 · Step 1', nextLabel: 'Gramática' } : null} onStartJourneyExercise={async () => { alert('iria para o exercício'); return false; }} />
          : <FredExplainsScreen user={user} onHome={() => {}} onOpenLesson={setEntry} />}
      </main>
    </div>
  );
};
ReactDOM.createRoot(document.getElementById('root')!).render(<Preview />);
