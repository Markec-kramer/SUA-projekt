import React from 'react';
import clsx from 'clsx';

export default function Button({ children, variant = 'default', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none';
  const variants = {
    default: 'bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-200 dark:text-white dark:hover:bg-slate-800',
    secondary: 'bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 text-white',
    danger: 'bg-red-600 text-white hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500',
  };
  return (
    <button className={clsx(base, variants[variant] || variants.default, className)} {...props}>
      {children}
    </button>
  );
}
