"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2, Download, ChevronDown, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useAuth } from '@/components/context/AuthContext';

interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
}

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

interface ChatWidgetProps {
    /** Pass meetingId when rendering inside a live meeting page */
    meetingId?: number;
}

export function ChatWidget({ meetingId }: ChatWidgetProps) {
    const { user } = useAuth();
    const prevUserIdRef = useRef<number | null | undefined>(undefined);
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [minimized, setMinimized] = useState(false);
    // UUID generated once per widget mount — one row per browser session
    const sessionId = useRef<string>(typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const locale = useLocale();
    const t = useTranslations("Chat");
    const pathname = usePathname();
    const isRTL = locale === "ar";

    // Auto-detect meetingId from URL if not passed as prop
    const resolvedMeetingId =
        meetingId ??
        (() => {
            const match = pathname.match(/\/meetings\/(\d+)\/live/);
            return match ? Number(match[1]) : undefined;
        })();

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
            setOpen(false); // Close the chat widget!
            setMinimized(false); // Reset minimize state
            sessionId.current = typeof crypto !== 'undefined'
                ? crypto.randomUUID()
                : Math.random().toString(36).slice(2);
            prevUserIdRef.current = user?.id || null;
        }
    }, [user, messages]);

    // Mark session closed on page unload
    useEffect(() => {
        const handleUnload = () => {
            navigator.sendBeacon(
                "/api/chat",
                new Blob([JSON.stringify({ _close: true, sessionId: sessionId.current })], { type: "application/json" })
            );
        };
        window.addEventListener("beforeunload", handleUnload);
        return () => window.removeEventListener("beforeunload", handleUnload);
    }, []);

    // Scroll state and helpers
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

    // Scroll to bottom on new messages
    useEffect(() => {
        scrollToBottom('smooth');
    }, [messages, scrollToBottom]);

    // Scroll to bottom when opening or maximizing
    useEffect(() => {
        if (open && !minimized) {
            setTimeout(() => {
                scrollToBottom('auto');
            }, 100);
        }
    }, [open, minimized, scrollToBottom]);

    // Focus input when opened
    useEffect(() => {
        if (open && !minimized) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open, minimized]);

    // Auto-grow input textarea up to 4 rows (96px height)
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    }, [input]);

    // Add welcome message on first open
    useEffect(() => {
        if (open && messages.length === 0) {
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setMessages([
                {
                    role: "assistant",
                    content: t("welcome"),
                    timestamp: timeString,
                },
                {
                    role: "assistant",
                    content: t("privacyNotice"),
                    timestamp: timeString,
                },
            ]);
        }
    }, [open]);

    const downloadChat = useCallback(() => {
        if (messages.length === 0) return;
        
        let textContent = "Axia Meetings - Chat Export\n\n";
        messages.forEach(msg => {
            const role = msg.role === "user" ? "You" : "Axia Support";
            const time = msg.timestamp ? ` [${msg.timestamp}]` : "";
            textContent += `[${role}]${time}: \n${msg.content}\n\n`;
        });
        
        const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `chat-export-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [messages]);

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
    };

    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;

        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const userMessage: Message = { role: "user", content: text, timestamp: timeString };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput("");
        setLoading(true);

        // Add empty assistant message to stream into
        setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: timeString }]);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
                    locale,
                    meetingId: resolvedMeetingId,
                    sessionId: sessionId.current,
                }),
            });

            if (!res.ok || !res.body) {
                throw new Error("Failed to get response");
            }

            // Stream the response
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                accumulated += chunk;

                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: "assistant",
                        content: accumulated,
                        timestamp: timeString,
                    };
                    return updated;
                });
            }
        } catch {
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: "assistant",
                    content: t("error"),
                    timestamp: timeString,
                };
                return updated;
            });
        } finally {
            setLoading(false);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [input, loading, messages, locale, resolvedMeetingId, t]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className={`fixed bottom-4 sm:bottom-6 z-50 ${isRTL ? "left-4 sm:left-6" : "right-4 sm:right-6"}`} dir={isRTL ? "rtl" : "ltr"}>
            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 15, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className={`fixed sm:absolute inset-0 sm:inset-auto sm:bottom-20 ${
                            isRTL ? "sm:left-0" : "sm:right-0"
                        } z-[100] w-full h-[100dvh] sm:h-auto sm:max-h-[min(600px,calc(100vh-140px))] sm:w-[380px] bg-white sm:rounded-3xl shadow-[0_20px_50px_rgba(0,43,91,0.12)] sm:border border-slate-100 overflow-hidden flex flex-col transition-all duration-300`}
                        style={{
                            height: minimized ? "56px" : undefined,
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-slate-50 to-white text-[#002B5B] flex-shrink-0 border-b border-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600"><Bot className="w-5 h-5" /></div>
                                <div>
                                    <p className="text-sm font-bold leading-tight">{t("title")}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{t("subtitle")}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {messages.length > 0 && (
                                    <button 
                                        onClick={closeCurrentSession} 
                                        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors" 
                                        title={locale === 'fr' ? "Fermer la session" : locale === 'ar' ? "إغلاق الجلسة" : "Close Session"} 
                                        aria-label="Close Session"
                                    >
                                        <Trash2 className="w-4.5 h-4.5" />
                                    </button>
                                )}
                                {messages.length > 0 && (
                                    <button 
                                        onClick={downloadChat} 
                                        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" 
                                        title="Download Chat"
                                        aria-label="Download Chat"
                                    >
                                        <Download className="w-4.5 h-4.5" />
                                    </button>
                                )}
                                <button onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-red-50 hover:text-red-500 text-slate-400 transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {!minimized && (
                            <>
                                {/* Messages */}
                                <div className="relative flex-1 flex flex-col overflow-hidden min-h-[300px]">
                                    <div 
                                        ref={scrollContainerRef}
                                        onScroll={handleScroll}
                                        className="flex-1 overflow-y-auto p-4 space-y-4 bg-white"
                                    >
                                        {messages.map((msg, i) => (
                                            <div key={i} className={`flex gap-3 ${msg.role === "user" ? (isRTL ? "flex-row" : "flex-row-reverse") : "flex-row"}`}>
                                                {/* Avatar */}
                                                <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-white shadow-sm ${msg.role === "assistant" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                                                    {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                                </div>

                                                {/* Bubble & Timestamp Container */}
                                                <div className="flex flex-col max-w-[85%]">
                                                    <div
                                                        className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed transition-all duration-300 ${
                                                            msg.role === "assistant"
                                                                ? `bg-slate-50 text-slate-700 font-medium ${isRTL ? "rounded-tr-none" : "rounded-tl-none"}`
                                                                : `bg-[#002B5B] text-white font-semibold ${isRTL ? "rounded-tl-none" : "rounded-tr-none"} shadow-md shadow-blue-900/5`
                                                        }`}
                                                    >
                                                        {msg.content === "" && loading && i === messages.length - 1 ? (
                                                            <span className="flex gap-1.5 items-center py-1">
                                                                <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                                                <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                                                <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                                            </span>
                                                        ) : (renderMessageContent(msg.content, msg.role))}
                                                    </div>
                                                    {msg.timestamp && (
                                                        <span className={`text-[9px] text-slate-400 mt-1 font-medium ${msg.role === "user" ? "self-end" : "self-start"}`}>
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

                                {/* Input */}
                                <div className="p-4 bg-white border-t border-slate-50">
                                    <div className="flex gap-2.5 items-center bg-slate-50/80 p-1.5 rounded-2xl border border-slate-100 focus-within:bg-white focus-within:border-blue-200 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all duration-300">
                                        <textarea
                                            ref={inputRef}
                                            rows={1}
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder={t("placeholder")}
                                            disabled={loading}
                                            className="flex-1 text-sm bg-transparent px-3 py-2 focus:outline-none disabled:opacity-50 font-medium placeholder:text-slate-400 resize-none overflow-y-auto max-h-[96px] leading-[20px]"
                                            dir={isRTL ? "rtl" : "ltr"}
                                        />
                                        <button
                                            onClick={sendMessage}
                                            disabled={loading || !input.trim()}
                                            className="w-10 h-10 rounded-xl bg-[#002B5B] hover:bg-blue-800 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-blue-900/10 active:scale-90"
                                            aria-label="Send"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-slate-300 text-center mt-3 font-bold tracking-[0.2em] uppercase opacity-80">
                                        {t("poweredBy")}
                                    </p>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toggle button */}
            <motion.button
                onClick={() => setOpen((o) => !o)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#002B5B] to-blue-600 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center relative z-50 border-4 border-white"
                aria-label={open ? "Close chat" : "Open chat"}
            >
                <AnimatePresence mode="wait">
                    {open ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <X className="w-7 h-7" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="open"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <MessageCircle className="w-7 h-7" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Pulse ring */}
                {!open && <span className="absolute inset-[-4px] rounded-full bg-blue-500 animate-ping opacity-20 -z-10" />}
            </motion.button>
        </div>
    );
}
