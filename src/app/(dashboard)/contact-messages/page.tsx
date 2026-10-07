'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mail, Send, Clock, Reply, CheckCircle2, Loader2,
    ChevronRight, User, ArrowLeft, Inbox, X, Trash2
} from 'lucide-react';
import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Badge } from '@/components/ui/badges';
import { ConfirmModal } from '@/components/ui/modals';

interface ContactMessage {
    id: number;
    sender_name?: string;
    sender_email: string;
    subject: string;
    message: string;
    created_at: string;
    reply_content?: string;
    replied_at?: string;
}

export default function ContactMessagesPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('ContactMessages');
    const tc = useTranslations('Common');

    const [messages, setMessages] = useState<ContactMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState<ContactMessage | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [isReplying, setIsReplying] = useState(false);

    // Deletion states
    const [modal, setModal] = useState<'delete' | 'bulk-delete' | null>(null);
    const [selectedToDelete, setSelectedToDelete] = useState<ContactMessage | null>(null);
    const [bulkSelected, setBulkSelected] = useState<ContactMessage[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchMessages = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/contact-messages');
            const result = await res.json();
            if (result.status && result.data) setMessages(result.data);
            else toast.error(t('toast.fetchError'));
        } catch { toast.error(t('toast.fetchError')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (user?.role === UserRole.DEVELOPER) fetchMessages(); }, [user]);

    const handleReply = async () => {
        if (!selected || !replyContent.trim()) { toast.error(t('toast.replyRequired')); return; }
        setIsReplying(true);
        try {
            const res = await fetch('/api/contact-messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: selected.id, replyContent }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(t('toast.replySent'));
                setSelected(result.data);
                setReplyContent('');
                fetchMessages();
            } else {
                toast.error(result.message || t('toast.replyError'));
            }
        } catch { toast.error(t('toast.replyError')); }
        finally { setIsReplying(false); }
    };

    const openDelete = (m: ContactMessage) => {
        setSelectedToDelete(m);
        setModal('delete');
    };

    const closeModal = () => {
        setModal(null);
        setSelectedToDelete(null);
    };

    const handleDelete = async () => {
        if (!selectedToDelete) return;
        setSaving(true);
        try {
            const res = await fetch('/api/contact-messages', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedToDelete.id }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(t('toast.deleted'));
                fetchMessages();
                if (selected?.id === selectedToDelete.id) {
                    setSelected(null);
                }
                closeModal();
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
            const res = await fetch('/api/contact-messages', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: bulkSelected.map(m => m.id) }),
            });
            const result = await res.json();
            if (result.status) {
                toast.success(t('toast.bulkDeleted'));
                fetchMessages();
                if (selected && bulkSelected.some(m => m.id === selected.id)) {
                    setSelected(null);
                }
                setModal(null);
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

    const repliedCount = messages.filter(m => m.reply_content).length;

    const columns: Column<ContactMessage>[] = [
        {
            accessorKey: 'sender_email',
            header: t('table.sender'),
            cell: ({ row }) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <User size={14} className="text-[#002B5B]" />
                    </div>
                    <div>
                        {row.original.sender_name && (
                            <p className="text-slate-800 font-bold text-xs">{row.original.sender_name}</p>
                        )}
                        <p className="text-slate-500 text-[11px]">{row.original.sender_email}</p>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'subject',
            header: t('table.subject'),
            cell: ({ row }) => (
                <p className="text-slate-700 font-semibold text-sm truncate max-w-xs">{row.original.subject}</p>
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
            accessorKey: 'reply_content',
            header: t('table.status'),
            cell: ({ row }) => (
                row.original.reply_content ? (
                    <Badge variant="primary" className="bg-green-50 text-green-700 border-green-200 text-[10px] font-black uppercase">
                        <CheckCircle2 size={10} className="mr-1" /> {t('replied')}
                    </Badge>
                ) : (
                    <Badge variant="default" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-black uppercase">
                        <Clock size={10} className="mr-1" /> {t('pending')}
                    </Badge>
                )
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
                        onClick={() => { setSelected(row.original); setReplyContent(''); }}
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

    const bulkActions: BulkAction<ContactMessage>[] = [{
        label: tc('delete') || 'Supprimer',
        icon: <Trash2 size={14} />,
        variant: 'danger',
        onClick: (rows) => { setBulkSelected(rows); setModal('bulk-delete'); },
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
                            <Inbox size={22} />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block text-[11px] font-bold uppercase">
                                {t('subtitle', { total: messages.length, replied: repliedCount })}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-100 text-center">
                            <p className="text-amber-700 font-black text-lg">{messages.length - repliedCount}</p>
                            <p className="text-amber-600 text-[10px] font-bold uppercase">{t('awaiting')}</p>
                        </div>
                        <div className="px-4 py-2 rounded-xl bg-green-50 border border-green-100 text-center">
                            <p className="text-green-700 font-black text-lg">{repliedCount}</p>
                            <p className="text-green-600 text-[10px] font-bold uppercase">{t('repliedLabel')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main grid — table + detail panel */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Messages Table */}
                <div className={`${selected ? 'lg:col-span-3' : 'lg:col-span-5'} bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all duration-300`}>
                    <DataTable
                        columns={columns}
                        data={messages}
                        searchable
                        searchPlaceholder={t('searchPlaceholder')}
                        bulkActions={bulkActions}
                        emptyMessage={t('emptyMessage')}
                        pagesize={10}
                    />
                </div>

                {/* Detail + Reply Panel */}
                <AnimatePresence>
                    {selected && (
                        <motion.div
                            key="detail-panel"
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
                                        <Mail size={14} className="text-[#002B5B]" />
                                    </div>
                                    <div>
                                        <p className="text-slate-800 font-bold text-sm">{selected.sender_name || selected.sender_email}</p>
                                        {selected.sender_name && <p className="text-slate-400 text-xs">{selected.sender_email}</p>}
                                    </div>
                                </div>
                                <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Message */}
                                <div>
                                    <p className="text-[10px] uppercase font-black text-slate-400 mb-2">{t('detail.subject')}</p>
                                    <p className="text-slate-800 font-bold text-sm">{selected.subject}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-black text-slate-400 mb-2">{t('detail.message')}</p>
                                    <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                                </div>
                                <p className="text-[10px] text-slate-300 font-medium">
                                    {new Date(selected.created_at).toLocaleString()}
                                </p>

                                {/* Existing reply */}
                                {selected.reply_content && (
                                    <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CheckCircle2 size={14} className="text-green-500" />
                                            <p className="text-[10px] uppercase font-black text-green-600">{t('detail.replied')}</p>
                                        </div>
                                        <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{selected.reply_content}</p>
                                        {selected.replied_at && (
                                            <p className="text-[10px] text-slate-400 mt-2">
                                                {new Date(selected.replied_at).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Reply Box */}
                            <div className="p-5 border-t border-slate-100">
                                <p className="text-[10px] uppercase font-black text-slate-400 mb-2">
                                    {selected.reply_content ? t('detail.editReply') : t('detail.writeReply')}
                                </p>
                                <textarea
                                    value={replyContent}
                                    onChange={e => setReplyContent(e.target.value)}
                                    placeholder={t('detail.replyPlaceholder')}
                                    rows={4}
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#002B5B]/20 focus:border-[#002B5B] transition-all resize-none"
                                />
                                <Button
                                    onClick={handleReply}
                                    disabled={isReplying || !replyContent.trim()}
                                    className="w-full mt-3 h-10"
                                >
                                    {isReplying ? <Loader2 size={15} className="animate-spin mr-2" /> : <Reply size={15} className="mr-2" />}
                                    {t('detail.sendReply')}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={modal === 'delete'}
                onClose={closeModal}
                onConfirm={handleDelete}
                title={t('delete.title') || 'Supprimer le message'}
                description={t('delete.description') || `Êtes-vous sûr de vouloir supprimer le message de ${selectedToDelete?.sender_name || selectedToDelete?.sender_email} ?`}
                confirmLabel={tc('delete') || 'Supprimer'}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />

            {/* Confirm Bulk Delete Modal */}
            <ConfirmModal
                isOpen={modal === 'bulk-delete'}
                onClose={closeModal}
                onConfirm={handleBulkDelete}
                title={t('delete.bulkTitle') || 'Supprimer plusieurs messages'}
                description={t('delete.bulkDescription', { count: bulkSelected.length })}
                confirmLabel={tc('delete') || 'Supprimer'}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />
        </div>
    );
}
