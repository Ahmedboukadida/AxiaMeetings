'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UserPlus, Building2, Globe, Package, Clock,
    CheckCircle2, XCircle, Loader2, ChevronRight,
    User, Mail, ShieldCheck, X, Sparkles, AlertTriangle, Trash2
} from 'lucide-react';
import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Badge } from '@/components/ui/badges';
import { ConfirmModal } from '@/components/ui/modals';

interface SignupRequest {
    id: number;
    fullname: string;
    email: string;
    company_name: string;
    company_url?: string;
    pack_id: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    rejection_reason?: string;
    reviewed_at?: string;
    provisioned_company_id?: number;
    created_at: string;
}

export default function SignupRequestsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('SignupRequests');
    const tc = useTranslations('Common');

    const [requests, setRequests] = useState<SignupRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<SignupRequest | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [confirmApprove, setConfirmApprove] = useState(false);
    const [confirmReject, setConfirmReject] = useState(false);
    const [isActing, setIsActing] = useState(false);

    // Deletion states
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    const [selectedToDelete, setSelectedToDelete] = useState<SignupRequest | null>(null);
    const [bulkSelected, setBulkSelected] = useState<SignupRequest[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchRequests = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/signup-requests');
            const result = await res.json();
            if (result.status && result.data) setRequests(result.data);
            else toast.error(t('toast.fetchError'));
        } catch { toast.error(t('toast.fetchError')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (user?.role === UserRole.DEVELOPER) fetchRequests(); }, [user]);

    const handleAction = async (action: 'APPROVE' | 'REJECT') => {
        if (!selected) return;
        setIsActing(true);
        try {
            const res = await fetch('/api/signup-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requestId: selected.id,
                    action,
                    rejection_reason: action === 'REJECT' ? rejectionReason : undefined,
                }),
            });
            const result = await res.json();
            if (result.status) {
                const msg = action === 'APPROVE' ? t('toast.approved') : t('toast.rejected');
                toast.success(msg);
                setSelected(result.data);
                setRejectionReason('');
                fetchRequests();
            } else {
                toast.error(result.message || t('toast.actionError'));
            }
        } catch { toast.error(t('toast.actionError')); }
        finally {
            setIsActing(false);
            setConfirmApprove(false);
            setConfirmReject(false);
        }
    };

    const openDelete = (r: SignupRequest) => {
        setSelectedToDelete(r);
        setConfirmDelete(true);
    };

    const handleDelete = async () => {
        if (!selectedToDelete) return;
        setSaving(true);
        try {
            const res = await fetch('/api/signup-requests', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedToDelete.id }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(t('toast.deleted'));
                fetchRequests();
                if (selected?.id === selectedToDelete.id) {
                    setSelected(null);
                }
                setConfirmDelete(false);
                setSelectedToDelete(null);
            } else {
                toast.error(result.message || tc('toast.error'));
            }
        } catch {
            toast.error(tc('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const handleBulkDelete = async () => {
        if (bulkSelected.length === 0) return;
        setSaving(true);
        try {
            const res = await fetch('/api/signup-requests', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: bulkSelected.map(r => r.id) }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(t('toast.bulkDeleted'));
                fetchRequests();
                if (selected && bulkSelected.some(r => r.id === selected.id)) {
                    setSelected(null);
                }
                setConfirmBulkDelete(false);
                setBulkSelected([]);
            } else {
                toast.error(result.message || tc('toast.error'));
            }
        } catch {
            toast.error(tc('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const statusVariant = (status: string) => {
        if (status === 'APPROVED') return 'bg-green-50 text-green-700 border-green-200';
        if (status === 'REJECTED') return 'bg-red-50 text-red-700 border-red-200';
        return 'bg-amber-50 text-amber-700 border-amber-200';
    };

    const statusLabel = (status: string) => {
        if (status === 'APPROVED') return t('status.approved');
        if (status === 'REJECTED') return t('status.rejected');
        return t('status.pending');
    };

    const pendingCount = requests.filter(r => r.status === 'PENDING').length;
    const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
    const rejectedCount = requests.filter(r => r.status === 'REJECTED').length;

    const columns: Column<SignupRequest>[] = [
        {
            accessorKey: 'fullname',
            header: t('table.requester'),
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <User size={14} className="text-[#002B5B]" />
                    </div>
                    <div>
                        <p className="text-slate-800 font-bold text-xs">{row.original.fullname}</p>
                        <p className="text-slate-500 text-[11px]">{row.original.email}</p>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'company_name',
            header: t('table.company'),
            cell: ({ row }) => (
                <div>
                    <p className="text-slate-700 font-semibold text-xs">{row.original.company_name}</p>
                    {row.original.company_url && (
                        <p className="text-slate-400 text-[11px]">{row.original.company_url}</p>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'pack_id',
            header: t('table.pack'),
            cell: ({ row }) => (
                <Badge variant="default" className="bg-blue-50 text-[#002B5B] border-blue-100 text-[10px] font-black uppercase">
                    <Package size={10} className="mr-1" /> Pack #{row.original.pack_id}
                </Badge>
            ),
        },
        {
            accessorKey: 'created_at',
            header: t('table.date'),
            cell: ({ row }) => (
                <p className="text-slate-400 text-xs font-medium">
                    {new Date(row.original.created_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
            ),
        },
        {
            accessorKey: 'status',
            header: t('table.status'),
            cell: ({ row }) => (
                <Badge variant="default" className={`${statusVariant(row.original.status)} text-[10px] font-black uppercase`}>
                    {row.original.status === 'APPROVED' && <CheckCircle2 size={10} className="mr-1" />}
                    {row.original.status === 'REJECTED' && <XCircle size={10} className="mr-1" />}
                    {row.original.status === 'PENDING' && <Clock size={10} className="mr-1" />}
                    {statusLabel(row.original.status)}
                </Badge>
            ),
        },
        {
            id: 'actions',
            header: tc('actions') || 'Actions',
            enableSorting: false,
            cell: ({ row }) => (
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSelected(row.original); setRejectionReason(''); }}
                        className="h-7 w-7 text-[#002B5B] hover:bg-blue-50 rounded-lg"
                    >
                        <ChevronRight size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDelete(row.original);
                        }}
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>
            ),
        },
    ];

    const bulkActions: BulkAction<SignupRequest>[] = [{
        label: tc('delete') || 'Supprimer',
        icon: <Trash2 size={14} />,
        variant: 'danger',
        onClick: (rows) => { setBulkSelected(rows); setConfirmBulkDelete(true); },
    }];

    if (authLoading || isLoading) return (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
            <Typography variant="label">{tc('loading')}</Typography>
        </div>
    );

    return (
        <div className="space-y-8 pb-20">
            {/* Header */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50/50 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 -z-10" />
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                        <div className="w-12 h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-[inherit]" />
                            <UserPlus size={22} />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block text-[11px] font-bold uppercase">
                                {t('subtitle', { total: requests.length })}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-100 text-center">
                            <p className="text-amber-700 font-black text-lg">{pendingCount}</p>
                            <p className="text-amber-600 text-[10px] font-bold uppercase">{t('stats.pending')}</p>
                        </div>
                        <div className="px-4 py-2 rounded-xl bg-green-50 border border-green-100 text-center">
                            <p className="text-green-700 font-black text-lg">{approvedCount}</p>
                            <p className="text-green-600 text-[10px] font-bold uppercase">{t('stats.approved')}</p>
                        </div>
                        <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-100 text-center">
                            <p className="text-red-700 font-black text-lg">{rejectedCount}</p>
                            <p className="text-red-600 text-[10px] font-bold uppercase">{t('stats.rejected')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Table */}
                <div className={`${selected ? 'lg:col-span-3' : 'lg:col-span-5'} bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all duration-300`}>
                    <DataTable
                        columns={columns}
                        data={requests}
                        searchable
                        searchPlaceholder={t('searchPlaceholder')}
                        bulkActions={bulkActions}
                        emptyMessage={t('emptyMessage')}
                        pagesize={10}
                    />
                </div>

                {/* Detail Panel */}
                <AnimatePresence>
                    {selected && (
                        <motion.div
                            key="request-detail"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                            className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col"
                        >
                            {/* Panel Header */}
                            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                        <UserPlus size={14} className="text-[#002B5B]" />
                                    </div>
                                    <p className="text-slate-800 font-bold text-sm">{selected.fullname}</p>
                                </div>
                                <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Status badge */}
                                <Badge variant="default" className={`${statusVariant(selected.status)} text-xs font-black uppercase px-3 py-1.5`}>
                                    {selected.status === 'APPROVED' && <CheckCircle2 size={12} className="mr-1.5" />}
                                    {selected.status === 'REJECTED' && <XCircle size={12} className="mr-1.5" />}
                                    {selected.status === 'PENDING' && <Clock size={12} className="mr-1.5" />}
                                    {statusLabel(selected.status)}
                                </Badge>

                                {/* Info rows */}
                                <div className="space-y-3">
                                    <InfoRow icon={<Mail size={13} />} label={t('detail.email')} value={selected.email} />
                                    <InfoRow icon={<Building2 size={13} />} label={t('detail.company')} value={selected.company_name} />
                                    {selected.company_url && (
                                        <InfoRow icon={<Globe size={13} />} label={t('detail.url')} value={selected.company_url} />
                                    )}
                                    <InfoRow icon={<Package size={13} />} label={t('detail.pack')} value={`Pack #${selected.pack_id}`} />
                                    <InfoRow icon={<Clock size={13} />} label={t('detail.submitted')} value={new Date(selected.created_at).toLocaleString()} />
                                    {selected.reviewed_at && (
                                        <InfoRow icon={<CheckCircle2 size={13} />} label={t('detail.reviewed')} value={new Date(selected.reviewed_at).toLocaleString()} />
                                    )}
                                    {selected.provisioned_company_id && (
                                        <InfoRow icon={<ShieldCheck size={13} />} label={t('detail.provisionedId')} value={`Company ID: ${selected.provisioned_company_id}`} />
                                    )}
                                    {selected.rejection_reason && (
                                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                                            <p className="text-[10px] uppercase font-black text-red-400 mb-1">{t('detail.rejectionReason')}</p>
                                            <p className="text-red-700 text-sm">{selected.rejection_reason}</p>
                                        </div>
                                    )}
                                </div>

                                {/* APPROVED confirmation */}
                                {selected.status === 'APPROVED' && (
                                    <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <CheckCircle2 size={14} className="text-green-500" />
                                            <p className="text-[10px] uppercase font-black text-green-600">{t('detail.provisioned')}</p>
                                        </div>
                                        <p className="text-green-700 text-sm">{t('detail.provisionedDesc')}</p>
                                    </div>
                                )}
                            </div>

                            {/* Action Buttons — only for PENDING */}
                            {selected.status === 'PENDING' && (
                                <div className="p-5 border-t border-slate-100 space-y-3">
                                    {/* Rejection reason */}
                                    <div>
                                        <p className="text-[10px] uppercase font-black text-slate-400 mb-2">{t('detail.rejectionReasonLabel')}</p>
                                        <textarea
                                            value={rejectionReason}
                                            onChange={e => setRejectionReason(e.target.value)}
                                            placeholder={t('detail.rejectionPlaceholder')}
                                            rows={2}
                                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#002B5B]/20 focus:border-[#002B5B] transition-all resize-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button
                                            onClick={() => setConfirmReject(true)}
                                            variant="ghost"
                                            className="h-10 text-red-600 hover:bg-red-50 hover:text-red-700 border border-red-100"
                                        >
                                            <XCircle size={15} className="mr-1.5" /> {t('actions.reject')}
                                        </Button>
                                        <Button
                                            onClick={() => setConfirmApprove(true)}
                                            className="h-10 bg-green-600 hover:bg-green-700 text-white"
                                        >
                                            <Sparkles size={15} className="mr-1.5" /> {t('actions.approve')}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Confirm Approve */}
            <ConfirmModal
                isOpen={confirmApprove}
                onClose={() => setConfirmApprove(false)}
                onConfirm={() => handleAction('APPROVE')}
                title={t('modal.approveTitle')}
                description={t('modal.approveDesc', { name: selected?.fullname || '', company: selected?.company_name || '' })}
                confirmLabel={t('modal.approveConfirm')}
                loading={isActing}
                icon={<CheckCircle2 size={24} className="text-green-500" />}
            />

            {/* Confirm Reject */}
            <ConfirmModal
                isOpen={confirmReject}
                onClose={() => setConfirmReject(false)}
                onConfirm={() => handleAction('REJECT')}
                title={t('modal.rejectTitle')}
                description={t('modal.rejectDesc', { name: selected?.fullname || '' })}
                confirmLabel={t('modal.rejectConfirm')}
                confirmVariant="danger"
                loading={isActing}
                icon={<AlertTriangle size={24} className="text-red-500" />}
            />

            {/* Confirm Delete */}
            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={handleDelete}
                title={t('delete.title') || 'Supprimer la demande'}
                description={t('delete.description') || `Êtes-vous sûr de vouloir supprimer la demande d'inscription de ${selectedToDelete?.fullname} (${selectedToDelete?.company_name}) ?`}
                confirmLabel={tc('delete') || 'Supprimer'}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />

            {/* Confirm Bulk Delete */}
            <ConfirmModal
                isOpen={confirmBulkDelete}
                onClose={() => setConfirmBulkDelete(false)}
                onConfirm={handleBulkDelete}
                title={t('delete.bulkTitle') || 'Supprimer plusieurs demandes'}
                description={t('delete.bulkDescription', { count: bulkSelected.length })}
                confirmLabel={tc('delete') || 'Supprimer'}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />
        </div>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0 mt-0.5">
                {icon}
            </div>
            <div>
                <p className="text-[10px] uppercase font-black text-slate-400">{label}</p>
                <p className="text-slate-700 text-sm font-semibold break-all">{value}</p>
            </div>
        </div>
    );
}
