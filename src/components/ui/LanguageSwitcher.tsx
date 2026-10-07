"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { locales, Locale } from "@/i18n/config";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Languages } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const names: Record<Locale, string> = {
    en: "English",
    fr: "Français",
    ar: "العربية"
};

const flags: Record<Locale, string> = {
    en: "🇺🇸",
    fr: "🇫🇷",
    ar: "🇹🇳"
};

export function LanguageSwitcher() {
    const locale = useLocale() as Locale;
    const t = useTranslations('Common');
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const switchLanguage = (newLocale: Locale) => {
        if (newLocale === locale) {
            setIsOpen(false);
            return;
        }
        document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
        window.location.reload();
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                    isOpen
                        ? "bg-[#002B5B] text-white shadow-xl shadow-blue-900/20"
                        : "bg-white border border-slate-200 text-slate-600 hover:border-[#002B5B] hover:bg-slate-50 shadow-sm"
                )}
            >
                <div className={cn(
                    "w-7 h-7 rounded-xl flex items-center justify-center text-base transition-transform duration-300 group-hover:scale-110",
                    isOpen ? "bg-white/20" : "bg-slate-100"
                )}>
                    {flags[locale]}
                </div>

                <div className="flex flex-col items-start leading-tight hidden sm:flex">
                    <span className={cn(
                        "text-sm font-black uppercase tracking-widest opacity-50",
                        isOpen ? "text-white" : "text-slate-400"
                    )}>
                        {t('language')}
                    </span>
                    <span className="text-sm font-black uppercase tracking-widest">
                        {names[locale]}
                    </span>
                </div>

                <ChevronDown size={14} className={cn(
                    "transition-transform duration-500 ease-out opacity-50 rtl:rotate-180",
                    isOpen ? "rotate-180 text-white" : "text-slate-400 group-hover:text-[#002B5B]"
                )} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 15, scale: 0.95 }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        className="absolute end-0 mt-3 w-64 bg-white/80 backdrop-blur-2xl rounded-3xl border border-white/40 shadow-[0_30px_90px_rgba(0,43,91,0.15)] overflow-hidden z-50 p-2"
                    >
                        <div className="px-3 py-2 mb-1">
                            <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                <Languages size={10} />
                                {t('selectLanguage')}
                            </p>
                        </div>
                        <div className="space-y-1">
                            {locales.map((l) => (
                                <button
                                    key={l}
                                    onClick={() => switchLanguage(l)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-200 group",
                                        locale === l
                                            ? "bg-[#002B5B] text-white shadow-lg shadow-blue-900/20"
                                            : "hover:bg-slate-100/80 text-slate-600 hover:text-[#002B5B]"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-sm transition-transform group-hover:scale-110",
                                            locale === l ? "bg-white/20" : "bg-white border border-slate-100"
                                        )}>
                                            {flags[l]}
                                        </div>
                                        <div className="flex flex-col items-start text-start">
                                            <span className="text-sm font-black uppercase tracking-widest opacity-50">
                                                {l === 'ar' ? 'Tunisia' : l === 'en' ? 'United States' : 'France'}
                                            </span>
                                            <span className="text-sm font-black uppercase tracking-widest">
                                                {names[l]}
                                            </span>
                                        </div>
                                    </div>
                                    {locale === l && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#002B5B]"
                                        >
                                            <Check size={14} strokeWidth={3} />
                                        </motion.div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


