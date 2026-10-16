import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const timer = useRef<number>();
  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMsg({ text, key: Date.now() });
    timer.current = window.setTimeout(() => setMsg(null), 1900);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div key={msg.key} className="toast" role="status" aria-live="polite">{msg.text}</div>}
    </ToastCtx.Provider>
  );
}
