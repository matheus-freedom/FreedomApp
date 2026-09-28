import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import ChallengesScreen from '../components/ChallengesScreen';
import { ToastHost } from '../components/Toast';
const uid = new URLSearchParams(location.search).get('as') || 'me';
const Preview = () => {
  const [user, setUser] = useState<any>({ userId: uid, username: '@matheus', userName: 'Matheus', fullName: 'Matheus', gamification: { xp: 2400, frBalance: 12.5 } });
  return (
    <div className="min-h-screen bg-[#222222] text-white font-sans">
      <ToastHost />
      <div className="h-[76px] bg-[#1a1a1a] border-b border-[#f7931e]/30 sticky top-0 z-50" />
      <main className="container mx-auto px-0 md:px-4">
        <ChallengesScreen user={user} onHome={() => {}} onUserUpdate={setUser} />
      </main>
    </div>
  );
};
ReactDOM.createRoot(document.getElementById('root')!).render(<Preview />);
