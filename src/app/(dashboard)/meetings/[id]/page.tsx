'use client';

import { MEETING_DURATION_ORDER, MEETING_DURATION_FORM_KEYS, isWithinDurationLimit } from '@/lib/durations';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Calendar, MapPin, Video, Users, FileText, ListTodo,
    ArrowLeft, Printer, Info, ChevronRight,
    Ban, Trash2, CalendarClock, Send, Mail, Plus, CheckCircle2, XCircle, MinusCircle, Upload, Pencil, Play, FileDown, Clock,
    Sparkles, Wand2, Brain, RefreshCw, AlertTriangle, TrendingUp, Zap, ExternalLink, Download, FileUp, Loader2, ShieldAlert
} from 'lucide-react';
import { ApiResponse } from '@/lib/types';
import { MeetingType, MeetingMode, MeetingDuration } from '@/lib/enums/meetings';
import { useAuth } from '@/components/context/AuthContext';
import { toast } from 'sonner';
import Link from 'next/link';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { UserPicker } from '@/components/ui/UserPicker';
import { AITimerInline } from '@/components/ui/AITimer';
import { useTranslations } from 'next-intl';
import { AiFeatureGuard } from '@/components/AiFeatureGuard';
import { motion, AnimatePresence } from 'framer-motion';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { Select } from '@/components/ui/selects';
import { Badge } from '@/components/ui/badges';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/html';
import { isSafeDocumentUrl } from '@/lib/safe-url';

type ModalType = 'edit' | 'reschedule' | 'cancel' | 'delete' | null;

