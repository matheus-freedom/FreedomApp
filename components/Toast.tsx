// ════════════════════════════════════════════════════════════════
// Toast — avisos elegantes no lugar do alert() do navegador
// ────────────────────────────────────────────────────────────────
// O alert() nativo é um popup cinza que congela a página inteira e
// destoa do visual do app. Este componente mostra a mesma mensagem
// num cartão no rodapé, com o estilo da Freedom, sem travar nada.
//
// Uso, de QUALQUER arquivo (dentro ou fora de componente React):
//   import { showToast } from './components/Toast';
//   showToast('Perfil atualizado!', 'success');
//
// O <ToastHost /> é montado uma única vez no App e é quem desenha
// os cartões. showToast() só entrega a mensagem para ele.
// ════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem { id: number; message: string; type: ToastType }

// Canal entre showToast() e o ToastHost. Se alguém chamar showToast
// antes de o host montar (raro), a mensagem espera na fila.
let pushToast: ((message: string, type: ToastType, duration: number) => void) | null = null;
let queue: { message: string; type: ToastType; duration: number }[] = [];

export const showToast = (message: string, type: ToastType = 'info', duration = 4500) => {
  if (pushToast) pushToast(message, type, duration);
  else queue.push({ message, type, duration });
};

const STYLE: Record<ToastType, { border: string; iconBg: string; icon: React.ReactNode }> = {
  success: {
    border: 'border-green-500/60',
    iconBg: 'bg-green-500/15 text-green-400',
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
  error: {
    border: 'border-red-500/60',
    iconBg: 'bg-red-500/15 text-red-400',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
  info: {
    border: 'border-[#f7931e]/60',
    iconBg: 'bg-[#f7931e]/15 text-[#f7931e]',
    icon: <Info className="w-5 h-5" />,
  },
};

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 1;
    pushToast = (message, type, duration) => {
      const id = nextId++;
      // No máximo 3 cartões na tela; o mais antigo sai para o novo entrar.
      setToasts(t => [...t.slice(-2), { id, message, type }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
    };
    queue.forEach(q => pushToast!(q.message, q.type, q.duration));
    queue = [];
    return () => { pushToast = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    // Rodapé central: não briga com o balão do Fred/Frida (canto direito).
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[950] flex flex-col items-center gap-3 px-4 w-full max-w-md pointer-events-none">
      {toasts.map(t => {
        const s = STYLE[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto w-full bg-[#1f1f1f] border-2 ${s.border} rounded-2xl px-4 py-3.5 shadow-[0_10px_40px_rgba(0,0,0,0.6)] flex items-center gap-3 animate-pop`}
            onClick={() => setToasts(list => list.filter(x => x.id !== t.id))}
            role="status"
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${s.iconBg}`}>{s.icon}</div>
            <p className="text-sm font-bold text-white leading-snug">{t.message}</p>
          </div>
        );
      })}
    </div>
  );
};
