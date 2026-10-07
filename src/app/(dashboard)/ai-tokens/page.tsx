'use client';

import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { CustomCard } from '@/components/ui/custom-card';
import { LayoutGrid, List as ListIcon } from 'lucide-react';


import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
    Sparkles, Plus, Pencil, Trash2,
    RefreshCw, Eye, Clock, AlertTriangle,
    MessageSquare, FileText, Zap, Scale, ListTodo, Search, HelpCircle, Activity, Globe, Shield, Calendar, BarChart3, Cpu
} from 'lucide-react';
import { format } from 'date-fns';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { ListGridToggle } from '@/components/ui/ListGridToggle';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { Input } from '@/components/ui/inputs';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface TokenStats {
    todayTotal: number;
    todaySuccess: number;
    todayFailed: number;
    remaining: number | null;
    creditLimit: number | null;
    isExhausted: boolean;
    byFeature: Record<string, number>;
}

interface AIToken {
    id: number;
    provider: string | null;
    name: string | null;
    credit_limit: string | null;
    expiration: string | null;
    websocket_url: string | null;
    /** Masked by the API (last 4 chars only); the real key never reaches the browser. */
    api_key: string;
    api_secret_set: boolean;
    project_name: string | null;
    project_number: string | null;
    is_active: boolean;
    created_at: string;
    stats: TokenStats;
}

const emptyForm = {
    provider: 'gemini',
    name: '',
    api_key: '',
    api_secret: '',
    websocket_url: '',
    credit_limit: '',
    expiration: '',
    project_name: '',
    project_number: '',
    is_active: true,
};

const PROVIDERS = [
    { value: 'gemini', label: 'Gemini', color: 'bg-blue-100 text-blue-700', chatOrder: 1, genOrder: 2 },
    { value: 'groq', label: 'Groq', color: 'bg-orange-100 text-orange-700', chatOrder: 2, genOrder: 1 },
    { value: 'openrouter', label: 'OpenRouter', color: 'bg-green-100 text-green-700', chatOrder: 3, genOrder: 3 },
];

