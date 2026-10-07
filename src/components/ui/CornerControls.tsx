"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ChevronUp, 
    ChevronDown,
    Languages, 
    MessageCircle, 
    X, 
    Bot, 
    User, 
    Loader2, 
    Minimize2, 
    Maximize2,
    Send,
    Check,
    Download,
    History,
    Plus,
    ArrowLeft,
    Trash2,
    LogOut,
    Minus
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { locales, Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { useAuth } from '@/components/context/AuthContext';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
}

const names: Record<Locale, string> = {
    en: "EN",
    fr: "FR",
    ar: "AR"
};

const flags: Record<Locale, string> = {
    en: "🇺🇸",
    fr: "🇫🇷",
    ar: "🇹🇳"
};

function renderMessageContent(content: string, role: string) {
    if (!content) return null;
    const regex = /(\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\))|(https?:\/\/[^\s\)]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    const linkClass = role === 'user'
        ? 'underline text-blue-200 hover:text-white transition-colors duration-200 font-semibold break-all'
        : 'underline text-blue-600 hover:text-blue-800 transition-colors duration-200 font-semibold break-all';

    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            parts.push(content.substring(lastIndex, match.index));
        }
        if (match[1]) {
            const label = match[2];
            const url = match[3];
            parts.push(
                <a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {label}
                </a>
            );
        } else {
            const url = match[4];
            parts.push(
                <a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {url}
                </a>
            );
        }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
        parts.push(content.substring(lastIndex));
    }
    return <span className="whitespace-pre-wrap break-words">{parts.length > 0 ? parts : content}</span>;
}

