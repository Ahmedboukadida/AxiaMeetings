"use client";

import { useState, useEffect, startTransition } from "react";

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

export function LocaleSwitcher() {
  const [currentLocale, setCurrentLocale] = useState('en');

  useEffect(() => {
    startTransition(() => {
      setCurrentLocale(getCookie('locale') || 'en');
    });
  }, []);

  const handleLocaleChange = (newLocale: string) => {
    setCookie('locale', newLocale, 365);
    window.location.reload();
  };

  return (
    <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 backdrop-blur-xl">
      {['en', 'fr', 'ar'].map((loc) => (
        <button
          key={loc}
          onClick={() => handleLocaleChange(loc)}
          className={`px-3 py-1.5 rounded-lg text-sm font-black uppercase transition-all ${currentLocale === loc
            ? 'bg-[#002B5B] text-white shadow-lg shadow-blue-900/20'
            : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-100'
          }`}
        >
          {loc}
        </button>
      ))}
    </div>
  );
}

