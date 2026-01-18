import React from 'react';

export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-5 rounded-xl shadow-md hover:shadow-xl transition-all duration-200 border border-slate-200 dark:border-slate-700/50 ${className}`}>
      {children}
    </div>
  );
}
