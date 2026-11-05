import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import GamesScreen from '../components/GamesScreen';
import { ToastHost } from '../components/Toast';
// Preview da aba Games (ver preview/README.md). ?as=prof entra como professor.
const uid = new URLSearchParams(location.search).get('as') || 'me';
const Preview = () => {
  const [user, setUser] = useState<any>({ userId: uid, username: uid === 'prof' ? '@prof' : '@matheus', userName: 'Matheus', fullName: 'Matheus', gamification: { xp: 2400, frBalance: 12.5 } });
  return (
    <div className="min-h-screen bg-[#222222] text-white">
      <ToastHost />
      <div className="h-[76px] bg-[#1a1a1a] border-b border-[#f7931e]/30 sticky top-0 z-50" />
      <main className="container mx-auto px-0 md:px-4">
        <GamesScreen user={user} onHome={() => {}} onUserUpdate={setUser} />
      </main>
    </div>
  );
};
ReactDOM.createRoot(document.getElementById('root')!).render(<Preview />);
