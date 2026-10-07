"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from 'next-intl';

interface AITimerProps {
    isLoading: boolean;
    label?: string;
    subLabel?: string;
}

export function AILoader({ isLoading, label, subLabel }: AITimerProps) {
    const t = useTranslations('Common.ai');
    const displayLabel = label || t('loaderLabel');
    const displaySubLabel = subLabel || t('loaderSubLabel');
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        let interval: any;
        if (isLoading) {
            setSeconds(0);
            interval = setInterval(() => {
                setSeconds(s => s + 1);
            }, 1000);
        } else {
            // Delay resetting slightly for smooth exit animation
            const timeout = setTimeout(() => setSeconds(0), 500);
            return () => {
                clearInterval(interval);
                clearTimeout(timeout);
            };
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    return (
        <AnimatePresence>
            {isLoading && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="flex items-center gap-4 p-5 bg-white border border-violet-100 rounded-3xl shadow-[0_20px_50px_rgba(124,58,237,0.1)] relative overflow-hidden group"
                >
                    {/* Animated Background Pulse */}
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-50/50 to-blue-50/50 animate-pulse" />
                    
                    <div className="relative z-10 w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-200">
                        <RefreshCw size={20} className="text-white animate-spin" />
                    </div>

                    <div className="relative z-10 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={14} className="text-violet-500" />
                            <span className="text-sm font-black uppercase tracking-widest text-[#002B5B]">{displayLabel}</span>
                        </div>
                        <p className="text-sm text-slate-400 font-medium">{displaySubLabel}</p>
                    </div>

                    <div className="relative z-10 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center min-w-[60px]">
                        <span className="text-sm font-black text-slate-400 uppercase tracking-tighter">{t('time')}</span>
                        <span className="text-base font-black text-violet-600">{seconds}s</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

import { cn } from "@/lib/utils";

export function AITimerInline({ isLoading, label, className }: { isLoading: boolean; label?: string; className?: string }) {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        let interval: any;
        if (isLoading) {
            setSeconds(0);
            interval = setInterval(() => setSeconds(s => s + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    if (!isLoading) return null;

    return (
        <span className={cn("inline-flex items-center gap-1.5 ms-2 px-2.5 py-1 bg-violet-100 text-violet-700 rounded-lg text-sm font-black transition-all animate-in fade-in zoom-in", className)}>
            <RefreshCw size={14} className="animate-spin" />
            {label && <span className="me-1">{label}</span>}
            {seconds}s
        </span>
    );
}


