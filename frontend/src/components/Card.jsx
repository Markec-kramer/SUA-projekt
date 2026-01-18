import React from 'react';

export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-slate-800 text-white p-5 rounded-xl shadow-md hover:shadow-xl transition-all duration-200 dark:bg-slate-900 border border-slate-700/50 ${className}`}>
      {children}
    </div>
  );
}