export default function AITokensPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('AiTokens');
    const tc = useTranslations('Common');

    const FEATURE_LABELS: Record<string, string> = {
        'chat': t('features.chat'),
        'chat-report': t('features.chat-report'),
        'ai-summary': t('features.ai-summary'),
        'ai-pv': t('features.ai-pv'),
        'polish-text': t('features.polish-text'),
        'suggest-agenda': t('features.suggest-agenda'),
        'log-analyze': t('features.log-analyze'),
        'unknown': t('features.unknown'),
    };

    const FEATURE_ICONS: Record<string, React.ReactNode> = {
        'chat': <MessageSquare size={14} />,
        'chat-report': <FileText size={14} />,
        'ai-summary': <Zap size={14} />,
        'ai-pv': <Scale size={14} />,
        'polish-text': <Sparkles size={14} />,
        'suggest-agenda': <ListTodo size={14} />,
        'log-analyze': <Search size={14} />,
        'unknown': <HelpCircle size={14} />,
    };

    const FEATURE_COLORS: Record<string, string> = {
        'chat': 'bg-blue-50 text-blue-600 border-blue-100',
        'chat-report': 'bg-purple-50 text-purple-600 border-purple-100',
        'ai-summary': 'bg-amber-50 text-amber-600 border-amber-100',
        'ai-pv': 'bg-emerald-50 text-emerald-600 border-emerald-100',
        'polish-text': 'bg-indigo-50 text-indigo-600 border-indigo-100',
        'suggest-agenda': 'bg-rose-50 text-rose-600 border-rose-100',
        'log-analyze': 'bg-cyan-50 text-cyan-600 border-cyan-100',
        'unknown': 'bg-slate-50 text-slate-600 border-slate-100',
    };

    const [tokens, setTokens] = useState<AIToken[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [bulkSelected, setBulkSelected] = useState<AIToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<'add' | 'edit' | 'delete' | 'view-details' | 'bulk-delete' | null>(null);
    const [selected, setSelected] = useState<AIToken | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchTokens = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/ai-tokens');
            const data = await res.json();
            if (data.status) setTokens(data.data);
        } catch { toast.error(t('toast.loadError')); }
        finally { setLoading(false); }
    }, [t]);

    useEffect(() => {
        if (user?.role === UserRole.DEVELOPER) fetchTokens();
    }, [user, fetchTokens]);

    const openAdd = () => { setForm(emptyForm); setSelected(null); setModal('add'); };
    const openEdit = (t: AIToken) => {
        setSelected(t);
        setForm({
            provider: t.provider || 'gemini',
            name: t.name || '',
            // Secrets are write-only: empty field = keep the stored value.
            api_key: '',
            api_secret: '',
            websocket_url: t.websocket_url || '',
            credit_limit: t.credit_limit || '',
            expiration: t.expiration ? t.expiration.slice(0, 10) : '',
            project_name: t.project_name || '',
            project_number: t.project_number || '',
            is_active: t.is_active,
        });
        setModal('edit');
    };
    const openDelete = (t: AIToken) => { setSelected(t); setModal('delete'); };
    const closeModal = () => { setModal(null); setSelected(null); };

    const handleSave = async () => {
        // On edit an empty key keeps the current one; on add it is required.
        if (modal !== 'edit' && !form.api_key.trim()) { toast.error(t('toast.apiKeyRequired')); return; }
        setSaving(true);
        try {
            const isEdit = modal === 'edit' && selected;
            const res = await fetch('/api/ai-tokens', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isEdit ? { id: selected.id, ...form } : form),
            });
            const data = await res.json();
            if (data.status) { toast.success(isEdit ? t('toast.updated') : t('toast.added')); fetchTokens(); closeModal(); }
            else toast.error(data.message || t('toast.saveError'));
        } catch { toast.error(t('toast.saveError')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/ai-tokens', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selected.id }),
            });
            const data = await res.json();
            if (data.status) { toast.success(t('toast.deleted')); fetchTokens(); closeModal(); }
            else toast.error(data.message || t('toast.deleteError'));
        } catch { toast.error(t('toast.deleteError')); }
        finally { setSaving(false); }
    };

    const toggleActive = async (token: AIToken) => {
        try {
            await fetch('/api/ai-tokens', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: token.id, is_active: !token.is_active }),
            });
            fetchTokens();
        } catch { toast.error(t('toast.toggleError')); }
    };

    const providerInfo = (p: string | null) => {
        const clean = p?.toLowerCase().replace(/\s+/g, '');
        return PROVIDERS.find(x => x.value === clean) || { value: p || '?', label: p || 'Unknown', color: 'bg-slate-100 text-slate-600', chatOrder: 99, genOrder: 99 };
    };

    // The API already masks the key ('********abcd'); only restyle the stars.
    const maskKey = (key: string) => (key ? key.replace(/\*/g, '•') : '••••••••');

    const totalToday = tokens.reduce((s, t) => s + t.stats.todayTotal, 0);
    const totalSuccess = tokens.reduce((s, t) => s + t.stats.todaySuccess, 0);
    const activeCount = tokens.filter(t => t.is_active).length;
    const exhaustedCount = tokens.filter(t => t.stats.isExhausted).length;

    if (authLoading || loading) return (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
            <Typography variant="label">{tc('loading')}</Typography>
        </div>
    );

    
    const columns: Column<AIToken>[] = [
        {
            id: 'provider',
            header: t('table.provider'),
            accessorFn: (row) => row.provider?.toLowerCase().trim().replace(/\s+/g, '') ?? '',
            cell: ({ row: { original: token } }) => {
                const pInfo = providerInfo(token.provider);
                return (
                    <Badge variant="outline" className={cn("h-4.5 px-1.5 text-[9px] font-bold uppercase border-transparent shadow-xs", pInfo.color)}>
                        {pInfo.label}
                    </Badge>
                );
            }
        },
        {
            id: 'name',
            header: t('table.name'),
            accessorKey: 'name',
            cell: ({ row: { original: token } }) => {
                const isExpired = token.expiration && new Date(token.expiration) < new Date();
                return (
                    <div className="flex flex-col gap-1">
                        {token.name ? (
                            <Typography variant="large" className="text-slate-900 font-semibold text-xs">{token.name}</Typography>
                        ) : (
                            <Typography variant="p" color="secondary" className="text-slate-300">—</Typography>
                        )}
                        <div className="flex items-center gap-2">
                            {isExpired ? (
                                <Badge variant="destructive" size="sm" className="h-3.5 px-1.5 gap-1 text-[8px] uppercase font-bold">
                                    <AlertTriangle size={8} /> {t('provider.expired')}
                                </Badge>
                            ) : token.expiration && (
                                <div className="flex items-center gap-1 text-slate-400">
                                    <Calendar size={10} />
                                    <span className="text-[9px] font-bold">{format(new Date(token.expiration), 'MMM d, yyyy')}</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            }
        },
        {
            id: 'apiKey',
            header: t('table.apiKey'),
            accessorKey: 'api_key',
            cell: ({ row: { original: token } }) => (
                <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 w-fit">
                    <Typography variant="small" className="font-mono text-slate-500 text-[10px]">
                        {maskKey(token.api_key)}
                    </Typography>
                </div>
            )
        },
        {
            id: 'todayUsed',
            header: t('table.todayUsed'),
            accessorFn: (row) => row.stats.todayTotal,
            cell: ({ row: { original: token } }) => {
                const { todayTotal, creditLimit, isExhausted } = token.stats;
                const usedPct = creditLimit && creditLimit > 0 ? Math.min(100, Math.round((todayTotal / creditLimit) * 100)) : null;
                return (
                    <div className="flex flex-col items-center gap-1">
                        <Typography variant="h4" className={cn("text-sm font-bold", isExhausted ? "text-red-600" : "text-slate-900")}>{todayTotal}</Typography>
                        {creditLimit && (
                            <div className="w-16 space-y-0.5">
                                <div className="h-0.5 bg-slate-100 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${usedPct}%` }}
                                        className={cn("h-full rounded-full", usedPct! >= 100 ? "bg-red-500" : usedPct! >= 80 ? "bg-amber-500" : "bg-emerald-500")}
                                    />
                                </div>
                                <Typography variant="small" color="secondary" className="text-[9px] font-medium">
                                    {tc('of')} {creditLimit}
                                </Typography>
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            id: 'remaining',
            header: t('table.remaining'),
            accessorFn: (row) => row.stats.remaining ?? -1,
            cell: ({ row: { original: token } }) => {
                const { remaining, creditLimit, isExhausted } = token.stats;
                return remaining !== null ? (
                    <div className="flex flex-col items-center">
                        <Typography variant="h4" className={cn("text-sm font-bold", remaining === 0 ? "text-red-600" : remaining < (creditLimit! * 0.2) ? "text-amber-600" : "text-emerald-600")}>
                            {remaining}
                        </Typography>
                        {isExhausted && <Typography variant="small" className="text-red-500 font-bold leading-none mt-0.5 text-[9px] uppercase">{t('provider.resetsAt')}</Typography>}
                    </div>
                ) : (
                    <Typography variant="p" color="secondary" className="text-slate-300">—</Typography>
                );
            }
        },
        {
            id: 'status',
            header: t('table.status'),
            cell: ({ row: { original: token } }) => (
                <div className="flex justify-center">
                    <button
                        onClick={() => toggleActive(token)}
                        className={cn(
                            "relative inline-flex h-4.5 w-8 items-center rounded-full transition-all duration-300",
                            token.is_active ? "bg-emerald-500" : "bg-slate-200"
                        )}
                    >
                        <motion.span
                            animate={{ x: token.is_active ? 18 : 3 }}
                            className="inline-block h-3 w-3 rounded-full bg-white shadow-sm"
                        />
                    </button>
                </div>
            )
        },
        {
            id: 'actions',
            header: tc('actions'),
            cell: ({ row: { original: token } }) => (
                <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setSelected(token); setModal('view-details'); }} className="h-7 w-7 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><Eye size={14} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(token)} className="h-7 w-7 text-amber-500 hover:bg-amber-50 rounded-lg transition-all"><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openDelete(token)} className="h-7 w-7 text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></Button>
                </div>
            )
        }
    ];

    const bulkActions: BulkAction<AIToken>[] = [{
        label: tc('delete'), icon: <Trash2 size={12} />, variant: 'danger',
        onClick: (rows) => { setBulkSelected(rows); setModal('bulk-delete'); },
    }];

    return (
        <div className="space-y-8 pb-20">
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Cpu size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle')}
                            </Typography>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={fetchTokens} className="h-10 w-10 shrink-0 border-slate-100">
                            <RefreshCw size={18} className={cn("text-slate-500", loading && "animate-spin")} />
                        </Button>

                        <ListGridToggle
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            className="w-full md:w-auto mt-4 md:mt-0 ltr:mr-4 rtl:ml-4"
                        />

                        <Button
                            onClick={openAdd}
                            className="flex-1 md:flex-none h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm"
                        >
                            <Plus size={18} className="me-2 rtl:rotate-90" /> {t('add')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                    { label: t('stats.activeKeys'), value: `${activeCount} / ${tokens.length}`, color: 'text-[#002B5B]', icon: Shield },
                    { label: t('stats.todayCalls'), value: totalToday.toString(), color: 'text-blue-600', icon: Activity },
                    { label: t('stats.successRate'), value: totalToday > 0 ? `${Math.round((totalSuccess / totalToday) * 100)}%` : '—', color: 'text-emerald-600', icon: BarChart3 },
                    { label: t('stats.exhaustedToday'), value: exhaustedCount.toString(), color: exhaustedCount > 0 ? 'text-red-600' : 'text-slate-400', icon: AlertTriangle },
                ].map((s, i) => (
                    <Card key={i} className="rounded-2xl border-slate-100 shadow-blue-900/5 overflow-hidden">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <Typography variant="label" color="secondary" className="font-semibold text-[10px] uppercase">{s.label}</Typography>
                                <s.icon size={12} className="text-slate-200" />
                            </div>
                            <Typography variant="h2" className={cn("text-xl font-bold", s.color)}>{s.value}</Typography>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Tokens Table/Grid */}
            {tokens.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-16 text-center">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
                        <Sparkles size={24} className="md:w-8 md:h-8" />
                    </div>
                    <Typography variant="h3" className="text-slate-400 mb-2">{t('empty.title')}</Typography>
                    <Typography variant="p" color="secondary" className="mb-6">{t('empty.subtitle')}</Typography>
                    <Button onClick={openAdd} variant="primary" className="h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm">
                        {t('add')}
                    </Button>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {tokens.map(token => (
                        <CustomCard
                            key={token.id}
                            title={token.name || token.provider || 'Token'}
                            subtitle={`Key: ${maskKey(token.api_key)}`}
                            badge={{ text: token.is_active ? t('form.activeLabel') : tc('inactive'), variant: token.is_active ? 'default' : 'secondary' }}
                            stats={[
                                { label: t('table.todayUsed'), value: token.stats.todayTotal },
                                { label: t('table.success'), value: token.stats.todaySuccess }
                            ]}
                            actionLabel={tc('details')}
                            onAction={() => { setSelected(token); setModal('view-details'); }}
                            highlight={token.is_active}
                            icon={<Shield size={20} />}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                        columns={columns}
                        data={tokens}
                        searchable
                        searchPlaceholder={tc('search')}
                        bulkActions={bulkActions}
                        emptyMessage={t('empty.title')}
                        pagesize={10}
                    />
                </div>
            )}

            {/* Add/Edit Modal */}
            <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={closeModal}
                title={modal === 'add' ? t('form.addTitle') : t('form.editTitle')} size="4xl">
                <div className="space-y-8">
                    <div className="space-y-2">
                        <Typography variant="label" className="font-semibold">{t('form.provider')}</Typography>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {PROVIDERS.map(p => (
                                <button key={p.value} type="button"
                                    onClick={() => setForm(f => ({ ...f, provider: p.value }))}
                                    className={cn(
                                        "py-2.5 rounded-xl text-sm font-semibold border transition-all relative overflow-hidden group",
                                        form.provider === p.value
                                            ? "border-[#002B5B] bg-[#002B5B] text-white shadow-lg shadow-blue-900/10"
                                            : "border-slate-100 bg-slate-50/50 text-slate-400 hover:border-slate-200 hover:bg-white"
                                    )}>
                                    {form.provider === p.value && (
                                        <motion.div layoutId="active-bg" className="absolute inset-0 bg-[#002B5B]" />
                                    )}
                                    <span className="relative z-10">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                        <Input
                            label={t('form.nameLabel')}
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder={t('form.namePlaceholder')}
                            icon={Sparkles}
                        />
                        <Input
                            label={t('form.apiKey')}
                            value={form.api_key}
                            onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                            placeholder={modal === 'edit' && selected?.api_key ? maskKey(selected.api_key) : t('form.apiKeyPlaceholder')}
                            icon={Shield}
                            className="font-mono"
                        />

                        {form.provider === 'openrouter' && (
                            <div className="md:col-span-2">
                                <Input
                                    label={t('form.baseUrl')}
                                    type="url"
                                    value={form.websocket_url}
                                    onChange={e => setForm(f => ({ ...f, websocket_url: e.target.value }))}
                                    placeholder={t('form.baseUrlPlaceholder')}
                                    icon={Globe}
                                />
                            </div>
                        )}

                        <Input
                            label={t('form.dailyLimit')}
                            type="number"
                            value={form.credit_limit}
                            onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))}
                            placeholder={t('form.dailyLimitPlaceholder')}
                            icon={Activity}
                        />
                        <Input
                            label={t('form.expiration')}
                            type="date"
                            value={form.expiration}
                            onChange={e => setForm(f => ({ ...f, expiration: e.target.value }))}
                            icon={Calendar}
                        />
                    </div>

                    <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-sm", form.is_active ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400")}>
                                <Activity size={20} />
                            </div>
                            <div>
                                <Typography variant="large" className="text-slate-900 font-semibold">{t('form.activeLabel')}</Typography>
                                <Typography variant="small" color="secondary">{form.is_active ? t('form.activeDesc') : t('form.inactiveDesc')}</Typography>
                            </div>
                        </div>
                        <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                            className={cn(
                                "relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300",
                                form.is_active ? "bg-emerald-500" : "bg-slate-300"
                            )}>
                            <motion.span
                                animate={{ x: form.is_active ? 24 : 4 }}
                                className="inline-block h-4 w-4 rounded-full bg-white shadow-md"
                            />
                        </button>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-10 font-semibold text-xs uppercase">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 h-10 font-semibold shadow-lg shadow-blue-900/10 text-xs uppercase">
                        {saving ? t('form.saving') : t('form.save')}
                    </Button>
                </div>
            </Modal>

            {/* Details Modal */}
            <Modal isOpen={modal === 'view-details'} onClose={closeModal}
                title={t('table.details')}
                description={selected?.name || selected?.provider || ''}
                size="2xl">
                {selected && (
                    <div className="space-y-6">
                        {/* API Info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                                <Typography variant="label" color="secondary" className="font-bold text-[9px] mb-1 uppercase">{t('form.provider')}</Typography>
                                <Typography variant="large" className="text-[#002B5B] text-sm font-semibold">{selected.provider}</Typography>
                            </div>
                            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                                <Typography variant="label" color="secondary" className="font-bold text-[9px] mb-1 uppercase">{t('form.dailyLimit')}</Typography>
                                <Typography variant="large" className="text-[#002B5B] text-sm font-semibold">{selected.credit_limit || '—'}</Typography>
                            </div>
                        </div>

                        {/* Usage by Feature */}
                        <div className="space-y-2.5">
                            <Typography variant="label" className="font-bold px-1 text-[10px] uppercase text-slate-400">{t('table.byFeature')}</Typography>
                            <div className="grid grid-cols-1 gap-2">
                                {Object.entries(selected.stats.byFeature).length > 0 ? (
                                    Object.entries(selected.stats.byFeature)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([f, count]) => (
                                            <div key={f} className={cn("flex items-center justify-between p-2.5 rounded-xl border", FEATURE_COLORS[f] || FEATURE_COLORS.unknown)}>
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-lg bg-white/50 flex items-center justify-center">
                                                        {FEATURE_ICONS[f] || FEATURE_ICONS.unknown}
                                                    </div>
                                                    <Typography variant="large" className="font-bold text-xs uppercase">{FEATURE_LABELS[f] || f}</Typography>
                                                </div>
                                                <Typography variant="h4" className="text-sm font-bold">{count}</Typography>
                                            </div>
                                        ))
                                ) : (
                                    <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        <Typography variant="p" color="secondary" className="text-xs font-medium">{t('provider.noUsageToday')}</Typography>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Success/Failed stats */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                                <Typography variant="h2" className="text-emerald-600 text-xl font-bold">{selected.stats.todaySuccess}</Typography>
                                <Typography variant="label" className="text-emerald-500 font-bold mt-0.5 text-[9px] uppercase">{tc('success')}</Typography>
                            </div>
                            <div className="p-3.5 bg-red-50 rounded-2xl border border-red-100 text-center">
                                <Typography variant="h2" className="text-red-600 text-xl font-bold">{selected.stats.todayFailed}</Typography>
                                <Typography variant="label" className="text-red-500 font-bold mt-0.5 text-[9px] uppercase">{tc('error')}</Typography>
                            </div>
                        </div>
                    </div>
                )}
                <div className="mt-8 pt-5 border-t border-slate-100">
                    <Button onClick={closeModal} variant="primary" className="w-full h-10 font-bold text-xs uppercase">{tc('close')}</Button>
                </div>
            </Modal>

            <ConfirmModal isOpen={modal === 'delete'} onClose={closeModal} onConfirm={handleDelete}
                title={t('delete.title')}
                description={t('delete.description', { name: (selected?.name || selected?.provider) ?? '', key: selected?.api_key ? maskKey(selected.api_key) : '' })}
                confirmLabel={t('delete.confirm')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />
        </div>
    );
}