export function CornerControls() {
    const locale = useLocale() as Locale;
    const tChat = useTranslations('Chat');
    const tCommon = useTranslations('Common');
    const pathname = usePathname();
    const isRTL = locale === 'ar';

    // --- Scroll To Top Logic ---
    const [isScrollVisible, setIsScrollVisible] = useState(false);
    useEffect(() => {
        const toggleVisibility = () => {
            setIsScrollVisible(window.scrollY > 300);
        };
        window.addEventListener("scroll", toggleVisibility);
        return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // --- Language Toggle Logic ---
    const [isLangOpen, setIsLangOpen] = useState(false);
    const switchLanguage = (newLocale: Locale) => {
        if (newLocale === locale) {
            setIsLangOpen(false);
            return;
        }
        document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
        window.location.reload();
    };

    // --- Chat Logic ---
    const { user } = useAuth();
    const prevUserIdRef = useRef<number | null | undefined>(undefined);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isChatMinimized, setIsChatMinimized] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const sessionId = useRef<string>(
        typeof crypto !== 'undefined'
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2)
    );
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Chat Scroll States & Actions
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

    const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
        setShowScrollBottomBtn(!isNearBottom);
    };

    useEffect(() => {
        if (isChatOpen && !isChatMinimized) {
            setTimeout(() => {
                scrollToBottom('auto');
            }, 100);
        }
    }, [isChatOpen, isChatMinimized, scrollToBottom]);

    // Chat History States & Actions
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [pastSessions, setPastSessions] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const fetchHistory = useCallback(async () => {
        if (!user) return;
        setLoadingHistory(true);
        try {
            const res = await fetch('/api/chat?mySessions=true');
            if (res.ok) {
                const json = await res.json();
                if (json.status) {
                    setPastSessions(json.data || []);
                }
            }
        } catch (e) {
            console.error('Failed to fetch history:', e);
        } finally {
            setLoadingHistory(false);
        }
    }, [user]);

    useEffect(() => {
        if (isHistoryOpen && isChatOpen) {
            fetchHistory();
        }
    }, [isHistoryOpen, isChatOpen, fetchHistory]);

    const resumeSession = (session: any) => {
        setMessages(session.messages || []);
        sessionId.current = session.session_id;
        setIsHistoryOpen(false);
        setIsChatMinimized(false);
    };

    const startNewSession = () => {
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages([{ role: 'assistant', content: tChat('welcome'), timestamp: timeString }]);
        sessionId.current = typeof crypto !== 'undefined'
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);
        setIsHistoryOpen(false);
        setIsChatMinimized(false);
    };

    const closeCurrentSession = async () => {
        const oldSessionId = sessionId.current;
        if (messages.length > 0) {
            fetch('/api/chat', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: oldSessionId }),
            }).catch(() => {});
        }
        sessionId.current = typeof crypto !== 'undefined'
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);
        setMessages([]);
        setIsHistoryOpen(false);
    };

    // Close session on F5 / reload / tab close
    useEffect(() => {
        const handleUnload = () => {
            if (messages.length > 0) {
                navigator.sendBeacon(
                    "/api/chat",
                    new Blob([JSON.stringify({ _close: true, sessionId: sessionId.current })], { type: "application/json" })
                );
            }
        };
        window.addEventListener("beforeunload", handleUnload);
        return () => window.removeEventListener("beforeunload", handleUnload);
    }, [messages]);

    // Close session and reset state on login, logout, or account switch
    useEffect(() => {
        if (prevUserIdRef.current === undefined) {
            prevUserIdRef.current = user?.id || null;
            return;
        }
        if (prevUserIdRef.current !== (user?.id || null)) {
            const oldSessionId = sessionId.current;
            if (messages.length > 0) {
                fetch('/api/chat', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: oldSessionId }),
                }).catch(() => {});
            }
            setMessages([]);
            setIsChatOpen(false); // Close the chat widget!
            setIsChatMinimized(false); // Reset minimize state
            setIsHistoryOpen(false); // Reset history view state
            sessionId.current = typeof crypto !== 'undefined'
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2);
            prevUserIdRef.current = user?.id || null;
        }
    }, [user, messages]);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 640);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        scrollToBottom('smooth');
    }, [messages, scrollToBottom]);

    useEffect(() => {
        if (isChatOpen && !isChatMinimized) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isChatOpen, isChatMinimized]);

    // Auto-grow input textarea up to 4 rows (96px height)
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    }, [input]);

    useEffect(() => {
        if (isChatOpen && messages.length === 0) {
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages([{ role: 'assistant', content: tChat('welcome'), timestamp: timeString }]);
        }
    }, [isChatOpen]);

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;

        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const userMessage: Message = { role: 'user', content: text, timestamp: timeString };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: timeString }]);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages.map(m => ({ role: m.role, content: m.content })),
                    locale,
                    sessionId: sessionId.current,
                }),
            });

            if (!res.ok || !res.body) throw new Error('Failed');

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'assistant', content: accumulated, timestamp: timeString };
                    return updated;
                });
            }
        } catch {
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: tChat('error'), timestamp: timeString };
                return updated;
            });
        } finally {
            setLoading(false);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [input, loading, messages, locale, tChat]);

    const downloadChat = useCallback(() => {
        if (messages.length === 0) return;
        
        let textContent = "Axia Meetings - Chat Export\n\n";
        messages.forEach(msg => {
            const role = msg.role === "user" 
                ? (locale === 'fr' ? 'Vous' : locale === 'ar' ? 'أنت' : 'You') 
                : tChat('title');
            const time = msg.timestamp ? ` [${msg.timestamp}]` : "";
            textContent += `[${role}]${time}: \n${msg.content}\n\n`;
        });
        
        const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `chat-export-${new Date().toISOString().slice(0,10)}.txt`;
        link.click();
        URL.revokeObjectURL(url);
    }, [messages, locale, tChat]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div 
            className={cn(
                "fixed bottom-6 z-[100] flex flex-col items-end gap-3",
                isRTL ? "left-6" : "right-6"
            )}
            dir={isRTL ? 'rtl' : 'ltr'}
        >
            {/* Chat Panel */}
            <AnimatePresence>
                {isChatOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: isMobile ? 0 : (isRTL ? -20 : 20), y: isMobile ? 50 : 0, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                        exit={{ opacity: 0, x: isMobile ? 0 : (isRTL ? -20 : 20), y: isMobile ? 50 : 0, scale: 0.95 }}
                        className={cn(
                            "bg-white shadow-[0_30px_100px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden flex flex-col transition-all duration-300",
                            isMobile
                                ? "fixed inset-0 w-full z-[150] rounded-none border-none"
                                : cn(
                                    "absolute bottom-0 w-[400px] rounded-[2.5rem] z-10",
                                    isRTL ? "left-20" : "right-20"
                                  )
                        )}
                        style={{
                            height: isChatMinimized 
                                ? '64px' 
                                : isMobile 
                                ? '100dvh' 
                                : '80vh',
                            maxHeight: isChatMinimized 
                                ? '64px' 
                                : isMobile 
                                ? '100dvh' 
                                : '650px'
                        }}
                    >
                        <div className={cn(
                            "flex items-center justify-between bg-[#002B5B] text-white shrink-0 transition-all duration-300 w-full",
                            isChatMinimized 
                                ? "px-5 py-3 h-full" 
                                : "px-6 py-4 sm:px-8 sm:py-6"
                        )}>
                            <div className="flex items-center gap-3 sm:gap-4">
                                {isHistoryOpen ? (
                                    <button 
                                        onClick={() => setIsHistoryOpen(false)}
                                        className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white"
                                        title="Back to chat"
                                    >
                                        <ArrowLeft className="w-5 h-5 text-blue-200" />
                                    </button>
                                ) : (
                                    <div className={cn(
                                        "rounded-[1rem] sm:rounded-[1.25rem] bg-white/10 flex items-center justify-center backdrop-blur-md transition-all duration-300",
                                        isChatMinimized ? "w-8 h-8 rounded-lg" : "w-10 h-10 sm:w-12 sm:h-12"
                                    )}>
                                        <Bot className={cn(
                                            "text-blue-300 transition-all duration-300",
                                            isChatMinimized ? "w-4.5 h-4.5" : "w-5 h-5 sm:w-6 sm:h-6"
                                        )} />
                                    </div>
                                )}
                                <div>
                                    <p className={cn(
                                        "font-black uppercase tracking-widest leading-tight transition-all duration-300",
                                        isChatMinimized ? "text-sm" : "text-base sm:text-lg"
                                    )}>
                                        {isHistoryOpen ? (locale === 'fr' ? 'Historique' : locale === 'ar' ? 'السجل' : 'History') : tChat('title')}
                                    </p>
                                    {!isChatMinimized && !isHistoryOpen && (
                                        <p className="text-xs sm:text-sm text-blue-200 font-black uppercase tracking-[0.2em] opacity-70 mt-0.5">{tChat('subtitle')}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2">
                                {messages.length > 0 && !isChatMinimized && !isHistoryOpen && (
                                    <button 
                                        onClick={closeCurrentSession} 
                                        className="p-2 sm:p-2.5 rounded-2xl hover:bg-white/10 transition-colors text-white" 
                                        title={locale === 'fr' ? "Fermer la session" : locale === 'ar' ? "إغلاق الجلسة" : "Close Session"} 
                                        aria-label="Close Session"
                                    >
                                        <LogOut className="w-5 h-5 text-blue-200 hover:text-red-400" />
                                    </button>
                                )}
                                {user && !isChatMinimized && !isHistoryOpen && (
                                    <button 
                                        onClick={() => setIsHistoryOpen(true)} 
                                        className="p-2 sm:p-2.5 rounded-2xl hover:bg-white/10 transition-colors text-white" 
                                        title="Chat History"
                                        aria-label="Chat History"
                                    >
                                        <History className="w-5 h-5 text-blue-200" />
                                    </button>
                                )}
                                {messages.length > 2 && !isChatMinimized && !isHistoryOpen && (
                                    <button 
                                        onClick={downloadChat} 
                                        className="p-2 sm:p-2.5 rounded-2xl hover:bg-white/10 transition-colors text-white" 
                                        title={tChat('export')}
                                        aria-label="Export Chat"
                                    >
                                        <Download className="w-5 h-5 text-blue-200" />
                                    </button>
                                )}
                                <button onClick={() => setIsChatMinimized(!isChatMinimized)} className="p-2 sm:p-2.5 rounded-2xl hover:bg-white/10 transition-colors">
                                    {isChatMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
                                </button>
                                <button onClick={() => { setIsChatOpen(false); setIsHistoryOpen(false); }} className="p-2 sm:p-2.5 rounded-2xl hover:bg-white/10 transition-colors">
                                    <Minus className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {!isChatMinimized && (
                            <>
                                {isHistoryOpen ? (
                                    <div className="flex-1 flex flex-col bg-slate-50/50 p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                                        <button 
                                            onClick={startNewSession} 
                                            className="flex items-center justify-center gap-2 w-full py-3 bg-[#002B5B] hover:bg-[#002b5be0] text-white font-bold rounded-xl text-sm transition-all mb-4 shadow-md shadow-blue-900/20 active:scale-95 shrink-0"
                                        >
                                            <Plus className="w-4.5 h-4.5" />
                                            {locale === 'fr' ? 'Nouvelle Discussion' : locale === 'ar' ? 'محادثة جديدة' : 'New Chat'}
                                        </button>

                                        {loadingHistory ? (
                                            <div className="flex-1 flex items-center justify-center">
                                                <Loader2 className="w-6 h-6 animate-spin text-[#002B5B]" />
                                            </div>
                                        ) : pastSessions.length === 0 ? (
                                            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm italic">
                                                {locale === 'fr' ? 'Aucune discussion passée.' : locale === 'ar' ? 'لا توجد محادثات سابقة.' : 'No past chats found.'}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {pastSessions.map((session) => {
                                                    const msgs = session.messages || [];
                                                    const userMsg = msgs.find((m: any) => m.role === 'user')?.content || (locale === 'fr' ? 'Nouvelle discussion' : 'New discussion');
                                                    const dateStr = new Date(session.updated_at).toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                                                    return (
                                                        <button
                                                            key={session.id}
                                                            onClick={() => resumeSession(session)}
                                                            className="w-full text-left p-3.5 bg-white border border-slate-100 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all flex flex-col gap-1.5 active:scale-98"
                                                        >
                                                            <div className="flex justify-between items-center w-full">
                                                                <span className="text-[10px] font-mono text-slate-300">
                                                                    #{session.session_id.slice(0, 8)}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-medium">
                                                                    {dateStr}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-700 truncate w-full">
                                                                {userMsg}
                                                            </p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative flex-1 flex flex-col overflow-hidden">
                                            <div 
                                                ref={scrollContainerRef}
                                                onScroll={handleScroll}
                                                className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-6 bg-slate-50/50 custom-scrollbar"
                                            >
                                                {messages.map((msg, i) => (
                                                    <div key={i} className={cn("flex gap-3 sm:gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                                                        <div className={cn(
                                                            "w-8 h-8 sm:w-10 sm:h-10 rounded-[0.8rem] sm:rounded-[1rem] shrink-0 flex items-center justify-center shadow-md",
                                                            msg.role === 'assistant' ? "bg-blue-50 text-[#002B5B]" : "bg-slate-100 text-slate-500"
                                                        )}>
                                                            {msg.role === 'assistant' ? <Bot className="w-4 h-4 sm:w-5 sm:h-5" /> : <User className="w-4 h-4 sm:w-5 sm:h-5" />}
                                                        </div>
                                                        <div className="flex flex-col max-w-[85%]">
                                                            <div className={cn(
                                                                "rounded-[1.2rem] sm:rounded-[1.5rem] px-4 py-3 sm:px-6 sm:py-4 text-sm sm:text-base leading-relaxed shadow-sm w-full",
                                                                msg.role === 'assistant' ? "bg-white text-slate-700 border border-slate-100 font-medium" : "bg-[#002B5B] text-white font-semibold"
                                                            )}>
                                                                {msg.content === '' && loading && i === messages.length - 1 ? (
                                                                    <div className="flex gap-1.5 items-center py-2">
                                                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                                    </div>
                                                                ) : (
                                                                    renderMessageContent(msg.content, msg.role)
                                                                )}
                                                            </div>
                                                            {msg.timestamp && (
                                                                <span className={cn(
                                                                    "text-[10px] text-slate-400 mt-1.5 font-medium px-2",
                                                                    msg.role === 'user' ? "self-end" : "self-start"
                                                                )}>
                                                                    {msg.timestamp}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                <div ref={messagesEndRef} />
                                            </div>

                                            {/* Floating Go to bottom button */}
                                            <AnimatePresence>
                                                {showScrollBottomBtn && (
                                                    <motion.button
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: 10 }}
                                                        onClick={() => scrollToBottom('smooth')}
                                                        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#002B5B] hover:bg-[#002B5B]/90 text-white rounded-full p-2.5 shadow-lg border border-white/20 flex items-center gap-1 text-xs font-bold transition-all z-10 active:scale-95"
                                                    >
                                                        <ChevronDown className="w-4 h-4" />
                                                        {locale === 'fr' ? 'Dernier message' : locale === 'ar' ? 'آخر رسالة' : 'Last message'}
                                                    </motion.button>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <div className="p-4 sm:p-6 bg-white border-t border-slate-100">
                                            <div className="flex gap-2 bg-slate-50 p-1.5 sm:p-2 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 focus-within:border-blue-400 focus-within:ring-8 focus-within:ring-blue-400/5 transition-all items-center">
                                                <textarea
                                                    ref={inputRef}
                                                    rows={1}
                                                    value={input}
                                                    onChange={e => setInput(e.target.value)}
                                                    onKeyDown={handleKeyDown}
                                                    placeholder={tChat('placeholder')}
                                                    disabled={loading}
                                                    className="flex-1 bg-transparent px-3 py-2 sm:px-5 sm:py-3 outline-none text-sm sm:text-base font-bold text-[#002B5B] placeholder:text-slate-400 resize-none overflow-y-auto max-h-[96px] leading-[20px]"
                                                    dir={isRTL ? "rtl" : "ltr"}
                                                />
                                                <button
                                                    onClick={sendMessage}
                                                    disabled={loading || !input.trim()}
                                                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#002B5B] text-white flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/20"
                                                >
                                                    {loading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Send className="w-4 h-4 sm:w-5 sm:h-5" />}
                                                </button>
                                            </div>
                                            <p className="text-xs sm:text-sm text-center font-black uppercase tracking-[0.2em] text-slate-300 mt-3 sm:mt-4">{tChat('poweredBy')}</p>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Controls Stack */}
            <div className="flex flex-col gap-3">
                {/* 1. Chatbot Button */}
                {!isChatOpen && (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setIsChatOpen(true); setIsChatMinimized(false); }}
                        className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border relative bg-[#002B5B] border-white/10 text-white"
                    >
                        <MessageCircle className="w-6 h-6" />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                    </motion.button>
                )}

                {/* 2. Language Toggle (Horizontal) */}
                <div className="relative flex items-center">
                    <AnimatePresence>
                        {isLangOpen && (
                            <motion.div
                                initial={{ opacity: 0, x: isRTL ? 20 : -20, scale: 0.8 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: isRTL ? 20 : -20, scale: 0.8 }}
                                className={cn(
                                    "absolute flex gap-2 p-2 bg-white/90 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-2xl",
                                    isRTL ? "left-16" : "right-16"
                                )}
                            >
                                {locales.map((l) => (
                                    <button
                                        key={l}
                                        onClick={() => switchLanguage(l)}
                                        className={cn(
                                            "w-12 h-12 rounded-xl flex items-center justify-center text-sm transition-all font-black uppercase tracking-widest",
                                            locale === l ? "bg-[#002B5B] text-white" : "hover:bg-slate-100 text-slate-600"
                                        )}
                                    >
                                        {names[l]}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsLangOpen(!isLangOpen)}
                        className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border bg-white text-[#002B5B] border-slate-100"
                        )}
                    >
                        <Languages className="w-6 h-6" />
                    </motion.button>
                </div>

                {/* 3. Scroll To Top Button */}
                <AnimatePresence>
                    {isScrollVisible && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={scrollToTop}
                            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all border bg-white text-[#002B5B] border-slate-100"
                        >
                            <ChevronUp className="w-6 h-6" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
