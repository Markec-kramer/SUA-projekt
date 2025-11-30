import React, { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  return (
    <button
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      className="inline-flex items-center justify-center p-2 rounded-md bg-slate-700 text-white hover:bg-slate-600"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        // sun icon
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM4.22 4.22a1 1 0 011.415 0L6.343 5.93a1 1 0 11-1.414 1.414L4.22 5.635a1 1 0 010-1.414zM13.657 13.657a1 1 0 011.414 0l1.505 1.505a1 1 0 11-1.414 1.414l-1.505-1.505a1 1 0 010-1.414zM2 10a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zM16 10a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM4.22 15.778a1 1 0 010-1.415l1.414-1.414a1 1 0 111.414 1.414L6.343 15.778a1 1 0 01-1.414 0zM13.657 6.343a1 1 0 010-1.414l1.505-1.505a1 1 0 011.414 1.414L15.07 6.343a1 1 0 01-1.414 0zM10 5a5 5 0 100 10A5 5 0 0010 5z" />
        </svg>
      ) : (
        // moon icon
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.293 13.293A8 8 0 116.707 2.707a7 7 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}