export default function MeetingDetailsPage() {
    const t = useTranslations('MeetingDetails');
    const tc = useTranslations('Common');
    const tm = useTranslations('Meetings');
    const tpv = useTranslations('PV');
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const isAdminOrDev = user?.role === 'ADMIN' || user?.role === 'DEVELOPER';
    const [meeting, setMeeting] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<ModalType>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        subject: '', type: 'ORDINAIRE', date: '', time: '',
        mode: 'IN_PERSON', location: '', duration: 'ONE_HOUR', description: '',
        isonline: 'FALSE',
        participants: '',
        points: [] as { point: string; type: string }[],
        documents: [] as { file_title: string; file_path: string }[],
    });
    const [companyUsers, setCompanyUsers] = useState<any[]>([]);
    const [aiSummary, setAiSummary] = useState<any>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiPvLoading, setAiPvLoading] = useState(false);
    const [polishLoading, setPolishLoading] = useState(false);
    const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [pendingDescription, setPendingDescription] = useState('');
    const [showPolishModal, setShowPolishModal] = useState(false);
    const [summaryText, setSummaryText] = useState('');
    const [summaryEditing, setSummaryEditing] = useState(false);
    // H4: sanitized snapshot rendered once into the contentEditable editor (not re-rendered on each keystroke)
    const [summaryEditorHtml, setSummaryEditorHtml] = useState('');
    const startSummaryEdit = () => { setSummaryEditorHtml(sanitizeHtml(summaryText)); setSummaryEditing(true); };
    const [summarySaving, setSummarySaving] = useState(false);
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);

    const fetchMeeting = async () => {
        try {
            const res = await fetch(`/api/meetings/${id}`);
            const result: ApiResponse<any> = await res.json();
            if (result.status && result.data) {
                setMeeting(result.data);
                setSummaryText(result.data.summary || '');
            } else {
                toast.error(result.message || tc('error'));
                router.push('/meetings');
            }
        } catch {
            toast.error(tc('error'));
        } finally {
            setLoading(false);
        }
    };

    const fetchCompanyUsers = async () => {
        if (!user?.company_id) return;
        try {
            const res = await fetch(`/api/users?company_id=${user.company_id}`);
            const result = await res.json();
            if (result.status) setCompanyUsers(result.data);
        } catch (err) { console.error('Error fetching company users:', err); }
    };

    useEffect(() => {
        if (id) {
            fetchMeeting();
            fetchCompanyUsers();
        }
    }, [id]);

    const openEdit = () => {
        setForm({
            subject: meeting.subject || '',
            type: meeting.type || 'ORDINAIRE',
            date: meeting.date || '',
            time: meeting.time || '',
            mode: meeting.mode || 'IN_PERSON',
            location: meeting.location || '',
            duration: meeting.duration || 'ONE_HOUR',
            description: meeting.description || '',
            isonline: meeting.isonline || 'FALSE',
            participants: meeting.meetings_participants?.map((p: any) => p.email).join(', ') || '',
            points: meeting.meetings_points?.length
                ? meeting.meetings_points.map((p: any) => ({ point: p.point, type: p.type || 'SIMPLE' }))
                : [{ point: '', type: 'SIMPLE' }],
            documents: meeting.meetings_documents || [],
        });
        setModal('edit');
    };

    const openReschedule = () => {
        setForm({ ...form, date: meeting.date || '', time: meeting.time || '' });
        setModal('reschedule');
    };

    const closeModal = () => setModal(null);

    const handleSave = async () => {
        if (!form.subject.trim() || !form.date || !form.time) {
            toast.error(t('modals.edit.errorRequired'));
            return;
        }
        setSaving(true);
        try {
            const body = {
                ...form,
                participants: form.participants.split(',').map(e => e.trim()).filter(Boolean),
                points: form.points.filter(p => p.point.trim()).map(p => ({ point: p.point.trim(), type: p.type })),
                sendRescheduleNotification: true,
            };

            const res = await fetch(`/api/meetings/${id}`, {
                method: 'PUT',
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
                fetchMeeting();
                closeModal();
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleReschedule = async () => {
        if (!form.date || !form.time) { toast.error(tm('toast.errorFields')); return; }
        setSaving(true);
        try {
            const res = await fetch(`/api/meetings/${id}`, {
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
                fetchMeeting();
                closeModal();
            }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleCancel = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/meetings/${id}`, {
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
                fetchMeeting();
                closeModal();
            }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
            const result: ApiResponse<null> = await res.json();
            if (result.status) { toast.success(tc('success')); router.push('/meetings'); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleAiSummary = async () => {
        setAiLoading(true);
        try {
            const res = await fetch(`/api/meetings/${id}/ai-summary`, { method: 'POST' });
            const result = await res.json();
            if (result.status) { setAiSummary(result.data); setShowAiModal(true); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setAiLoading(false); }
    };

    const handleAiPv = async (overwrite = false) => {
        setAiPvLoading(true);
        try {
            const res = await fetch(`/api/meetings/${id}/pv-word`, {
                method: 'POST',
                body: JSON.stringify({ overwrite })
            });
            const result = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                fetchMeeting();
                const a = document.createElement('a');
                a.href = result.data.url;
                a.download = result.data.fileName || `pv-${id}.docx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setShowOverwriteModal(false);
            } else if (result.message === 'EXISTING_PV') {
                setShowOverwriteModal(true);
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch { toast.error(tc('error')); }
        finally { setAiPvLoading(false); }
    };

    const handleAiSuggest = async () => {
        if (!form.subject) { toast.error(tm('toast.errorSubject')); return; }
        setAiSuggestLoading(true);
        try {
            const res = await fetch('/api/ai/suggest-agenda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: form.subject, description: form.description, type: form.type }),
            });
            const result = await res.json();
            if (result.status && result.data?.points) {
                setForm(f => ({ ...f, points: [...f.points.filter((p: any) => p.point.trim() !== ''), ...result.data.points] }));
                toast.success(t('ai.pointsGenerated', { count: result.data.points.length }));
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
                        subject: form.subject || meeting?.subject,
                        type: form.type || meeting?.type,
                        date: form.date || meeting?.date,
                        time: form.time || meeting?.time,
                        mode: form.mode || meeting?.mode,
                        location: form.location || meeting?.location,
                        duration: form.duration || meeting?.duration,
                        points: form.points?.length > 0
                            ? form.points
                            : meeting?.meetings_points?.map((p: any) => ({ point: p.point, type: p.type })) || [],
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

    const handleConfirmPolish = async () => {
        if (!pendingDescription) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/meetings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: pendingDescription }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                setMeeting((prev: any) => ({ ...prev, description: pendingDescription }));
                setShowPolishModal(false);
                setPendingDescription('');
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch {
            toast.error(tc('error'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                <Typography variant="label">{tc('loading')}</Typography>
            </div>
        );
    }

    if (!meeting) return null;

    const statusConfig: Record<string, { variant: "primary" | "success" | "secondary" | "danger" | "warning"; label: string }> = {
        SCHEDULED: { variant: 'primary', label: t('status.scheduled') },
        STARTED: { variant: 'success', label: t('status.started') },
        FINISHED: { variant: 'secondary', label: t('status.finished') },
        CANCELLED: { variant: 'danger', label: t('status.cancelled') },
    };


    const currentStatus = statusConfig[meeting.status] || statusConfig.SCHEDULED;

    return (
        <div className="space-y-8 pb-20">
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full xl:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Calendar size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <div className="flex flex-col gap-1">
                                <button onClick={() => router.push('/meetings')}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 hover:text-[#002B5B] transition-all group w-fit">
                                    <ArrowLeft size={10} className="group-hover:-translate-x-0.5 transition-transform" /> {t('back')}
                                </button>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{meeting.subject}</Typography>
                                    <Badge variant={currentStatus.variant} className="h-5 px-2 shadow-sm w-fit text-[9px] uppercase font-bold">
                                        {currentStatus.label}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
                        <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 w-full sm:w-auto justify-center sm:justify-start">
                            {isAdminOrDev && meeting.status === 'SCHEDULED' && (
                                <>
                                    <Button variant="ghost" size="icon-sm" onClick={openEdit} className="text-amber-500 hover:bg-white rounded-lg" title={tc('edit')}><Pencil size={16} /></Button>
                                    <Button variant="ghost" size="icon-sm" onClick={openReschedule} className="text-blue-500 hover:bg-white rounded-lg" title={t('actions.reschedule')}><CalendarClock size={16} /></Button>
                                    <Button variant="ghost" size="icon-sm" onClick={() => setModal('cancel')} className="text-orange-500 hover:bg-white rounded-lg" title={tc('cancel')}><Ban size={16} /></Button>
                                </>
                            )}
                            {user?.role === 'DEVELOPER' && (meeting.status === 'CANCELLED' || meeting.status === 'FINISHED') && (
                                <Button variant="ghost" size="icon" onClick={() => setModal('delete')} className="h-9 w-9 text-red-500 hover:bg-white rounded-lg" title={tc('delete')}><Trash2 size={18} /></Button>
                            )}
                            {meeting.status === 'FINISHED' && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleAiPv(false)}
                                    disabled={aiPvLoading || meeting.status !== 'FINISHED'}
                                    className={cn(
                                        "bg-white border-slate-100 h-10 px-6 text-sm font-semibold uppercase flex-1 sm:flex-none",
                                        meeting.status !== 'FINISHED' && "hidden"
                                    )}
                                >
                                    {aiPvLoading ? <Loader2 size={18} className="animate-spin me-2" /> : <FileDown size={18} className="me-2 text-blue-500" />}
                                    {aiPvLoading ? t('ai.generating') : t('actions.wordExport')}
                                    <AITimerInline isLoading={aiPvLoading} />
                                </Button>
                            )}
                        </div>
                        {(meeting.status === 'SCHEDULED' || meeting.status === 'STARTED') && (
                            <Link href={`/meetings/${id}/live`} className="grow xl:grow-0 w-full sm:w-auto">
                                <Button className="w-full xl:w-auto h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm">
                                    <Play size={18} className="me-2 fill-current" />
                                    {meeting.status === 'STARTED' ? t('actions.join') : t('actions.start')}
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Assistant Banner */}
            {isAdminOrDev && (
                <AiFeatureGuard>
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-linear-to-r from-violet-500/5 to-blue-500/5 border border-violet-100 p-5 rounded-2xl flex flex-wrap items-center gap-4 shadow-sm"
                    >
                        <div className="flex items-center gap-4 mr-4 shrink-0">
                            <div className="w-11 h-11 bg-white rounded-xl flex items-center justify-center text-violet-600 shadow-sm border border-violet-100">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <Typography variant="label" className="text-violet-900 font-semibold uppercase text-[10px]">{t('ai.assistant')}</Typography>
                                <Typography variant="small" color="secondary" className="text-[10px]">{t('aiSubtitle')}</Typography>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 grow">
                            <Button
                                variant="outline"
                                onClick={handleAiSummary}
                                disabled={aiLoading || meeting.status !== 'FINISHED'}
                                className={cn(
                                    "bg-white border-violet-100 text-violet-700 hover:bg-violet-50 h-9 px-4 rounded-lg flex-1 sm:flex-none text-[10px] font-semibold uppercase",
                                    meeting.status !== 'FINISHED' && "hidden"
                                )}
                            >
                                {aiLoading ? <Loader2 size={14} className="animate-spin me-2" /> : <Brain size={14} className="me-2" />}
                                {aiLoading ? t('ai.analyzing') : t('ai.summary')}
                                <AITimerInline isLoading={aiLoading} />
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handlePolishDescription}
                                disabled={polishLoading || meeting.status === 'FINISHED' || meeting.status === 'CANCELLED'}
                                className={cn(
                                    "bg-white border-emerald-100 text-emerald-700 hover:bg-emerald-50 h-9 px-4 rounded-lg flex-1 sm:flex-none text-[10px] font-semibold uppercase",
                                    (meeting.status === 'FINISHED' || meeting.status === 'CANCELLED') && "hidden"
                                )}
                            >
                                {polishLoading ? <Loader2 size={14} className="animate-spin me-2" /> : <Wand2 size={14} className="me-2" />}
                                {polishLoading ? tc('processing') : t('modals.edit.generateDescription')}
                                <AITimerInline isLoading={polishLoading} />
                            </Button>
                        </div>
                    </motion.div>
                </AiFeatureGuard>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Main Content Area */}
                <div className="lg:col-span-8 space-y-10">
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {[
                            { icon: Calendar, label: t('info.date'), value: new Date(meeting.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), color: 'text-blue-600', bg: 'bg-blue-50' },
                            { icon: Clock, label: t('info.timeAndDuration'), value: `${meeting.time} (${t(`durations.${meeting.duration}`)})`, color: 'text-purple-600', bg: 'bg-purple-50' },
                            { icon: Video, label: t('info.mode'), value: t(`modes.${meeting.mode}`), color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { icon: MapPin, label: t('info.location'), value: meeting.location || tc('na'), color: 'text-amber-600', bg: 'bg-amber-50' },
                        ].map((item, i) => (
                            <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
                                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 group hover:shadow-xl hover:shadow-blue-900/5 transition-all">
                                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border transition-all group-hover:scale-105", item.bg, item.color, "border-current/10")}>
                                    <item.icon size={20} />
                                </div>
                                <div className="min-w-0">
                                    <Typography variant="label" className="text-[10px] uppercase font-semibold text-slate-400 mb-0.5">{item.label}</Typography>
                                    <Typography variant="h4" className="leading-none text-base font-semibold">{item.value}</Typography>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Description Section */}
                    <AnimatePresence>
                        {meeting.description && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
                                    <CardHeader className="p-6 pb-3 border-b border-slate-50 bg-slate-50/30">
                                        <CardTitle className="text-[10px] uppercase font-semibold flex items-center gap-3">
                                            <Info size={14} className="text-blue-600" /> {t('info.description')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <Typography variant="p" className="text-slate-600 leading-relaxed text-sm font-medium italic border-l-2 border-blue-500 pl-4 py-1">
                                            {meeting.description}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Agenda Section */}
                    <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
                        <CardHeader className="p-6 py-5 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/50">
                            <CardTitle className="text-xs uppercase font-semibold flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md">
                                    <ListTodo size={14} />
                                </div>
                                {t('agenda.title')}
                            </CardTitle>
                            <Badge variant="secondary" className="h-6 px-2 font-semibold text-[10px] bg-white border-slate-200 text-slate-400 uppercase">
                                {t('agenda.points', { count: meeting.meetings_points?.length || 0 })}
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-0 divide-y divide-slate-50">
                            {meeting.meetings_points?.length > 0 ? (
                                meeting.meetings_points.map((point: any, index: number) => {
                                    const votes = point.meetings_votes || [];
                                    const oui = votes.filter((v: any) => v.vote === 'OUI').length;
                                    const non = votes.filter((v: any) => v.vote === 'NON').length;
                                    const neutre = votes.filter((v: any) => v.vote === 'NEUTRE').length;

                                    return (
                                        <div key={point.id} className="p-6 hover:bg-slate-50/50 transition-colors group relative">
                                            <div className="flex items-start gap-5">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-400 shrink-0 group-hover:bg-[#002B5B] group-hover:text-white transition-all shadow-inner">
                                                    {String(index + 1).padStart(2, '0')}
                                                </div>
                                                <div className="flex-1 space-y-4">
                                                    <div className="flex justify-between items-start gap-4">
                                                        <Typography variant="h3" className="leading-snug text-slate-900 text-sm font-semibold">{point.point}</Typography>
                                                        {point.type === 'VOTE' && (
                                                            <Badge variant="warning" className="h-6 px-2 font-semibold uppercase text-[10px] shrink-0">
                                                                <CheckCircle2 size={10} className="me-1.5" /> {t('agenda.submittedToVote')}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {point.type === 'VOTE' && votes.length > 0 && (
                                                        <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
                                                            <div className="flex h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                                                <div className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" style={{ width: `${(oui / votes.length) * 100}%` }} />
                                                                <div className="h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]" style={{ width: `${(non / votes.length) * 100}%` }} />
                                                                <div className="h-full bg-slate-300" style={{ width: `${(neutre / votes.length) * 100}%` }} />
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-[10px] md:text-xs font-bold uppercase">
                                                                <div className="flex flex-wrap items-center gap-4 md:gap-5">
                                                                    <span className="text-emerald-600 flex items-center gap-1.5">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                        {t('agenda.votes.for', { count: oui })}
                                                                    </span>
                                                                    <span className="text-rose-600 flex items-center gap-1.5">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                                        {t('agenda.votes.against', { count: non })}
                                                                    </span>
                                                                    <span className="text-slate-400 flex items-center gap-1.5">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                                        {t('agenda.votes.neutral', { count: neutre })}
                                                                    </span>
                                                                </div>
                                                                <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">Total: {votes.length}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-24 text-center flex flex-col items-center gap-5">
                                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-100 shadow-inner">
                                        <ListTodo size={32} />
                                    </div>
                                    <Typography variant="label" className="uppercase font-semibold text-slate-300 text-xs">{t('agenda.noPoints')}</Typography>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Area */}
                <div className="lg:col-span-4 space-y-10">
                    {/* Participants Card */}
                    <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
                        <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
                            <CardTitle className="text-[10px] uppercase font-semibold flex items-center gap-2">
                                <Users size={14} className="text-[#002B5B]" /> {t('participants.title')}
                            </CardTitle>
                            <Badge variant="secondary" className="h-5 px-1 font-mono text-[10px] bg-white border-slate-200">
                                {meeting.meetings_participants?.length || 0}
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-0 max-h-[450px] overflow-y-auto custom-scrollbar">
                            <div className="divide-y divide-slate-50">
                                {meeting.meetings_participants?.map((p: any) => {
                                    const inv = meeting.meetings_invitations?.find((i: any) => i.meetings_participant_id === p.id);
                                    const invStatus = inv?.status || 'PENDING';
                                    return (
                                        <div key={p.id} className="p-5 flex items-center gap-3 hover:bg-slate-50/30 transition-all group">
                                            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#002B5B] font-semibold text-xs shrink-0 group-hover:bg-[#002B5B] group-hover:text-white transition-all shadow-sm">
                                                {p.email.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <Typography variant="large" className="text-xs font-semibold group-hover:text-[#002B5B] transition-colors truncate">{p.email}</Typography>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <div className={cn(
                                                        "w-1 h-1 rounded-full",
                                                        invStatus === 'ACCEPTED' ? 'text-emerald-500 bg-current' : invStatus === 'REJECTED' ? 'text-rose-500 bg-current' : 'text-amber-500 bg-current'
                                                    )} />
                                                    <Typography variant="small" className="text-[9px] font-semibold uppercase opacity-40">{invStatus}</Typography>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Documents Card */}
                    <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm">
                        <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-[10px] uppercase font-semibold flex items-center gap-2">
                                <FileText size={14} className="text-[#002B5B]" /> {t('documents.title')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-3">
                            {meeting.meetings_documents?.length > 0 ? (
                                meeting.meetings_documents.map((doc: any) => (
                                    <a key={doc.id} href={isSafeDocumentUrl(doc.file_path) ? doc.file_path : undefined} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-white border border-transparent hover:border-blue-100 hover:shadow-lg transition-all group">
                                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-300 group-hover:text-blue-600 shadow-sm shrink-0 border border-slate-50 transition-colors">
                                            <FileText size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <Typography variant="small" className="font-semibold text-slate-700 uppercase text-[10px] block truncate">{doc.file_title}</Typography>
                                            <div className="flex items-center gap-1 mt-0.5 text-[9px] font-semibold text-blue-500/50 uppercase">
                                                <Download size={10} /> {t('documents.clickToView')}
                                            </div>
                                        </div>
                                    </a>
                                ))
                            ) : (
                                <div className="py-12 text-center flex flex-col items-center gap-4 opacity-20">
                                    <FileUp size={32} />
                                    <Typography variant="small" className="font-bold uppercase text-xs">{t('documents.noDocuments')}</Typography>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Meeting Summary & AI Insights */}
                    <AnimatePresence>
                        {(meeting.status === 'FINISHED' || meeting.summary || aiSummary) && isAdminOrDev && (
                            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                                <Card className={cn(
                                    "rounded-2xl border-slate-200 overflow-hidden shadow-2xl transition-all duration-500",
                                    aiSummary ? "bg-linear-to-br from-violet-50 to-blue-50 border-violet-100 shadow-violet-900/5" : "bg-white shadow-blue-900/5"
                                )}>
                                    <CardHeader className={cn(
                                        "p-6 border-b flex flex-row items-center justify-between",
                                        aiSummary ? "bg-violet-500/5 border-violet-100" : "bg-slate-50/50 border-slate-100"
                                    )}>
                                        <CardTitle className="text-[10px] uppercase font-semibold flex items-center gap-2">
                                            {aiSummary ? <Sparkles size={14} className="text-violet-600" /> : <TrendingUp size={14} className="text-[#002B5B]" />}
                                            {t('aiSummary.title')}
                                        </CardTitle>
                                        {!summaryEditing && (
                                            <Button variant="ghost" size="icon" onClick={startSummaryEdit} className="h-7 w-7 text-amber-600 hover:bg-white rounded-lg">
                                                <Pencil size={12} />
                                            </Button>
                                        )}
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-5">
                                        {summaryEditing ? (
                                            <div className="space-y-4">
                                                <div
                                                    contentEditable
                                                    onInput={(e) => setSummaryText(e.currentTarget.innerHTML)}
                                                    dangerouslySetInnerHTML={{ __html: summaryEditorHtml }}
                                                    className="bg-white border border-slate-200 rounded-2xl p-6 text-sm leading-relaxed min-h-[200px] focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all custom-scrollbar overflow-y-auto"
                                                />
                                                <div className="flex gap-2">
                                                    <Button
                                                        onClick={async () => {
                                                            setSummarySaving(true);
                                                            try {
                                                                const res = await fetch(`/api/meetings/${id}`, {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ summary: sanitizeHtml(summaryText), sendRescheduleNotification: false }),
                                                                });
                                                                const result = await res.json();
                                                                if (result.status) {
                                                                    toast.success(tc('success'));
                                                                    setSummaryEditing(false);
                                                                    fetchMeeting();
                                                                } else toast.error(result.message || tc('error'));
                                                            } catch { toast.error(tc('error')); }
                                                            finally { setSummarySaving(false); }
                                                        }}
                                                        disabled={summarySaving}
                                                        className="grow h-12 rounded-xl"
                                                    >
                                                        {summarySaving ? <Loader2 size={16} className="animate-spin" /> : tc('save')}
                                                    </Button>
                                                    <Button variant="outline" onClick={() => { setSummaryEditing(false); setSummaryText(meeting?.summary || ''); }} className="h-12 px-6 rounded-xl">
                                                        {tc('cancel')}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : aiSummary ? (
                                            <div className="space-y-6">
                                                <div
                                                    className="text-violet-900 leading-relaxed font-medium prose prose-sm max-w-none"
                                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(aiSummary.summary) }}
                                                />

                                                {aiSummary.keyDecisions?.length > 0 && (
                                                    <div className="space-y-3">
                                                        <Typography variant="label" className="text-xs uppercase text-violet-500 font-bold">Decisions</Typography>
                                                        {aiSummary.keyDecisions.map((d: string, i: number) => (
                                                            <div key={i} className="flex items-start gap-3 bg-white/50 p-3 rounded-xl border border-violet-100">
                                                                <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                                                <div className="text-slate-700 leading-snug prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(d) }} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <Button
                                                    onClick={() => setShowAiModal(true)}
                                                    className="w-full h-9 bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-900/10 rounded-lg font-semibold text-[10px] uppercase"
                                                >
                                                    {t('aiSummary.viewFull')}
                                                    <ChevronRight className="ms-1 w-3 h-3" />
                                                </Button>
                                            </div>
                                        ) : summaryText ? (
                                            <div
                                                className="text-slate-700 leading-relaxed font-medium prose prose-sm max-w-none"
                                                dangerouslySetInnerHTML={{ __html: sanitizeHtml(summaryText) }}
                                            />
                                        ) : (
                                            <div className="py-12 text-center space-y-4">
                                                <TrendingUp size={32} className="mx-auto text-slate-100" />
                                                <Typography variant="label" className="uppercase font-bold text-slate-300 block">{t('aiSummary.noSummary')}</Typography>
                                                <Button variant="ghost" onClick={startSummaryEdit} className="text-blue-600 hover:bg-blue-50 font-semibold text-[10px] uppercase h-9 px-5 rounded-lg border border-blue-100">
                                                    {t('aiSummary.writeSummary')}
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Comprehensive Edit Modal */}
            <Modal
                isOpen={modal === 'edit'}
                onClose={closeModal}
                title={t('modals.edit.title')}
                description={t('modals.edit.description')}
                size="8xl"
            >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    <div className="lg:col-span-7 space-y-8">
                        <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-6">
                            <Typography variant="label" className="flex items-center gap-3 uppercase text-xs text-blue-600 font-semibold">
                                <Info size={16} /> {t('modals.edit.foundations')}
                            </Typography>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <div className="md:col-span-2">
                                    <Input
                                        label={`${t('modals.edit.subject')} *`}
                                        value={form.subject}
                                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                        placeholder={t('modals.edit.subjectPlaceholder')}
                                        icon={FileText}
                                    />
                                </div>
                                <Select
                                    label={t('modals.edit.type')}
                                    value={form.type}
                                    onValueChange={(val) => setForm({ ...form, type: val as MeetingType })}
                                    options={[
                                        { value: 'ORDINAIRE', label: tm('types.ordinaire') },
                                        { value: 'EXTRAORDINAIRE', label: tm('types.extraordinaire') },
                                        { value: 'COMPLEMENTAIRE', label: tm('types.complementaire') },
                                        { value: 'DELEGUES', label: tm('types.delegues') }
                                    ]}
                                />
                                <div className="flex flex-col gap-2">
                                    <Typography variant="label" className="text-slate-400">{t('modals.edit.securityContext')}</Typography>
                                    <Badge variant="secondary" className="h-14 rounded-2xl bg-white border-slate-100 flex items-center justify-center gap-2">
                                        <ShieldAlert size={16} className="text-blue-500" />
                                        <span className="font-black text-sm uppercase tracking-widest">{t('modals.edit.adminAccess')}</span>
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50/50 p-10 rounded-[2.5rem] border border-slate-100 space-y-8">
                            <Typography variant="label" className="flex items-center gap-3 uppercase tracking-[0.2em] text-sm text-blue-600 font-black">
                                <Calendar size={16} /> {t('modals.edit.timeVenue')}
                            </Typography>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                <Input label={`${t('modals.edit.date')} *`} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} icon={Calendar} />
                                <Input label={`${t('modals.edit.time')} *`} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} icon={Clock} />

                                <Select
                                    label={t('modals.edit.mode')}
                                    value={form.mode}
                                    onValueChange={(val) => setForm({ ...form, mode: val as MeetingMode })}
                                    options={[
                                        { value: 'IN_PERSON', label: tm('form.modes.inPerson') },
                                        { value: 'ONLINE', label: tm('form.modes.online') },
                                        { value: 'HYBRID', label: tm('form.modes.hybrid') }
                                    ]}
                                />

                                <Select
                                    label={t('modals.edit.duration')}
                                    value={form.duration}
                                    onValueChange={(val) => setForm({ ...form, duration: val as MeetingDuration })}
                                    options={MEETING_DURATION_ORDER
                                        .filter(d => user?.role === 'DEVELOPER' || isWithinDurationLimit(d, user?.meeting_time_limit || 'ONE_HOUR'))
                                        .map(d => ({ value: d, label: tm(`form.durations.${MEETING_DURATION_FORM_KEYS[d]}`) }))}
                                />
                                <div className="md:col-span-2">
                                    <Input
                                        label={t('modals.edit.location')}
                                        value={form.location}
                                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                                        placeholder={t('modals.edit.locationPlaceholder')}
                                        icon={MapPin}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                            <div className="flex items-center justify-between">
                                <Typography variant="label" className="uppercase tracking-widest text-sm font-black text-slate-400">{t('modals.edit.contextualDescription')}</Typography>
                                <AiFeatureGuard>
                                    <Button variant="outline" size="sm" onClick={handlePolishDescription} disabled={polishLoading} className="rounded-xl border-blue-100 bg-blue-50/30 text-blue-600 h-10">
                                        {polishLoading ? <Loader2 size={16} className="animate-spin me-2" /> : <Wand2 size={16} className="me-2" />}
                                        {polishLoading ? tc('processing') : t('modals.edit.generateDescription')}
                                    </Button>
                                </AiFeatureGuard>
                            </div>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                rows={6}
                                className="bg-slate-50/50 border-slate-100 focus:bg-white transition-all rounded-3xl p-8 text-base leading-relaxed"
                            />
                        </div>
                    </div>

                    <div className="lg:col-span-5 space-y-8">
                        <Card className="rounded-[2.5rem] border-slate-100 overflow-hidden shadow-sm">
                            <CardHeader className="p-10 pb-0">
                                <CardTitle className="text-base uppercase tracking-widest font-black flex items-center gap-3">
                                    <Users size={18} className="text-blue-500" /> {t('participants.title')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-10 pt-6">
                                <UserPicker
                                    users={companyUsers}
                                    value={form.participants}
                                    onChange={(val) => setForm((f) => ({ ...f, participants: val }))}
                                    allowFreeText={true}
                                    placeholder={tc('search')}
                                />
                            </CardContent>
                        </Card>

                        <Card className="rounded-[2.5rem] border-slate-100 overflow-hidden shadow-sm">
                            <CardHeader className="p-10 pb-0 flex flex-row items-center justify-between">
                                <CardTitle className="text-base uppercase tracking-widest font-black flex items-center gap-3">
                                    <ListTodo size={18} className="text-blue-500" /> Agenda Points
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    <AiFeatureGuard>
                                        <Button variant="outline" size="icon" onClick={handleAiSuggest} disabled={aiSuggestLoading} className="h-10 w-10 rounded-xl border-blue-100 text-blue-500 hover:bg-blue-50">
                                            {aiSuggestLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                        </Button>
                                    </AiFeatureGuard>
                                    <Button variant="primary" size="icon" onClick={() => setForm({ ...form, points: [...form.points, { point: '', type: 'SIMPLE' }] })} className="h-10 w-10 rounded-xl shadow-lg shadow-blue-900/20">
                                        <Plus size={20} />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-10 pt-6 space-y-4">
                                <div className="max-h-[350px] overflow-y-auto pr-2 custom-scrollbar space-y-4">
                                    {form.points.map((p, i) => (
                                        <div key={i} className="flex gap-3 items-center group">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={p.point}
                                                    onChange={(e) => {
                                                        const newPoints = [...form.points];
                                                        newPoints[i].point = e.target.value;
                                                        setForm({ ...form, points: newPoints });
                                                    }}
                                                    placeholder={t('modals.edit.describeItem')}
                                                    className="w-full h-12 px-5 rounded-xl border border-slate-100 bg-slate-50/50 focus:bg-white focus:border-[#002B5B] outline-none text-sm font-bold text-slate-700 transition-all shadow-xs"
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
                                                    className="w-full h-12 px-2 rounded-xl border border-slate-100 bg-slate-50/50 focus:bg-white focus:border-[#002B5B] outline-none text-sm font-black uppercase tracking-widest text-[#002B5B] transition-all cursor-pointer"
                                                >
                                                    <option value="SIMPLE">Info</option>
                                                    <option value="VOTE">Vote</option>
                                                </select>
                                            </div>
                                            <Button variant="ghost" size="icon" onClick={() => setForm({ ...form, points: form.points.filter((_, idx) => idx !== i) })}
                                                className="h-12 w-12 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                                <Trash2 size={18} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[2.5rem] border-slate-100 overflow-hidden shadow-sm">
                            <CardHeader className="p-10 pb-0 flex flex-row items-center justify-between">
                                <CardTitle className="text-base uppercase tracking-widest font-black flex items-center gap-3">
                                    <FileUp size={18} className="text-blue-500" /> {t('documents.title')}
                                </CardTitle>
                                <label className="h-10 w-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all border border-slate-100 flex items-center justify-center cursor-pointer shadow-xs">
                                    <Plus size={20} />
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
                                        }
                                    }} />
                                </label>
                            </CardHeader>
                            <CardContent className="p-10 pt-6 space-y-3">
                                {form.documents.map((doc: any, i: number) => (
                                    <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
                                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                                            <FileText size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <Typography variant="small" className="truncate font-bold text-slate-700 uppercase tracking-widest text-sm block">{doc.file_title}</Typography>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={() => setForm(f => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) }))}
                                            className="h-10 w-10 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all rounded-xl">
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-4 mt-12 pt-10 border-t border-slate-100">
                    <Button variant="outline" onClick={closeModal} className="px-12 h-16 rounded-2xl font-black uppercase tracking-widest text-sm">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="px-16 h-16 rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl shadow-blue-900/20 min-w-[240px]">
                        {saving ? <Loader2 size={22} className="animate-spin" /> : tc('save')}
                    </Button>
                </div>
            </Modal>

            {/* Reschedule Modal */}
            <Modal isOpen={modal === 'reschedule'} onClose={closeModal} title={t('modals.reschedule.title')} size="sm">
                <div className="space-y-6 pt-4">
                    <Input label={`${t('modals.reschedule.newDate')} *`} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} icon={Calendar} />
                    <Input label={`${t('modals.reschedule.newTime')} *`} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} icon={Clock} />
                </div>
                <div className="flex flex-col sm:flex-row gap-4 mt-12">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-14 rounded-xl font-black">{tc('cancel')}</Button>
                    <Button onClick={handleReschedule} disabled={saving} className="flex-1 h-14 rounded-xl font-black shadow-lg shadow-blue-900/20">
                        {saving ? tc('processing') : t('actions.reschedule')}
                    </Button>
                </div>
            </Modal>

            {/* Confirm Modals */}
            <ConfirmModal isOpen={modal === 'cancel'} onClose={closeModal} onConfirm={handleCancel}
                title={t('modals.cancel.title')} description={t('modals.cancel.description', { subject: meeting?.subject })}
                confirmLabel={t('modals.cancel.title')} confirmVariant="danger" loading={saving}
                icon={<Ban size={24} className="text-orange-500" />} />

            <ConfirmModal isOpen={modal === 'delete'} onClose={closeModal} onConfirm={handleDelete}
                title={t('modals.delete.title')} description={t('modals.delete.description', { subject: meeting?.subject })}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />

            {/* AI Summary Full Modal */}
            <Modal isOpen={showAiModal} onClose={() => setShowAiModal(false)} title={t('aiSummary.fullTitle')} size="5xl">
                {aiSummary && (
                    <div className="space-y-8">
                        <div className={cn(
                            "p-8 rounded-[2.5rem] border-2 relative overflow-hidden",
                            aiSummary.overallStatus === 'PRODUCTIVE' ? 'bg-emerald-50/50 border-emerald-100' :
                                aiSummary.overallStatus === 'CRITIQUE' ? 'bg-rose-50/50 border-rose-100' : 'bg-slate-50 border-slate-100'
                        )}>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
                                <div
                                    className="text-slate-700 leading-relaxed font-medium grow italic prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(aiSummary.summary) }}
                                />
                                <Badge variant={aiSummary.overallStatus === 'PRODUCTIVE' ? 'success' : aiSummary.overallStatus === 'CRITIQUE' ? 'danger' : 'secondary'} className="h-10 px-6 text-sm uppercase font-black tracking-widest shadow-sm shrink-0">
                                    {aiSummary.overallStatus}
                                </Badge>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {aiSummary.keyDecisions?.length > 0 && (
                                <Card className="bg-emerald-50/30 border-emerald-100 rounded-[2rem] shadow-none">
                                    <CardHeader className="p-8 pb-4">
                                        <CardTitle className="text-sm uppercase tracking-widest font-black text-emerald-700 flex items-center gap-2">
                                            <CheckCircle2 size={16} /> {t('aiSummary.decisions')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-8 pt-0 space-y-3">
                                        {aiSummary.keyDecisions.map((d: string, i: number) => (
                                            <div key={i} className="flex items-start gap-3 bg-white/60 p-4 rounded-2xl border border-emerald-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                                <div className="text-slate-700 font-medium prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(d) }} />
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                            {aiSummary.actionItems?.length > 0 && (
                                <Card className="bg-amber-50/30 border-amber-100 rounded-[2rem] shadow-none">
                                    <CardHeader className="p-8 pb-4">
                                        <CardTitle className="text-sm uppercase tracking-widest font-black text-amber-700 flex items-center gap-2">
                                            <Zap size={16} /> {t('aiSummary.actions')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-8 pt-0 space-y-3">
                                        {aiSummary.actionItems.map((a: string, i: number) => (
                                            <div key={i} className="flex items-start gap-3 bg-white/60 p-4 rounded-2xl border border-amber-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                                <Typography variant="small" className="text-slate-700 font-medium">{a}</Typography>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {aiSummary.voteResults?.length > 0 && (
                            <Card className="bg-blue-50/30 border-blue-100 rounded-[2rem] shadow-none">
                                <CardHeader className="p-8 pb-4">
                                    <CardTitle className="text-sm uppercase tracking-widest font-black text-blue-700 flex items-center gap-2">
                                        <TrendingUp size={16} /> {t('aiSummary.voteResults')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-8 pt-0 space-y-4">
                                    {aiSummary.voteResults.map((v: any, i: number) => (
                                        <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/60 p-5 rounded-2xl border border-blue-100">
                                            <div className="space-y-1">
                                                <Typography variant="small" className="font-bold text-slate-800">{v.point}</Typography>
                                                <Typography variant="small" className="text-sm text-slate-400 uppercase tracking-widest">{v.details}</Typography>
                                            </div>
                                            <Badge variant={v.result === 'ADOPTÉ' ? 'success' : v.result === 'REJETÉ' ? 'danger' : 'secondary'} className="h-8 px-4 text-sm font-black uppercase tracking-widest">
                                                {v.result}
                                            </Badge>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        <div className="bg-slate-50 border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-white rounded-xl border border-slate-100 flex items-center justify-center text-slate-400">
                                    <Users size={20} />
                                </div>
                                <Typography variant="large" className="text-sm font-black uppercase tracking-widest text-slate-500">{t('aiSummary.attendance')}</Typography>
                            </div>
                            <Typography variant="h3" className="text-2xl text-[#002B5B] font-black">{aiSummary.attendance}</Typography>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Overwrite PV Modal */}
            <Modal
                isOpen={showOverwriteModal}
                onClose={() => setShowOverwriteModal(false)}
                title={tpv('modals.overwrite.title')}
                description={tpv('modals.overwrite.description')}
            >
                <div className="flex justify-end gap-3 mt-6">
                    <Button variant="outline" onClick={() => setShowOverwriteModal(false)}>
                        {tpv('modals.overwrite.cancel')}
                    </Button>
                    <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleAiPv(true)}
                        disabled={aiPvLoading}
                    >
                        {aiPvLoading ? <Loader2 className="animate-spin me-2" size={16} /> : <RefreshCw className="me-2" size={16} />}
                        {tpv('modals.overwrite.confirm')}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            className={cn(
                "flex min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
                className
            )}
            {...props}
        />
    )
}
