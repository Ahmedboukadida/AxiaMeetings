'use client';

import { MEETING_DURATION_ORDER, MEETING_DURATION_FORM_KEYS, isWithinDurationLimit } from '@/lib/durations';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { ApiResponse } from '@/lib/types';
import { toast } from 'sonner';
import {
    Plus, Pencil, Trash2, CalendarClock, Users, LayoutGrid, List as ListIcon,
    Eye, Play, Ban, Sparkles, Info, Calendar, FileText, ListTodo,
    RefreshCw, Mail, CheckCircle2, MapPin, Clock, ArrowRight, UserPlus, FileUp, X, Loader2, ChevronRight, Wand2
} from 'lucide-react';
import Link from 'next/link';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { ListGridToggle } from '@/components/ui/ListGridToggle';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPicker } from '@/components/ui/UserPicker';
import { AiFeatureGuard } from '@/components/AiFeatureGuard';

import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { Select } from '@/components/ui/selects';
import { Badge } from '@/components/ui/badges';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { Textarea } from '@/components/ui/textareas';
import { cn } from '@/lib/utils';

type ModalType = 'add' | 'edit' | 'reschedule' | 'cancel' | 'delete' | 'bulk-delete' | null;

const emptyForm = {
    subject: '', type: 'ORDINAIRE', date: '', time: '',
    mode: 'IN_PERSON', location: '', duration: 'ONE_HOUR', description: '',
    isonline: 'FALSE', company_id: 0,
    participants: '',
    points: [] as { point: string; type: string }[],
    documents: [] as { file_title: string; file_path: string }[],
};

