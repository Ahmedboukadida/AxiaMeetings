'use client';

import { CustomCard } from '@/components/ui/custom-card';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Log, ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { BarChart3, Clock, User as UserIcon, Building2, Info, Sparkles, RefreshCw, AlertTriangle, TrendingUp, Shield, Zap, ChevronRight, Activity , LayoutGrid, List as ListIcon} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { AITimerInline } from '@/components/ui/AITimer';
import { useTranslations } from 'next-intl';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { Trash2, Trash, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

export default function LogsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('Dashboard.logs');
    const tc = useTranslations('Common');
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<any>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [modal, setModal] = useState<'delete' | 'bulk-delete' | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [logToDelete, setLogToDelete] = useState<Log | null>(null);
    const [bulkSelected, setBulkSelected] = useState<Log[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/logs?limit=500&offset=0');
            const result: ApiResponse<Log[]> & { pagination: any } = await res.json();
            if (result.status && result.data) setLogs(result.data);
        } catch { toast.error(tc('error')); }
        finally { setIsLoading(false); }
    };

    const handleAiAnalyze = async () => {
        setAiLoading(true);
        try {
            const res = await fetch('/api/logs/ai-analyze', { method: 'POST' });
            const result = await res.json();
            if (result.status) {
                setAiAnalysis(result.data);
                toast.success(tc('success'));
            } else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setAiLoading(false); }
    };

    useEffect(() => {
        if (user?.role === UserRole.DEVELOPER) fetchLogs();
    }, [user]);

    const handleDelete = async () => {
        if (!logToDelete) return;
        setSaving(true);
        try {
            const res = await fetch('/api/logs', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: logToDelete.id }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                fetchLogs();
                setModal(null);
                setLogToDelete(null);
            } else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        if (bulkSelected.length === 0) return;
        setSaving(true);
        try {
            const res = await fetch('/api/logs', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: bulkSelected.map(l => l.id) }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                fetchLogs();
                setModal(null);
                setBulkSelected([]);
            } else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const riskVariant = (level: string): any => {
        const map: Record<string, string> = {
            LOW: 'success',
            MEDIUM: 'warning',
            HIGH: 'error',
            CRITICAL: 'destructive',
        };
        return map[level] || 'secondary';
    };

    const severityIcon = (s: string) => {
        if (s === 'HIGH') return <AlertTriangle size={14} className="text-red-500" />;
        if (s === 'MEDIUM') return <AlertTriangle size={14} className="text-amber-500" />;
        return <Info size={14} className="text-blue-500" />;
    };

    const columns: Column<Log>[] = React.useMemo(() => [
        {
            id: 'timestamp',
            accessorKey: 'timestamp',
            header: tc('date'),
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-xs text-slate-900 font-bold">
                        <Clock size={10} className="text-[#002B5B]" />
                        {format(new Date(row.original.timestamp), 'HH:mm:ss')}
                    </div>
                    <Typography variant="small" color="secondary" className="text-[9px] uppercase font-bold">{format(new Date(row.original.timestamp), 'MMM dd, yyyy')}</Typography>
                </div>
            ),
        },
        {
            accessorKey: 'message',
            header: tc('description'),
            cell: ({ row }) => <Typography variant="large" className="text-slate-900 font-medium text-xs leading-tight">{row.original.message}</Typography>,
        },
        {
            id: 'user',
            accessorFn: (row) => `${row.user?.username || t('system')} ${row.company?.name || tc('global')}`,
            header: tc('user'),
            cell: ({ row }) => (
                <div className="flex flex-col gap-0.5">
                    <Typography variant="large" className="text-slate-900 font-bold text-xs leading-none">{row.original.user?.username || t('system')}</Typography>
                    <Typography variant="small" color="secondary" className="text-[9px] uppercase font-bold mt-0.5">{row.original.company?.name || tc('global')}</Typography>
                </div>
            ),
        },
        {
            id: 'actions',
            header: tc('actions'),
            enableSorting: false,
            cell: ({ row }) => (
                <div className="flex items-center gap-1 justify-end">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedLog(row.original)}
                        className={cn(
                            "h-7 w-7 rounded-lg transition-all text-slate-300 hover:text-blue-500 hover:bg-blue-50",
                            selectedLog?.id === row.original.id && "bg-blue-500 text-white shadow-lg"
                        )}
                        title={tc('view')}
                    >
                        <ChevronRight size={14} className="rtl:rotate-180" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setLogToDelete(row.original); setModal('delete'); }}
                        className="h-7 w-7 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
                        title={tc('delete')}
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>
            ),
        },
    ], [tc, selectedLog?.id]);

    const bulkActions: BulkAction<Log>[] = [{
        label: tc('deleteSelected'), icon: <Trash2 size={14} />, variant: 'danger',
        onClick: (rows) => {
            setBulkSelected(rows);
            setModal('bulk-delete');
        },
    }];

    if (authLoading) return null;

    return (
        <div className="space-y-8 pb-20">
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0">
                            <Activity size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase leading-relaxed">
                                {t('subtitle')}
                            </Typography>
                        </div>
                    </div>

                    <Button
                        onClick={handleAiAnalyze}
                        disabled={aiLoading || isLoading}
                        className="w-full md:w-auto h-10 px-6 shadow-lg shadow-violet-900/10 bg-linear-to-r from-[#002B5B] to-blue-600 border-none font-semibold text-sm uppercase"
                    >
                        {aiLoading ? <RefreshCw size={18} className="animate-spin me-2" /> : <Sparkles size={18} className="me-2 rtl:rotate-90" />}
                        {aiLoading ? t('analyzing') : t('analyze')}
                        <AITimerInline isLoading={aiLoading} className="ms-2" />
                    </Button>
                </div>
            </div>

            {/* AI Analysis Panel */}
            <AnimatePresence>
                {aiAnalysis && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-linear-to-br from-violet-50/50 to-blue-50/50 rounded-2xl border border-violet-100 p-4 space-y-4 shadow-inner"
                    >
                        <div className="flex flex-col md:flex-row items-center justify-between gap-5">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center shadow-sm border border-violet-100 text-violet-600">
                                    <Sparkles size={16} />
                                </div>
                                <div>
                                    <Typography variant="h3" className="text-slate-900 text-[13px] font-bold uppercase">{t('report')}</Typography>
                                    <Typography variant="small" color="secondary" className="font-mono text-[9px] font-bold">{aiAnalysis.timespan}</Typography>
                                </div>
                            </div>
                            <Badge variant={riskVariant(aiAnalysis.riskLevel)} size="lg" className="h-7 px-3 text-xs font-semibold uppercase">
                                {t('risk', { level: aiAnalysis.riskLevel })}
                            </Badge>
                        </div>

                        <div className="bg-white/80 backdrop-blur-xl p-4 rounded-xl border border-white shadow-sm">
                            <Typography variant="p" className="text-slate-700 leading-relaxed italic text-xs font-medium">
                                "{aiAnalysis.summary}"
                            </Typography>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            {/* Anomalies */}
                            {aiAnalysis.anomalies?.length > 0 && (
                                <Card variant="default" className="border-red-100 bg-red-50/20 rounded-xl">
                                    <CardHeader className="p-3 pb-2">
                                        <CardTitle className="text-[10px] font-semibold text-red-600 flex items-center gap-1.5 uppercase">
                                            <AlertTriangle size={12} /> {t('anomalies')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-2.5">
                                        {aiAnalysis.anomalies.map((a: any, i: number) => (
                                            <div key={i} className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-red-50 shadow-xs">
                                                <div className="mt-0.5">{severityIcon(a.severity)}</div>
                                                <div>
                                                    <Typography variant="large" className="text-xs font-semibold text-slate-900">{a.type}</Typography>
                                                    <Typography variant="p" className="text-[10px] mt-0.5 text-slate-500 leading-tight">{a.description}</Typography>
                                                </div>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Top Activities */}
                            {aiAnalysis.topActivities?.length > 0 && (
                                <Card variant="default" className="border-blue-100 bg-blue-50/20 rounded-xl">
                                    <CardHeader className="p-3 pb-2">
                                        <CardTitle className="text-[10px] font-semibold text-blue-600 flex items-center gap-1.5 uppercase">
                                            <TrendingUp size={12} /> {t('activities')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-2.5">
                                        {aiAnalysis.topActivities.map((a: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-blue-50 shadow-xs">
                                                <Badge variant="primary" size="sm" className="h-4 w-4 rounded-full p-0 flex items-center justify-center shrink-0 text-[9px]">{i + 1}</Badge>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <Typography variant="large" className="text-xs font-semibold text-slate-900 truncate">{a.activity}</Typography>
                                                        <Badge variant="outline" className="text-[9px] h-3.5 px-1">{a.count}</Badge>
                                                    </div>
                                                    <Typography variant="p" className="text-[10px] mt-0.5 text-slate-500 truncate leading-tight">{a.insight}</Typography>
                                                </div>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Recommendations */}
                            {aiAnalysis.recommendations?.length > 0 && (
                                <Card variant="default" className="border-emerald-100 bg-emerald-50/20 rounded-xl">
                                    <CardHeader className="p-3 pb-2">
                                        <CardTitle className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1.5 uppercase">
                                            <Shield size={12} /> {t('recommendations')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-0 space-y-2">
                                        {aiAnalysis.recommendations.map((r: string, i: number) => (
                                            <div key={i} className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-emerald-50 shadow-xs">
                                                <Zap size={10} className="text-emerald-500 shrink-0 mt-0.5" />
                                                <Typography variant="p" className="text-[10px] text-slate-700 font-medium leading-relaxed">{r}</Typography>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* Companies Insight */}
                        {aiAnalysis.companiesInsight?.length > 0 && (
                            <div className="space-y-4">
                                <Typography variant="label" color="secondary" className="flex items-center gap-2">
                                    <Building2 size={16} /> {t('companyInsights')}
                                </Typography>
                                <div className="flex flex-wrap gap-2">
                                    {aiAnalysis.companiesInsight.map((c: any, i: number) => (
                                        <Badge
                                            key={i}
                                            variant={c.status === 'SUSPICIOUS' ? 'error' : c.status === 'INACTIVE' ? 'secondary' : 'primary'}
                                            className="h-7 px-3 gap-1.5 font-semibold text-[10px] uppercase"
                                        >
                                            {c.company}
                                            <span className="opacity-50 text-[10px] font-bold border-s border-white/20 ps-1.5">{c.activityCount}</span>
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Table Area */}
                <div className="lg:col-span-12 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4">
                    
            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {logs?.map((l: any) => (
                        <CustomCard 
                            key={l.id} 
                            title={l.action} 
                            subtitle={l.details || tc('noData')} 
                            badge={{ text: l.status || "INFO", variant: l.status === "ERROR" ? "destructive" : "default" }} 
                            stats={[
                                {label: tc('user'), value: l.user?.username || t('system')},
                                {label: tc('company'), value: l.company?.name || tc('global')}
                            ]} 
                            actionLabel={tc('view')}
                            onAction={() => setSelectedLog(l)}
                            icon={<Activity size={20} />}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                        columns={columns}
                        data={logs}
                        searchable
                        searchPlaceholder={tc('search')}
                        bulkActions={bulkActions}
                        emptyMessage={tc('noData')}
                        pageSize={10}
                    />
                </div>
            )}
                </div>
            </div>

            {/* Detail Modal */}
            <Modal
                isOpen={!!selectedLog}
                onClose={() => setSelectedLog(null)}
                title={tc('details')}
                description={t('subtitle')}
                size="4xl"
            >
                {selectedLog && (
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-[#002B5B] shrink-0 border border-slate-50">
                                    <UserIcon size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <Typography variant="label" className="text-[9px] text-slate-400 font-bold uppercase">{tc('user')}</Typography>
                                    <Typography variant="large" className="mt-0.5 text-xs font-bold leading-tight">{selectedLog.user?.fullname || selectedLog.user?.username || t('system')}</Typography>
                                    <Badge variant="secondary" size="sm" className="mt-1.5 text-[8px] uppercase font-bold">{selectedLog.user?.role || 'SYSTEM'}</Badge>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-blue-600 shrink-0 border border-slate-50">
                                    <Building2 size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <Typography variant="label" className="text-[9px] text-slate-400 font-bold uppercase">{tc('company')}</Typography>
                                    <Typography variant="large" className="mt-0.5 text-xs font-bold leading-tight">{selectedLog.company?.name || `${t('system')} / ${tc('global')}`}</Typography>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center text-emerald-600 shrink-0 border border-slate-50">
                                    <Clock size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <Typography variant="label" className="text-[9px] text-slate-400 font-bold uppercase">{tc('date')}</Typography>
                                    <Typography variant="large" className="mt-0.5 text-xs font-bold leading-tight">{format(new Date(selectedLog.timestamp), 'yyyy-MM-dd HH:mm:ss')}</Typography>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Typography variant="label" color="secondary" className="px-1 text-[10px] font-bold uppercase">{tc('description')}</Typography>
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <Typography variant="p" className="text-xs text-slate-700 font-medium leading-relaxed italic">
                                    "{selectedLog.message}"
                                </Typography>
                            </div>
                        </div>

                        {(selectedLog.payload || selectedLog.response) && (
                            <div className="space-y-6 pt-4 border-t border-slate-50">
                                {selectedLog.payload && (
                                    <div className="space-y-2">
                                        <Typography variant="label" color="secondary" className="px-1 font-semibold text-xs">{t('detail.payload')}</Typography>
                                        <pre className="bg-[#001a36] text-blue-300 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 custom-scrollbar shadow-inner">
                                            {JSON.stringify(selectedLog.payload, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                {selectedLog.response && (
                                    <div className="space-y-2">
                                        <Typography variant="label" color="secondary" className="px-1 font-semibold text-xs">{t('detail.response')}</Typography>
                                        <pre className="bg-[#001a36] text-emerald-300 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 custom-scrollbar shadow-inner">
                                            {JSON.stringify(selectedLog.response, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setSelectedLog(null)}
                                className="px-6 h-9 rounded-lg text-[9px] font-bold uppercase"
                            >
                                {tc('close')}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={modal === 'delete'}
                onClose={() => setModal(null)}
                onConfirm={handleDelete}
                title={tc('delete')}
                description={tc('confirmDelete')}
                confirmLabel={tc('delete')}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />

            <ConfirmModal
                isOpen={modal === 'bulk-delete'}
                onClose={() => setModal(null)}
                onConfirm={handleBulkDelete}
                title={tc('deleteSelected')}
                description={tc('confirmBulkDelete', { count: bulkSelected.length })}
                confirmLabel={tc('delete')}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />
        </div>
    );
}


