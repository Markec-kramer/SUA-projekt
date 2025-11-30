import React from 'react';

export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-slate-800 text-white p-4 sm:p-6 rounded-lg shadow-sm dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}