export default function MeetingsPage() {
    const { user } = useAuth();
    const t = useTranslations('Meetings');
    const tc = useTranslations('Common');
    const tmd = useTranslations('MeetingDetails');
    const [meetings, setMeetings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [modal, setModal] = useState<ModalType>(null);
    const [selected, setSelected] = useState<any>(null);
    const [bulkSelected, setBulkSelected] = useState<any[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [notify, setNotify] = useState(true);
    const [companyUsers, setCompanyUsers] = useState<any[]>([]);
    const [companies, setCompanies] = useState<any[]>([]);
    const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
    const [polishLoading, setPolishLoading] = useState(false);

    const typeLabel = (type: string) => {
        const key = type?.toLowerCase();
        return t(`types.${key}` as any) || type;
    };

    const statusConfig: Record<string, { variant: "primary" | "success" | "secondary" | "danger" | "warning"; label: string }> = {
        SCHEDULED: { variant: 'primary', label: t('card.status.SCHEDULED') },
        STARTED: { variant: 'success', label: t('card.status.STARTED') },
        FINISHED: { variant: 'secondary', label: t('card.status.FINISHED') },
        CANCELLED: { variant: 'danger', label: t('card.status.CANCELLED') },
    };

    const fetchCompanies = useCallback(async () => {
        if (user?.role !== 'DEVELOPER') return;
        try {
            const res = await fetch('/api/companies');
            const result = await res.json();
            if (result.status && result.data) setCompanies(result.data);
        } catch { console.error('Failed to fetch companies'); }
    }, [user]);

    const fetchMeetings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/meetings');
            const result: ApiResponse<any[]> = await res.json();
            if (result.status && result.data) setMeetings(result.data);
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setLoading(false); }
    }, [tc]);

    const fetchCompanyUsers = useCallback(async () => {
        const idToUse = form.company_id || user?.company_id;
        if (!idToUse) return;
        try {
            const res = await fetch(`/api/users?companyId=${idToUse}`);
            const result = await res.json();
            if (result.status) setCompanyUsers(result.data);
        } catch (err) { console.error('Error fetching company users:', err); }
    }, [form.company_id, user?.company_id]);

    useEffect(() => {
        fetchMeetings();
        fetchCompanyUsers();
        fetchCompanies();
    }, [fetchMeetings, fetchCompanyUsers, fetchCompanies]);

    const closeModal = () => { setModal(null); setSelected(null); };

    const openAdd = () => {
        setForm({ ...emptyForm, company_id: user?.company_id || 0, points: [{ point: '', type: 'SIMPLE' }] });
        setSelected(null);
        setModal('add');
    };

    const openEdit = (m: any) => {
        setSelected(m);
        setForm({
            subject: m.subject || '',
            type: m.type || 'ORDINAIRE',
            date: m.date || '',
            time: m.time || '',
            mode: m.mode || 'IN_PERSON',
            location: m.location || '',
            duration: m.duration || 'ONE_HOUR',
            description: m.description || '',
            isonline: m.isonline || 'FALSE',
            company_id: m.company_id || 0,
            participants: m.meetings_participants?.map((p: any) => p.email).join(', ') || '',
            points: m.meetings_points?.length
                ? m.meetings_points.map((p: any) => ({ point: p.point, type: p.type || 'SIMPLE' }))
                : [{ point: '', type: 'SIMPLE' }],
            documents: m.meetings_documents || [],
        });
        setModal('edit');
    };

    const openReschedule = (m: any) => {
        setSelected(m);
        setForm({ ...emptyForm, date: m.date || '', time: m.time || '', company_id: m.company_id });
        setModal('reschedule');
    };

    const handleSave = async () => {
        if (!form.subject.trim() || !form.date || !form.time) {
            toast.error(t('toast.errorFields'));
            return;
        }
        // DEVELOPER users have no implicit company: a company must be chosen before creating a meeting.
        if (modal === 'add' && user?.role === 'DEVELOPER' && !(Number(form.company_id) > 0)) {
            toast.error(t('toast.errorCompany'));
            return;
        }
        setSaving(true);
        try {
            const isEdit = modal === 'edit' && selected;
            const formattedPoints = form.points.filter(p => p.point.trim()).map(p => ({ point: p.point.trim(), type: p.type }));
            const formattedParticipants = form.participants.split(',').map((e) => e.trim()).filter(Boolean);
            const body = {
                subject: form.subject, type: form.type, date: form.date, time: form.time, mode: form.mode, location: form.location,
                duration: form.duration, description: form.description, isonline: form.isonline, company_id: form.company_id,
                participants: formattedParticipants, points: formattedPoints, documents: form.documents,
                sendRescheduleNotification: isEdit ? notify : true,
            };

            const res = await fetch(isEdit ? `/api/meetings/${selected.id}` : '/api/meetings', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result: ApiResponse<any> = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                if ((result as any).expiredToken) {
                    const msg = (result as any).pushMessage ? `Notification Push: ${(result as any).pushMessage}` : "Notification Push: Jeton expiré. Veuillez le renouveler.";
                    toast.warning(msg, { duration: 10000 });
                }
                fetchMeetings();
                closeModal();
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleReschedule = async () => {
        if (!form.date || !form.time) { toast.error(tc('error')); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/meetings/${selected.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: form.date, time: form.time, status: 'SCHEDULED', sendRescheduleNotification: true }),
            });
            const result: ApiResponse<any> = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                if ((result as any).expiredToken) {
                    const msg = (result as any).pushMessage ? `Notification Push: ${(result as any).pushMessage}` : "Notification Push: Jeton expiré.";
                    toast.warning(msg, { duration: 8000 });
                }
                fetchMeetings();
                closeModal();
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleAiSuggest = async () => {
        if (!form.subject) { toast.error(t('ai.subjectRequired')); return; }
        setAiSuggestLoading(true);
        try {
            const res = await fetch('/api/ai/suggest-agenda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: form.subject, description: form.description, type: form.type }),
            });
            const result = await res.json();
            if (result.status && result.data?.points) {
                setForm(f => ({ ...f, points: [...f.points.filter(p => p.point.trim() !== ''), ...result.data.points] }));
                toast.success(t('ai.success', { count: result.data.points.length }));
            } else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setAiSuggestLoading(false); }
    };

    const handlePolishDescription = async () => {
        setPolishLoading(true);
        try {
            const res = await fetch('/api/ai/polish-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: form.description || '',
                    context: 'description',
                    meetingContext: {
                        subject: form.subject,
                        type: form.type,
                        date: form.date,
                        time: form.time,
                        mode: form.mode,
                        location: form.location,
                        duration: form.duration,
                        points: form.points
                    },
                }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                setForm(prev => ({ ...prev, description: result.data.polished }));
            } else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setPolishLoading(false); }
    };

    const handleCancel = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/meetings/${selected.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'CANCELLED' }),
            });
            const result: ApiResponse<any> = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                if ((result as any).expiredToken) {
                    toast.warning("Jeton Push expiré.", { duration: 8000 });
                }
                fetchMeetings();
                closeModal();
            }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/meetings/${selected.id}`, { method: 'DELETE' });
            const result: ApiResponse<null> = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                if ((result as any).expiredToken) {
                    toast.warning("Notification Push: Jeton expiré.", { duration: 8000 });
                }
                fetchMeetings();
                closeModal();
            }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.allSettled(bulkSelected.map((m) => fetch(`/api/meetings/${m.id}`, { method: 'DELETE' })));
            toast.success(tc('success'));
            fetchMeetings(); closeModal(); setBulkSelected([]);
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const isAdminOrDev = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';

    const columns: Column<any>[] = useMemo(() => [
        ...(user?.role === 'DEVELOPER' ? [{
            accessorKey: 'company.name',
            header: tc('company'),
            cell: ({ row }: any) => <Badge variant="secondary" className="h-6 px-2 font-mono text-sm bg-purple-50 text-purple-600 border-purple-100">{row.original.company?.name || '—'}</Badge>,
        }] : []),
        {
            accessorKey: 'subject',
            header: tc('subject'),
            cell: ({ row }) => (
                <div className="flex items-center gap-2.5 max-w-md group">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 text-[#002B5B]">
                        <FileText size={14} />
                    </div>
                    <div className="min-w-0">
                        <Typography variant="large" className="text-slate-900 font-bold leading-tight text-xs">{row.original.subject}</Typography>
                        <Typography variant="small" color="secondary" className="text-[9px] uppercase mt-0.5 font-bold">{typeLabel(row.original.type)}</Typography>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'date',
            header: `${tc('date')} & ${tc('time')}`,
            cell: ({ row }) => (
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <Typography variant="small" className="text-slate-900 font-bold text-xs leading-none">{row.original.date}</Typography>
                        <div className="flex items-center gap-1.5 text-slate-400 mt-1 leading-none">
                            <Clock size={10} />
                            <Typography variant="small" className="text-[9px] font-bold uppercase">{row.original.time}</Typography>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: tc('status'),
            cell: ({ row }) => {
                const cfg = statusConfig[row.original.status] || statusConfig.SCHEDULED;
                return <Badge variant={cfg.variant} className="h-4.5 px-2 text-[8px] uppercase font-bold shadow-sm">{cfg.label}</Badge>;
            },
        },
        {
            id: 'actions',
            header: tc('actions'),
            enableSorting: false,
            cell: ({ row }) => {
                const m = row.original;
                return (
                    <div className="flex items-center gap-0.5">
                        <Link href={`/meetings/${m.id}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all" title={t('card.details')}><Eye size={14} /></Button>
                        </Link>
                        {isAdminOrDev && m.status === 'SCHEDULED' && (
                            <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:bg-amber-50 rounded-lg" onClick={() => openEdit(m)} title={tc('edit')}><Pencil size={14} /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:bg-blue-50 rounded-lg" onClick={() => openReschedule(m)} title={t('reschedule.title')}><CalendarClock size={14} /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500 hover:bg-orange-50 rounded-lg" onClick={() => { setSelected(m); setModal('cancel'); }} title={tc('cancel')}><Ban size={14} /></Button>
                            </>
                        )}
                        {user?.role === 'DEVELOPER' && (m.status === 'CANCELLED' || m.status === 'FINISHED') && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50 rounded-lg" onClick={() => { setSelected(m); setModal('delete'); }} title={tc('delete')}><Trash2 size={14} /></Button>
                        )}
                        {isAdminOrDev && m.status === 'FINISHED' && (
                            <Link href={`/meetings/${m.id}`}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-600 hover:bg-violet-50 rounded-lg" title={t('aiSummary.title')}><Wand2 size={14} /></Button>
                            </Link>
                        )}
                        {(m.status === 'SCHEDULED' || m.status === 'STARTED') && (
                            <Link href={`/meetings/${m.id}/live`}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 rounded-lg animate-pulse" title={m.status === 'STARTED' ? t('card.join') : tc('getStarted')}><Play size={14} /></Button>
                            </Link>
                        )}
                    </div>
                );
            },
        },
    ], [t, tc, user?.role, statusConfig]);

    const bulkActions: BulkAction<any>[] = user?.role === 'DEVELOPER' ? [{
        label: tc('delete'), icon: <Trash2 size={14} />, variant: 'danger',
        onClick: (rows) => { setBulkSelected(rows); setModal('bulk-delete'); },
    }] : [];

    return (
        <div className="space-y-8 pb-20">
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Calendar size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <div className="flex items-center gap-3 mt-1.5">
                                <Typography variant="p" color="secondary" className="text-[11px] font-bold uppercase">
                                    {t('subtitle')}
                                </Typography>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <ListGridToggle
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            className="w-full md:w-auto"
                            gridLabel={t('header.viewGrid')}
                            listLabel={t('header.viewList')}
                        />
                        {isAdminOrDev && (
                            <Button
                                onClick={openAdd}
                                className="w-full md:w-auto h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm"
                            >
                                <Plus size={18} className="md:me-2 rtl:rotate-90" /> <span className="md:inline">{t('new')}</span>
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            {!loading && meetings.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                    {[
                        { label: tc('all'), value: meetings.length, icon: CalendarClock, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: t('card.status.SCHEDULED'), value: meetings.filter(m => m.status === 'SCHEDULED').length, icon: Mail, color: 'text-amber-600', bg: 'bg-amber-50' },
                        { label: t('live.title'), value: meetings.filter(m => m.status === 'STARTED').length, icon: Play, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                        { label: t('card.status.CANCELLED'), value: meetings.filter(m => m.status === 'CANCELLED').length, icon: Ban, color: 'text-red-600', bg: 'bg-red-50' },
                        { label: t('card.status.FINISHED'), value: meetings.filter(m => m.status === 'FINISHED').length, icon: CheckCircle2, color: 'text-slate-600', bg: 'bg-slate-50' },
                    ].map((stat, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3.5 group hover:shadow-xl hover:shadow-blue-900/5 transition-all">
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-all group-hover:scale-105", stat.bg, stat.color)}>
                                <stat.icon size={18} />
                            </div>
                            <div>
                                <Typography variant="label" className="mb-0.5 text-[9px] uppercase font-semibold text-slate-400">{stat.label}</Typography>
                                <Typography variant="h2" className="leading-none text-lg font-semibold">{stat.value}</Typography>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Content Section */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                    <Typography variant="label">{tc('loading')}</Typography>
                </div>
            ) : viewMode === 'grid' ? (
                meetings.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="w-16 h-16 bg-slate-50 rounded-full shadow-inner flex items-center justify-center mx-auto mb-5 text-slate-200">
                            <CalendarClock size={32} />
                        </div>
                        <Typography variant="h3" className="text-slate-400 mb-1 text-base font-semibold">{t('empty')}</Typography>
                        <Typography variant="p" color="secondary" className="max-w-xs mx-auto text-xs font-medium">{t('emptyDesc')}</Typography>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {meetings.map((m, i) => {
                            const cfg = statusConfig[m.status] || statusConfig.SCHEDULED;
                            return (
                                <motion.div key={m.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                    className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:shadow-blue-900/5 transition-all duration-500 overflow-hidden flex flex-col h-full"
                                >
                                    <div className="p-4 pb-3 flex-1 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Badge variant={cfg.variant} className="h-4 px-2 text-[8px] uppercase font-bold shadow-sm">
                                                {cfg.label}
                                            </Badge>
                                            <div className="flex items-center gap-1 text-slate-400 font-bold text-[8px] uppercase shrink-0">
                                                <Calendar size={10} className="text-blue-500" />
                                                {m.date}
                                            </div>
                                        </div>

                                        <Typography variant="h3" className="group-hover:text-[#002B5B] transition-colors leading-tight text-xs font-bold line-clamp-2 min-h-[2rem]">{m.subject}</Typography>

                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                                                <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                                    <Clock size={10} />
                                                    <Typography variant="label" className="text-[9px] uppercase font-semibold">{t('card.time')}</Typography>
                                                </div>
                                                <Typography variant="large" className="text-xs font-semibold text-slate-700">{m.time}</Typography>
                                            </div>
                                            <div className="bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                                                <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                                                    <Users size={10} />
                                                    <Typography variant="label" className="text-[9px] uppercase font-semibold">{t('card.attendees')}</Typography>
                                                </div>
                                                <Typography variant="large" className="text-xs font-semibold text-slate-700">{m.meetings_participants?.length || 0}</Typography>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-100 bg-white">
                                            <div className="w-7 h-7 rounded-md bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
                                                <MapPin size={10} className="text-[#002B5B]" />
                                            </div>
                                            <div className="min-w-0">
                                                <Typography variant="label" className="text-[9px] uppercase font-semibold block mb-0.5 opacity-50">{t('card.location')}</Typography>
                                                <Typography variant="small" className="text-slate-700 uppercase font-semibold text-[8px] truncate">
                                                    {m.mode === 'ONLINE' ? t('card.virtual') : (m.location || t('card.notSpecified'))}
                                                </Typography>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 pt-0 mt-1 flex flex-col sm:flex-row gap-2">
                                        <Link href={`/meetings/${m.id}`} className="flex-1">
                                            <Button variant="outline" className="w-full h-8 rounded-lg group-hover:bg-[#002B5B] group-hover:text-white hover:!bg-[#003d80] hover:!text-white transition-all text-[8px] font-bold uppercase">
                                                {t('card.details')}
                                            </Button>
                                        </Link>
                                        {isAdminOrDev && m.status === 'FINISHED' && (
                                            <Link href={`/meetings/${m.id}`} className="flex-1">
                                                <Button className="w-full h-8 rounded-lg shadow-md shadow-violet-900/10 bg-violet-600 hover:bg-violet-700 text-white text-[8px] font-bold uppercase">
                                                    <Wand2 size={12} className="me-1" />
                                                    {t('aiSummary.title')}
                                                </Button>
                                            </Link>
                                        )}
                                        {(m.status === 'SCHEDULED' || m.status === 'STARTED') && (
                                            <Link href={`/meetings/${m.id}/live`} className="flex-1">
                                                <Button className="w-full h-8 rounded-lg shadow-md shadow-blue-900/5 text-[8px] font-bold uppercase">
                                                    {m.status === 'STARTED' ? t('card.join') : tc('getStarted')}
                                                    <ChevronRight className="ms-1 w-2.5 h-2.5 rtl:rotate-180" />
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )
            ) : (
                <Card className="rounded-2xl border-slate-200 overflow-hidden">
                    <DataTable
                        columns={columns}
                        data={meetings}
                        searchable
                        searchPlaceholder={tc('search')}
                        bulkActions={bulkActions}
                        emptyMessage={t('empty')}
                        pagesize={10}
                    />
                </Card>
            )}

            {/* Full Creation/Edition Modal */}
            <Modal
                isOpen={modal === 'add' || modal === 'edit'}
                onClose={closeModal}
                title={modal === 'add' ? t('form.create') : t('form.edit')}
                description={modal === 'add' ? t('form.createDesc') : t('form.editDesc')}
                size="8xl"
            >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Primary Info Column */}
                    <div className="lg:col-span-7 space-y-5 md:space-y-6">
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-5">
                            <Typography variant="label" className="flex items-center gap-2.5 uppercase text-[10px] text-blue-600 font-semibold">
                                <Info size={14} /> {t('form.sections.basic')}
                            </Typography>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <div className="md:col-span-2">
                                    <Input
                                        label={`${t('form.subject')} *`}
                                        value={form.subject}
                                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                                        placeholder={t('form.subjectPlaceholder')}
                                        icon={FileText}
                                    />
                                </div>
                                <Select
                                    label={t('form.type')}
                                    value={form.type}
                                    onValueChange={(val) => setForm((f) => ({ ...f, type: val }))}
                                    options={[
                                        { value: 'ORDINAIRE', label: t('types.ordinaire') },
                                        { value: 'EXTRAORDINAIRE', label: t('types.extraordinaire') },
                                        { value: 'COMPLEMENTAIRE', label: t('types.complementaire') },
                                        { value: 'DELEGUES', label: t('types.delegues') }
                                    ]}
                                />
                                {user?.role === 'DEVELOPER' ? (
                                    <Select
                                        label={`${tc('company')} *`}
                                        value={form.company_id ? String(form.company_id) : ''}
                                        onValueChange={(val) => setForm((f) => ({ ...f, company_id: Number(val) }))}
                                        placeholder={tc('select')}
                                        options={companies.map(c => ({ value: String(c.id), label: c.name }))}
                                    />
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        <Typography variant="label" className="text-slate-400 text-[9px] uppercase font-semibold">{t('form.durationLimit')}</Typography>
                                        <Badge variant="secondary" className="h-9 rounded-lg bg-white border-slate-100 flex items-center justify-center gap-2">
                                            <Clock size={12} className="text-blue-500" />
                                            <span className="font-semibold text-[10px] uppercase">{t('form.maxLimit')}: {user?.meeting_time_limit?.replace('_', ' ') || '1 Hour'}</span>
                                        </Badge>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-5">
                            <Typography variant="label" className="flex items-center gap-2.5 uppercase text-[10px] text-blue-600 font-semibold">
                                <Calendar size={14} /> {t('form.sections.logistics')}
                            </Typography>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <Input label={`${tc('date')} *`} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} icon={Calendar} />
                                <Input label={`${t('form.time')} *`} type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} icon={Clock} />

                                <Select
                                    label={t('form.mode')}
                                    value={form.mode}
                                    onValueChange={(val) => setForm((f) => ({ ...f, mode: val }))}
                                    options={[
                                        { value: 'IN_PERSON', label: t('form.modes.inPerson') },
                                        { value: 'ONLINE', label: t('form.modes.online') },
                                        { value: 'HYBRID', label: t('form.modes.hybrid') }
                                    ]}
                                />

                                <Select
                                    label={t('form.duration')}
                                    value={form.duration}
                                    onValueChange={(val) => setForm((f) => ({ ...f, duration: val }))}
                                    options={MEETING_DURATION_ORDER
                                        .filter(d => user?.role === 'DEVELOPER' || isWithinDurationLimit(d, user?.meeting_time_limit || 'ONE_HOUR'))
                                        .map(d => ({ value: d, label: t(`form.durations.${MEETING_DURATION_FORM_KEYS[d]}`) }))}
                                />
                                <div className="md:col-span-2">
                                    <Input
                                        label={t('form.location')}
                                        value={form.location}
                                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                                        placeholder={form.mode === 'ONLINE' ? t('form.locationPlaceholderOnline') : t('form.locationPlaceholderInPerson')}
                                        icon={MapPin}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3.5">
                            <div className="flex items-center justify-between">
                                <Typography variant="label" className="uppercase text-[10px] font-semibold text-slate-400">{t('form.sections.description')}</Typography>
                                <AiFeatureGuard>
                                    <Button variant="outline" size="sm" onClick={handlePolishDescription} disabled={polishLoading} className="rounded-lg border-blue-100 bg-blue-50/30 text-blue-600 h-8 text-[10px] font-semibold">
                                        {polishLoading ? <Loader2 size={12} className="animate-spin me-1.5" /> : <Wand2 size={12} className="me-1.5" />}
                                        {polishLoading ? tc('processing') : tmd('ai.polish')}
                                    </Button>
                                </AiFeatureGuard>
                            </div>
                            <Textarea
                                value={form.description}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, description: e.target.value }))}
                                rows={6}
                                placeholder={t('form.descriptionPlaceholder')}
                                className="bg-slate-50/50 border-slate-100 focus:bg-white transition-all rounded-xl p-5 text-sm leading-relaxed"
                            />
                        </div>
                    </div>

                    {/* Secondary/Collaboration Column */}
                    <div className="lg:col-span-5 space-y-5 md:space-y-6">
                        <Card className="rounded-xl border-slate-100 overflow-hidden shadow-sm">
                            <CardHeader className="p-4 pb-0 space-y-1">
                                <CardTitle className="text-[10px] uppercase font-semibold flex items-center gap-2.5">
                                    <UserPlus className="text-blue-500" size={16} /> {t('form.participants')}
                                </CardTitle>
                                <CardDescription className="text-[9px] font-medium">{t('form.participantsDesc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-3">
                                <UserPicker
                                    users={companyUsers}
                                    value={form.participants}
                                    onChange={(val: string) => setForm((f) => ({ ...f, participants: val }))}
                                    allowFreeText={true}
                                    placeholder={tc('search')}
                                />
                            </CardContent>
                        </Card>

                        <Card className="rounded-xl border-slate-100 overflow-hidden shadow-sm">
                            <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-[10px] uppercase font-semibold flex items-center gap-2.5">
                                        <ListTodo className="text-blue-500" size={16} /> {t('form.points')}
                                    </CardTitle>
                                    <CardDescription className="text-[9px] font-medium">{t('form.agendaDesc')}</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <AiFeatureGuard>
                                        <Button variant="outline" size="icon" onClick={handleAiSuggest} disabled={aiSuggestLoading} className="h-8 w-8 rounded-lg border-blue-100 text-blue-500 hover:bg-blue-50">
                                            {aiSuggestLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                        </Button>
                                    </AiFeatureGuard>
                                    <Button variant="primary" size="icon" onClick={() => setForm({ ...form, points: [...form.points, { point: '', type: 'SIMPLE' }] })} className="h-8 w-8 rounded-lg">
                                        <Plus size={16} />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-3 space-y-2.5">
                                <div className="max-h-[350px] overflow-y-auto pr-2 custom-scrollbar space-y-4">
                                    <AnimatePresence initial={false}>
                                        {form.points.map((p, i) => (
                                            <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                                className="flex gap-2 items-center group"
                                            >
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        value={p.point}
                                                        onChange={(e) => {
                                                            const newPoints = [...form.points];
                                                            newPoints[i].point = e.target.value;
                                                            setForm({ ...form, points: newPoints });
                                                        }}
                                                        placeholder={t('form.pointPlaceholder')}
                                                        className="w-full h-9 px-3 rounded-lg border border-slate-100 bg-slate-50/50 focus:bg-white focus:border-[#002B5B] outline-none text-[11px] font-semibold text-slate-700 transition-all shadow-xs"
                                                    />
                                                </div>
                                                <div className="w-24 shrink-0">
                                                    <select
                                                        value={p.type}
                                                        onChange={(e) => {
                                                            const newPoints = [...form.points];
                                                            newPoints[i].type = e.target.value;
                                                            setForm({ ...form, points: newPoints });
                                                        }}
                                                        className="w-full h-9 px-2 rounded-lg border border-slate-100 bg-slate-50/50 focus:bg-white focus:border-[#002B5B] outline-none text-[9px] font-semibold uppercase text-[#002B5B] transition-all cursor-pointer"
                                                    >
                                                        <option value="SIMPLE">{t('form.pointTypes.simple')}</option>
                                                        <option value="VOTE">{t('form.pointTypes.vote')}</option>
                                                    </select>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => {
                                                    const newPoints = form.points.filter((_, idx) => idx !== i);
                                                    setForm({ ...form, points: newPoints.length ? newPoints : [{ point: '', type: 'SIMPLE' }] });
                                                }} className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all rounded-lg">
                                                    <Trash2 size={14} />
                                                </Button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-xl border-slate-100 overflow-hidden shadow-sm">
                            <CardHeader className="p-4 pb-0 flex flex-row items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-[10px] uppercase font-semibold flex items-center gap-2.5">
                                        <FileUp className="text-blue-500" size={16} /> {t('form.documents')}
                                    </CardTitle>
                                    <CardDescription className="text-[9px] font-medium">{t('form.documentsDesc')}</CardDescription>
                                </div>
                                <label className="h-8 w-8 bg-slate-50 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all border border-slate-100 flex items-center justify-center cursor-pointer shadow-xs">
                                    <Plus size={16} />
                                    <input type="file" className="hidden" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        const res = await fetch('/api/upload', { method: 'POST', body: formData });
                                        const result = await res.json();
                                        if (result.status) {
                                            setForm(f => ({ ...f, documents: [...f.documents, { file_title: file.name, file_path: result.data.file_path }] }));
                                            toast.success(tc('success'));
                                        } else toast.error(result.message || tc('error'));
                                    }} />
                                </label>
                            </CardHeader>
                            <CardContent className="p-4 pt-3">
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {form.documents.map((doc, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 border border-slate-100 group hover:bg-white hover:shadow-lg hover:shadow-blue-900/5 transition-all">
                                            <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-blue-600 shadow-sm shrink-0 border border-slate-50">
                                                <FileText size={16} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <Typography variant="small" className="text-slate-700 font-semibold uppercase text-xs truncate">{doc.file_title}</Typography>
                                            </div>
                                            <Button variant="ghost" size="icon" onClick={() => setForm(f => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) }))}
                                                className="h-8 w-8 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all rounded-lg">
                                                <X size={14} />
                                            </Button>
                                        </div>
                                    ))}
                                    {form.documents.length === 0 && (
                                        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center gap-3">
                                            <FileUp size={24} className="text-slate-100" />
                                            <Typography variant="small" className="text-slate-300 font-semibold uppercase text-[10px]">{t('card.noDocuments')}</Typography>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <div className={cn(
                            "p-4 rounded-xl border-2 transition-all cursor-pointer group flex items-center gap-4",
                            notify ? "bg-emerald-50/30 border-emerald-100" : "bg-slate-50/30 border-slate-100"
                        )} onClick={() => setNotify(!notify)}>
                            <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center shadow-sm transition-all",
                                notify ? "bg-emerald-500 text-white" : "bg-white text-slate-300 border border-slate-100"
                            )}>
                                <CheckCircle2 size={20} />
                            </div>
                            <div className="flex-1">
                                <Typography variant="large" className="text-slate-900 font-semibold text-sm">{t('form.notifyLabel')}</Typography>
                                <Typography variant="small" color="secondary" className="text-[10px] mt-0.5 font-medium">{modal === 'edit' ? t('form.notifyDescEdit') : t('form.notifyDescAdd')}</Typography>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-10 pt-8 border-t border-slate-100">
                    <Button variant="outline" onClick={closeModal} className="px-8 h-11 rounded-xl font-semibold uppercase text-[10px]">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="px-10 h-11 rounded-xl font-semibold uppercase text-[10px] shadow-xl shadow-blue-900/10 min-w-[180px]">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : tc('save')}
                    </Button>
                </div>
            </Modal>

            {/* Reschedule Modal */}
            <Modal isOpen={modal === 'reschedule'} onClose={closeModal}
                title={t('reschedule.title')}
                description={t('reschedule.description', { subject: selected?.subject })}
                size="md">
                <div className="space-y-6 pt-4">
                    <Input label={`${tc('date')} *`} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} icon={Calendar} />
                    <Input label={`${t('form.time')} *`} type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} icon={Clock} />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-10">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-11 rounded-xl font-semibold text-[10px] uppercase">{tc('cancel')}</Button>
                    <Button onClick={handleReschedule} disabled={saving} className="flex-1 h-11 rounded-xl font-semibold text-[10px] uppercase shadow-lg shadow-blue-900/10">
                        {saving ? tc('processing') : t('reschedule.button')}
                    </Button>
                </div>
            </Modal>

            {/* Confirm Modals */}
            <ConfirmModal isOpen={modal === 'cancel'} onClose={closeModal} onConfirm={handleCancel}
                title={t('modals.cancel.title')} description={t('modals.cancel.description', { subject: selected?.subject })}
                confirmLabel={tc('confirm')} confirmVariant="danger" loading={saving}
                icon={<Ban size={24} className="text-orange-500" />} />

            <ConfirmModal isOpen={modal === 'delete'} onClose={closeModal} onConfirm={handleDelete}
                title={t('modals.delete.title')} description={t('modals.delete.description', { subject: selected?.subject })}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />

            <ConfirmModal isOpen={modal === 'bulk-delete'} onClose={closeModal} onConfirm={handleBulkDelete}
                title={tc('delete')}
                description={tc('confirmBulkDelete', { count: bulkSelected.length })}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />
        </div>
    );
}
