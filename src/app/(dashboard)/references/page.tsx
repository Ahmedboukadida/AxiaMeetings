'use client';

import { CustomCard } from '@/components/ui/custom-card';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Reference, ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Globe, ExternalLink, Image as ImageIcon , LayoutGrid, List as ListIcon, RefreshCw } from 'lucide-react';
import { formatLogoUrl } from '@/lib/utils';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { ListGridToggle } from '@/components/ui/ListGridToggle';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/cards';
import { Input } from '@/components/ui/inputs';
import { cn } from '@/lib/utils';

type ModalType = 'add' | 'edit' | 'delete' | 'bulk-delete' | null;
const emptyForm = { name: '', logo_file_name: '', website: '' };

export default function ReferencesPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('References');
    const tc = useTranslations('Common');
    const [references, setReferences] = useState<Reference[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modal, setModal] = useState<ModalType>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<Reference | null>(null);
    const [bulkSelected, setBulkSelected] = useState<Reference[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchReferences = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/references');
            const result: ApiResponse<Reference[]> = await res.json();
            if (result.status && result.data) setReferences(result.data);
            else toast.error(result.message || tc('toast.error'));
        } catch { toast.error(tc('toast.error')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (user?.role === UserRole.DEVELOPER) fetchReferences(); }, [user]);

    const closeModal = () => { setModal(null); setSelected(null); };
    const openAdd = () => { setForm(emptyForm); setModal('add'); };
    const openEdit = (r: Reference) => { setSelected(r); setForm({ name: r.name, logo_file_name: r.logo_file_name, website: r.website }); setModal('edit'); };
    const openDelete = (r: Reference) => { setSelected(r); setModal('delete'); };

    const handleSave = async () => {
        if (!form.name || !form.logo_file_name || !form.website) { toast.error(t('toast.required')); return; }
        setSaving(true);
        try {
            const isEdit = modal === 'edit' && selected;
            const res = await fetch(isEdit ? `/api/references/${selected.id}` : '/api/references', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const result: ApiResponse<Reference> = await res.json();
            if (result.status) { toast.success(isEdit ? t('toast.updated') : t('toast.created')); fetchReferences(); closeModal(); }
            else toast.error(result.message || tc('toast.error'));
        } catch { toast.error(tc('toast.error')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/references/${selected.id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.status) { toast.success(t('toast.deleted')); fetchReferences(); closeModal(); }
            else toast.error(result.message || tc('toast.error'));
        } catch { toast.error(tc('toast.error')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.all(bulkSelected.map(r => fetch(`/api/references/${r.id}`, { method: 'DELETE' })));
            toast.success(t('toast.bulkDeleted', { count: bulkSelected.length }));
            fetchReferences(); closeModal(); setBulkSelected([]);
        } catch { toast.error(tc('toast.error')); }
        finally { setSaving(false); }
    };

    const columns: Column<Reference>[] = [
        {
            accessorKey: 'name',
            header: t('table.reference'),
            cell: ({ row: { original: r } }) => (
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden border border-slate-100 shadow-sm">
                        {r.logo_file_name
                            ? <img src={formatLogoUrl(r.logo_file_name)} alt={r.name} className="w-6 h-6 object-contain p-0.5" />
                            : <ImageIcon size={14} className="text-slate-300" />}
                    </div>
                    <Typography variant="large" className="text-slate-900 font-bold text-xs">{r.name}</Typography>
                </div>
            ),
        },
        {
            accessorKey: 'website',
            header: t('table.website'),
            cell: ({ row }) => (
                <a href={row.original.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[#002B5B] hover:text-blue-600 transition-colors font-bold group text-xs">
                    <span>{row.original.website}</span>
                    <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
            ),
        },
        {
            id: 'actions', header: tc('actions'), enableSorting: false,
            cell: ({ row: { original: r } }) => (
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)} className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openDelete(r)} className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></Button>
                </div>
            ),
        },
    ];

    const bulkActions: BulkAction<Reference>[] = [{
        label: tc('delete'), icon: <Trash2 size={14} />, variant: 'danger',
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
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 md:w-80 h-64 md:h-80 bg-blue-50/50 rounded-full blur-[80px] md:blur-[100px] -translate-y-1/2 translate-x-1/2 -z-10"></div>

                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Globe size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle')}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={fetchReferences} className="h-10 w-10 shrink-0 border-slate-100">
                            <RefreshCw size={18} className={cn("text-slate-500", isLoading && "animate-spin")} />
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

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {references?.map((r: Reference) => (
                        <CustomCard 
                            key={r.id} 
                            title={r.name} 
                            subtitle={r.website} 
                            actionLabel={tc('edit')}
                            onAction={() => typeof openEdit !== 'undefined' ? openEdit(r) : {}}
                            icon={
                                r.logo_file_name 
                                    ? <img src={formatLogoUrl(r.logo_file_name)} alt={r.name} className="w-8 h-8 object-contain rounded-md" />
                                    : <Globe size={20} />
                            }
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                    columns={columns}
                    data={references}
                    searchable
                    searchPlaceholder={t('searchPlaceholder')}
                    bulkActions={bulkActions}
                    emptyMessage={t('empty')}
                    pagesize={10}
                />
                </div>
            )}

            <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={closeModal}
                title={modal === 'add' ? t('form.addTitle') : t('form.editTitle')}
                description={t('form.description')} size="xl">
                <div className="space-y-6">
                    <Input
                        label={t('form.name')}
                        value={form.name}
                        placeholder={t('form.namePlaceholder')}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        icon={Globe}
                    />
                    <Input
                        label={t('form.logo')}
                        value={form.logo_file_name}
                        placeholder={t('form.logoPlaceholder')}
                        onChange={e => setForm({ ...form, logo_file_name: e.target.value })}
                        icon={ImageIcon}
                    />
                    <Input
                        label={t('form.website')}
                        type="url"
                        value={form.website}
                        placeholder={t('form.websitePlaceholder')}
                        onChange={e => setForm({ ...form, website: e.target.value })}
                        icon={ExternalLink}
                    />
                </div>
                <div className="flex gap-3 mt-10">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-10 font-bold text-xs uppercase">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 h-10 font-bold text-xs uppercase shadow-lg shadow-blue-900/10">
                        {saving ? tc('saving') : tc('save')}
                    </Button>
                </div>
            </Modal>

            <ConfirmModal isOpen={modal === 'delete'} onClose={closeModal} onConfirm={handleDelete}
                title={t('delete.title')} description={t('delete.description', { name: selected?.name || '' })}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />

            <ConfirmModal isOpen={modal === 'bulk-delete'} onClose={closeModal} onConfirm={handleBulkDelete}
                title={t('delete.bulkTitle', { count: bulkSelected.length })}
                description={t('delete.bulkDescription', { count: bulkSelected.length })}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />
        </div>
    );
}
