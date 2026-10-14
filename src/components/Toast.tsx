import React from 'react';

interface ToastProps {
  message: string | null;
  icon?: string;
}

export const Toast: React.FC<ToastProps> = ({ message, icon = 'check_circle' }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200 pointer-events-none">
      <div className="px-5 py-3 rounded-2xl bg-[#111c2d] text-white shadow-2xl flex items-center gap-3 text-xs font-bold border border-white/10">
        <span className="material-symbols-outlined text-[20px] text-[#82f5c1]">{icon}</span>
        <span>{message}</span>
      </div>
    </div>
  );
};
