'use client';

import { CustomCard } from '@/components/ui/custom-card';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/lib/enums/users';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { toast } from 'sonner';
import { Trash2, Pencil, Trash, User as UserIcon, Globe, Clock, RefreshCw, Sparkles, Loader2, FileText, TrendingUp, AlertTriangle, CheckCircle, Lightbulb, Play, Pause, ChevronLeft, ChevronRight, Activity, MessageCircle, Bot, ChevronDown, ChevronUp , LayoutGrid, List as ListIcon} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { ListGridToggle } from '@/components/ui/ListGridToggle';
import { useTranslations } from 'next-intl';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatSession {
    id: number;
    session_id: string;
    user_id: number | null;
    role: string | null;
    locale: string;
    messages: ChatMessage[];
    is_closed: boolean;
    created_at: string;
    updated_at: string;
    user?: {
        fullname: string | null;
        email: string | null;
    } | null;
}

interface AIReport {
    summary: string;
    topTopics: { topic: string; count: number; insight: string }[];
    issues: { issue: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; suggestion: string }[];
    improvements: string[];
    userSatisfaction: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
    totalSessions: number;
    avgMessagesPerSession: number;
}

export default function ChatSessionsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('ChatSessions');
    const tc = useTranslations('Common');
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<'delete' | 'bulk-delete' | 'view' | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<ChatSession | null>(null);
    const [bulkSelected, setBulkSelected] = useState<ChatSession[]>([]);
    const [deleting, setDeleting] = useState(false);
    const [total, setTotal] = useState(0);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isPolling, setIsPolling] = useState(true);
    const [report, setReport] = useState<AIReport | null>(null);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const pollingRef = useRef<any>(null);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) {
            router.replace('/overview');
        }
    }, [user, authLoading, router]);

    const fetchSessions = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`/api/chat?limit=500`);
            const data = await res.json();
            if (data.status) {
                if (silent) {
                    setSessions(prev => {
                        const newMap = new Map<number, ChatSession>(data.data.map((s: ChatSession) => [s.id, s]));
                        const merged: ChatSession[] = prev.map(s => newMap.get(s.id) ?? s);
                        const known = new Set(prev.map(p => p.id));
                        data.data.forEach((s: ChatSession) => {
                            if (!known.has(s.id)) merged.unshift(s);
                        });
                        return merged.sort((a, b) => b.id - a.id).slice(0, 500);
                    });
                } else {
                    setSessions(data.data);
                }
                setTotal(data.total);
                setLastUpdated(new Date());
            }
        } catch { /* ignore */ }
        finally { if (!silent) setLoading(false); }
    }, []);

    useEffect(() => {
        if (user?.role === UserRole.DEVELOPER) fetchSessions();
    }, [user, fetchSessions]);

    useEffect(() => {
        if (!isPolling || user?.role !== UserRole.DEVELOPER) return;
        // Skip polls while the tab is hidden: each poll returns up to 500 full transcripts.
        pollingRef.current = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchSessions(true);
        }, 5000);
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [isPolling, fetchSessions, user]);

    const handleGenerateReport = async () => {
        if (sessions.length === 0) return;
        setGeneratingReport(true);
        setShowReport(true);
        try {
            const res = await fetch('/api/chat/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessions }),
            });
            const data = await res.json();
            if (data.status) setReport(data.data);
        } catch { /* ignore */ }
        finally { setGeneratingReport(false); }
    };

    const roleVariant = (role: string | null): any => {
        const map: Record<string, string> = {
            DEVELOPER: 'default',
            ADMIN: 'primary',
            PARTICIPANT: 'secondary',
            PUBLIC: 'secondary',
        };
        return map[role || 'PUBLIC'] || 'secondary';
    };

    const handleDelete = async () => {
        if (!selected) return;
        setDeleting(true);
        try {
            const res = await fetch('/api/chat', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selected.id }),
            });
            const data = await res.json();
            if (data.status) {
                toast.success(t('session.deleted'));
                fetchSessions();
                setModal(null);
                setSelected(null);
            } else toast.error(data.message || t('session.deleteError'));
        } catch { toast.error(t('session.deleteError')); }
        finally { setDeleting(false); }
    };

    const handleBulkDelete = async () => {
        if (bulkSelected.length === 0) return;
        setDeleting(true);
        try {
            const res = await fetch('/api/chat', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: bulkSelected.map(s => s.id) }),
            });
            const data = await res.json();
            if (data.status) {
                toast.success(t('session.bulkDeleted', { count: bulkSelected.length }));
                fetchSessions();
                setModal(null);
                setBulkSelected([]);
            } else toast.error(data.message || t('session.deleteBulkError'));
        } catch { toast.error(t('session.deleteBulkError')); }
        finally { setDeleting(false); }
    };

    const columns: Column<ChatSession>[] = React.useMemo(() => [
        {
            id: 'user',
            accessorFn: (row) => `${row.user?.fullname || ''} ${row.user?.email || ''} ${row.role || 'PUBLIC'} ${row.locale}`,
            header: t('session.user'),
            cell: ({ row: { original: session } }) => {
                const isActive = !session.is_closed;
                return (
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center shadow-sm",
                                isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-[#002B5B] text-white"
                            )}>
                                {isActive ? <Activity size={16} /> : <Bot size={18} />}
                            </div>
                            {isActive && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white shadow-sm animate-pulse" />
                            )}
                        </div>
                        <div>
                            {session.user ? (
                                <div className="flex flex-col mb-1.5">
                                    <span className="text-xs font-bold text-slate-800 leading-tight">
                                        {session.user.fullname || 'No Name'}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium leading-none">
                                        {session.user.email}
                                    </span>
                                </div>
                            ) : null}
                            <Badge variant={roleVariant(session.role)} className="h-4 px-1.5 text-[8px] uppercase font-bold mb-0.5">
                                {t(`roles.${session.role || 'PUBLIC'}`)}
                            </Badge>
                            <div className="flex items-center gap-1">
                                <Globe size={10} className="text-slate-300" />
                                <span className="text-[9px] font-bold uppercase text-slate-400">{session.locale}</span>
                            </div>
                        </div>
                    </div>
                );
            }
        },
        {
            id: 'content',
            accessorFn: (row) => row.messages?.find(m => m.role === 'user')?.content || '',
            header: t('report.summary'),
            cell: ({ row: { original: session } }) => {
                const firstUserMsg = session.messages?.find(m => m.role === 'user')?.content;
                return (
                    <div className="max-w-md">
                        <p className="text-xs font-semibold text-slate-700 line-clamp-1">
                            {firstUserMsg || <span className="italic text-slate-300 font-normal">{t('session.noUserMessages')}</span>}
                        </p>
                    </div>
                );
            }
        },
        {
            id: 'messages',
            accessorFn: (row) => row.messages?.length || 0,
            header: t('report.stats.avgMessages'),
            cell: ({ row }) => (
                <div className="text-center">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded-lg text-slate-600 font-bold text-[10px]">
                        <MessageCircle size={12} />
                        {row.original.messages?.length || 0}
                    </div>
                </div>
            )
        },
        {
            accessorKey: 'is_closed',
            header: t('report.stats.satisfaction'),
            cell: ({ row: { original: session } }) => (
                <Badge variant={!session.is_closed ? "success" : "secondary"} className="h-4.5 px-2 text-[9px] uppercase font-bold">
                    {!session.is_closed ? t('session.active') : t('session.closed')}
                </Badge>
            )
        },
        {
            accessorKey: 'created_at',
            header: tc('date'),
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-700">{format(new Date(row.original.created_at), 'MMM d, HH:mm')}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">{format(new Date(row.original.created_at), 'yyyy')}</span>
                </div>
            )
        },
        {
            id: 'actions',
            header: tc('actions'),
            cell: ({ row: { original: session } }) => (
                <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        onClick={() => { setSelected(session); setModal('view'); }} title={tc('view')}>
                        <FileText size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        onClick={() => { setSelected(session); setModal('delete'); }} title={tc('delete')}>
                        <Trash2 size={14} />
                    </Button>
                </div>
            )
        }
    ], [t, tc]);

    const bulkActions: BulkAction<ChatSession>[] = [{
        label: tc('deleteSelected'), icon: <Trash2 size={14} />, variant: 'danger',
        onClick: (rows) => {
            setBulkSelected(rows);
            setModal('bulk-delete');
        },
    }];

    const satisfactionVariant = (s: string): any => {
        const map: Record<string, string> = {
            POOR: 'error',
            FAIR: 'warning',
            GOOD: 'primary',
            EXCELLENT: 'success',
        };
        return map[s] || 'secondary';
    };

    const severityVariant = (s: string): any => {
        const map: Record<string, string> = {
            LOW: 'primary',
            MEDIUM: 'warning',
            HIGH: 'error',
        };
        return map[s] || 'secondary';
    };



    if (authLoading || loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                <Typography variant="label">{tc('loading')}</Typography>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <MessageCircle size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle', { total, time: format(lastUpdated, 'HH:mm:ss') })}
                            </Typography>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <Button
                                variant="outline"
                                onClick={() => setIsPolling(p => !p)}
                                className={cn(
                                    "h-10 px-6 border flex-1 md:flex-none font-semibold text-sm",
                                    isPolling ? "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
                                )}
                            >
                                <div className={cn("w-2 h-2 rounded-full me-2", isPolling ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                                <span className="uppercase">{isPolling ? t('live') : t('paused')}</span>
                            </Button>

                            <Button variant="outline" size="icon" onClick={() => fetchSessions()} className="h-10 w-10 shrink-0 border-slate-100">
                                <RefreshCw size={18} className={cn("text-slate-500", loading && "animate-spin")} />
                            </Button>

                            <ListGridToggle
                                viewMode={viewMode}
                                setViewMode={setViewMode}
                                className="hidden md:flex"
                            />
                        </div>

                        <Button
                            onClick={handleGenerateReport}
                            disabled={generatingReport || sessions.length === 0}
                            className="w-full md:w-auto h-10 px-6 shadow-lg shadow-blue-900/10 bg-[#002B5B] font-semibold text-sm uppercase"
                        >
                            {generatingReport ? <Loader2 className="w-4.5 h-4.5 animate-spin me-2" /> : <Sparkles className="w-4.5 h-4.5 me-2" />}
                            {t('generateReport')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* AI Report Panel */}
            <AnimatePresence>
                {showReport && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-linear-to-br from-blue-50/50 to-indigo-50/50 rounded-2xl border border-blue-100 p-4 space-y-4 shadow-inner"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-blue-100 text-blue-600">
                                    <Sparkles size={16} />
                                </div>
                                <Typography variant="h3" className="text-sm font-semibold">{t('report.title')}</Typography>
                            </div>
                            <Button variant="ghost" onClick={() => setShowReport(false)} className="text-slate-400 hover:text-slate-900 font-bold text-[10px] uppercase">
                                {t('report.close')}
                            </Button>
                        </div>

                        {generatingReport ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
                                <Typography variant="large" className="text-slate-600 font-bold">{t('report.analyzing', { count: sessions.length })}</Typography>
                            </div>
                        ) : report ? (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left Column: Summary & Stats */}
                                <div className="lg:col-span-4 space-y-8">
                                    <div className="grid grid-cols-2 gap-3">
                                        <Card className="border-blue-50 shadow-blue-900/5">
                                            <CardContent className="p-3">
                                                <Typography variant="label" color="secondary" className="font-bold text-[9px] mb-1 uppercase">{t('report.stats.sessions')}</Typography>
                                                <Typography variant="h3" className="text-slate-900 text-lg font-bold">{report.totalSessions}</Typography>
                                            </CardContent>
                                        </Card>
                                        <Card className="border-blue-50 shadow-blue-900/5">
                                            <CardContent className="p-3">
                                                <Typography variant="label" color="secondary" className="font-bold text-[9px] mb-1 uppercase">{t('report.stats.avgMessages')}</Typography>
                                                <Typography variant="h3" className="text-slate-900 text-lg font-bold">{report.avgMessagesPerSession}</Typography>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card className="border-blue-50 shadow-blue-900/5">
                                        <CardContent className="p-4 space-y-3">
                                            <Typography variant="label" color="secondary" className="font-semibold text-xs">{t('report.stats.satisfaction')}</Typography>
                                            <Badge variant={satisfactionVariant(report.userSatisfaction)} size="lg" className="w-full justify-center h-10 text-xs font-semibold">
                                                {t(`report.satisfaction.${report.userSatisfaction}`)}
                                            </Badge>
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-white/80 backdrop-blur-xl border-white shadow-sm">
                                        <CardContent className="p-4 space-y-2.5">
                                            <Typography variant="small" color="secondary" className="font-bold uppercase text-[10px] flex items-center gap-2">
                                                <FileText size={12} /> {t('report.summary')}
                                            </Typography>
                                            <Typography variant="p" className="text-slate-700 leading-relaxed italic text-xs font-medium">
                                                "{report.summary}"
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Right Column: Topics & Issues */}
                                <div className="lg:col-span-8 space-y-8">
                                    {report.topTopics?.length > 0 && (
                                        <Card className="border-slate-100 shadow-sm">
                                            <CardHeader className="p-3 pb-0">
                                                <CardTitle className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 uppercase">
                                                    <TrendingUp size={12} /> {t('report.topTopics')}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-3 space-y-2.5">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {report.topTopics.map((topic, i) => (
                                                        <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 group hover:bg-white hover:shadow-lg hover:shadow-blue-900/5 transition-all">
                                                            <div className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center font-bold text-blue-600 text-[9px] shrink-0 border border-slate-50">
                                                                {topic.count}x
                                                            </div>
                                                            <div className="min-w-0">
                                                                <Typography variant="large" className="text-[11px] text-white block font-bold">{topic.topic}</Typography>
                                                                <Typography variant="p" className="text-[10px] mt-0.5 text-slate-500 line-clamp-1 leading-tight">{topic.insight}</Typography>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {report.issues?.length > 0 && (
                                        <div className="space-y-3">
                                            <Typography variant="label" color="secondary" className="px-2 font-semibold flex items-center gap-2">
                                                <AlertTriangle size={14} /> {t('report.issues')} & {t('report.improvements')}
                                            </Typography>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {report.issues.map((issue, i) => (
                                                    <div key={i} className={cn("rounded-xl p-3 border flex flex-col gap-2",
                                                        issue.severity === 'HIGH' ? "bg-red-50/50 border-red-100" :
                                                            issue.severity === 'MEDIUM' ? "bg-amber-50/50 border-amber-100" :
                                                                "bg-blue-50/50 border-blue-100")}>
                                                        <div className="flex items-center justify-between">
                                                            <Badge variant={severityVariant(issue.severity)} className="h-4 text-[8px] font-bold uppercase">{t(`report.severity.${issue.severity}`)}</Badge>
                                                            <AlertTriangle size={10} className={cn(
                                                                issue.severity === 'HIGH' ? "text-red-500" :
                                                                    issue.severity === 'MEDIUM' ? "text-amber-500" :
                                                                        "text-blue-500"
                                                            )} />
                                                        </div>
                                                        <Typography variant="large" className="text-[10px] font-bold text-slate-900 uppercase">{issue.issue}</Typography>
                                                        <div className="flex items-start gap-2 bg-white/60 p-2 rounded-lg border border-white">
                                                            <Lightbulb size={10} className="text-emerald-500 shrink-0 mt-0.5" />
                                                            <Typography variant="p" className="text-[9px] text-slate-600 font-bold leading-relaxed">{issue.suggestion}</Typography>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-10">
                                <Typography variant="p" color="secondary">{t('report.failed')}</Typography>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sessions Table */}
            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {sessions?.map((s: ChatSession) => (
                        <CustomCard 
                            key={s.id} 
                            title={`Session #${s.session_id.slice(0,8)}`} 
                            subtitle={s.messages?.find(m => m.role === 'user')?.content || t('session.noUserMessages')} 
                            badge={{ text: !s.is_closed ? t('session.active') : t('session.closed'), variant: !s.is_closed ? 'default' : 'secondary' }}
                            stats={[
                                { label: t('report.stats.avgMessages'), value: s.messages?.length || 0 }
                            ]}  
                            actionLabel={tc('details')}
                            onAction={() => { setSelected(s); setModal('view'); }}
                            highlight={!s.is_closed}
                            icon={!s.is_closed ? <Activity size={20} /> : <Bot size={20} />}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                    columns={columns}
                    data={sessions}
                    searchable
                    searchPlaceholder={tc('table.searchPlaceholder')}
                    bulkActions={bulkActions}
                    emptyMessage={t('empty.title')}
                    pageSize={10}
                />
                </div>
            )}







            {/* View Session Modal */}
            <Modal isOpen={modal === 'view'} onClose={() => { setModal(null); setSelected(null); }}
                title={t('session.title') || 'Conversation Details'} size="4xl">
                {selected && (
                    <div className="space-y-8">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-3">
                                <Badge variant={roleVariant(selected.role)} className="h-7 px-3 text-[10px] font-bold uppercase">
                                    {t(`roles.${selected.role || 'PUBLIC'}`)}
                                </Badge>
                                <Typography variant="small" className="font-mono text-slate-300 text-[10px]">#{selected.session_id}</Typography>
                            </div>
                            <Badge variant={!selected.is_closed ? "success" : "secondary"} className="h-7 px-3 gap-1.5 rounded-xl">
                                {!selected.is_closed ? <RefreshCw size={10} className="animate-spin" /> : <Clock size={10} />}
                                <span className="uppercase font-bold text-[9px]">
                                    {!selected.is_closed ? t('session.liveUpdates', { time: format(lastUpdated, 'HH:mm:ss') }) : t('session.sessionClosed')}
                                </span>
                            </Badge>
                        </div>

                        <div className="space-y-6 max-h-[600px] overflow-y-auto px-2 custom-scrollbar">
                            {selected.messages?.length === 0 ? (
                                <div className="py-20 text-center text-slate-300 italic">{t('session.noMessages')}</div>
                            ) : (
                                selected.messages?.map((msg, i) => (
                                    <div key={i} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse text-right" : "flex-row")}>
                                        <div className={cn(
                                            "w-9 h-9 rounded-xl flex shrink-0 items-center justify-center shadow-sm",
                                            msg.role === 'assistant' ? "bg-linear-to-br from-[#002B5B] to-blue-600 text-white" : "bg-white border border-slate-200 text-slate-400"
                                        )}>
                                            {msg.role === 'assistant' ? <Bot size={18} /> : <UserIcon size={18} />}
                                        </div>
                                        <div className={cn(
                                            "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border transition-all",
                                            msg.role === 'assistant'
                                                ? "bg-white text-slate-800 border-slate-100 rounded-ss-sm"
                                                : "bg-[#002B5B] text-white border-[#002B5B] rounded-se-sm shadow-blue-900/10"
                                        )}>
                                            <Typography variant="p" color={msg.role === 'assistant' ? 'default' : 'white'} className="text-xs font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</Typography>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex justify-center pt-6">
                            <Button variant="outline" onClick={() => { setModal(null); setSelected(null); }} className="h-10 px-8 rounded-xl font-bold uppercase text-[10px]">
                                {tc('close')}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Confirm Deletion Modals */}
            <ConfirmModal
                isOpen={modal === 'delete'}
                onClose={() => { setModal(null); setSelected(null); }}
                onConfirm={handleDelete}
                title={tc('delete')}
                description={tc('confirmDelete', { name: selected?.session_id?.slice(0, 8) || '' })}
                confirmLabel={tc('delete')}
                confirmVariant="danger"
                loading={deleting}
                icon={<Trash2 size={24} className="text-red-500" />}
            />

            <ConfirmModal
                isOpen={modal === 'bulk-delete'}
                onClose={() => { setModal(null); setBulkSelected([]); }}
                onConfirm={handleBulkDelete}
                title={tc('deleteSelected')}
                description={tc('confirmBulkDelete', { count: bulkSelected.length })}
                confirmLabel={tc('delete')}
                confirmVariant="danger"
                loading={deleting}
                icon={<Trash2 size={24} className="text-red-500" />}
            />
        </div>
    );
}
