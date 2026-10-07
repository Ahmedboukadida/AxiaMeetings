'use client';

import { CustomCard } from '@/components/ui/custom-card';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Pack, ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Package, LayoutGrid, List as ListIcon, RefreshCw } from 'lucide-react';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { ListGridToggle } from '@/components/ui/ListGridToggle';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/cards';
import { Input } from '@/components/ui/inputs';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';

type ModalType = 'add' | 'edit' | 'delete' | 'bulk-delete' | null;

const emptyForm = { name: '', price_month: '', price_year: '', lines: [''] };

export default function PacksPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('Packs');
    const tc = useTranslations('Common');
    const [packs, setPacks] = useState<Pack[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modal, setModal] = useState<ModalType>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<Pack | null>(null);
    const [bulkSelected, setBulkSelected] = useState<Pack[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchPacks = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/packs');
            const result: ApiResponse<Pack[]> = await res.json();
            if (result.status && result.data) setPacks(result.data);
            else toast.error(result.message || tc('toast.error'));
        } catch { toast.error(tc('toast.error')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (user?.role === UserRole.DEVELOPER) fetchPacks(); }, [user]);

    const closeModal = () => { setModal(null); setSelected(null); };
    const openAdd = () => { setForm(emptyForm); setModal('add'); };
    const openEdit = (p: Pack) => {
        setSelected(p);
        setForm({ name: p.name, price_month: String(p.price_month), price_year: String(p.price_year), lines: p.packs_lines.map(l => l.title) });
        setModal('edit');
    };
    const openDelete = (p: Pack) => { setSelected(p); setModal('delete'); };

    const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, ''] }));
    const removeLine = (i: number) => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
    const updateLine = (i: number, v: string) => setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? v : l) }));

    const handleSave = async () => {
        if (!form.name || !form.price_month || !form.price_year) { toast.error(t('toast.required')); return; }
        setSaving(true);
        const body = { name: form.name, price_month: Number(form.price_month), price_year: Number(form.price_year), packs_lines: form.lines.filter(l => l.trim()) };
        try {
            const isEdit = modal === 'edit' && selected;
            const res = await fetch(isEdit ? `/api/packs/${selected.id}` : '/api/packs', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result: ApiResponse<Pack> = await res.json();
            if (result.status) { toast.success(isEdit ? t('toast.updated') : t('toast.created')); fetchPacks(); closeModal(); }
            else toast.error(result.message || tc('toast.error'));
        } catch { toast.error(tc('toast.error')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/packs/${selected.id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.status) { toast.success(t('toast.deleted')); fetchPacks(); closeModal(); }
            else toast.error(result.message || tc('toast.error'));
        } catch { toast.error(tc('toast.error')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.all(bulkSelected.map(p => fetch(`/api/packs/${p.id}`, { method: 'DELETE' })));
            toast.success(t('toast.bulkDeleted', { count: bulkSelected.length }));
            fetchPacks(); closeModal(); setBulkSelected([]);
        } catch { toast.error(tc('toast.error')); }
        finally { setSaving(false); }
    };

    const columns: Column<Pack>[] = [
        {
            accessorKey: 'name', header: t('table.pack'),
            cell: ({ row: { original: p } }) => (
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                        <Package size={14} className="text-[#002B5B]" />
                    </div>
                    <div>
                        <Typography variant="large" className="text-slate-900 font-bold text-xs leading-tight">{p.name}</Typography>
                        <Typography variant="p" className="text-[9px] text-slate-400 mt-0.5 font-bold uppercase">{t('table.featuresCount', { count: p.packs_lines.length })}</Typography>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'price_month', header: t('table.monthly'),
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <Typography variant="large" className="text-[#002B5B] font-semibold text-xs">{t('currency')} {row.original.price_month.toFixed(3)}</Typography>
                    <Typography variant="small" color="secondary" className="text-[10px] uppercase">/ {tc('mo')}</Typography>
                </div>
            ),
        },
        {
            accessorKey: 'price_year', header: t('table.yearly'),
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <Typography variant="large" className="text-emerald-600 font-bold text-xs leading-none">{t('currency')} {row.original.price_year.toFixed(3)}</Typography>
                    <Typography variant="small" color="secondary" className="text-[9px] font-bold uppercase mt-1 leading-none">/ {tc('yr')}</Typography>
                </div>
            ),
        },
        {
            id: 'features', header: t('table.features'), enableSorting: false,
            cell: ({ row: { original: p } }) => (
                <div className="flex flex-wrap gap-1">
                    {p.packs_lines.slice(0, 3).map(l => (
                        <Badge key={l.id} variant="secondary" className="h-4 px-1.5 text-[8px] font-bold uppercase">{l.title}</Badge>
                    ))}
                    {p.packs_lines.length > 3 && <Badge variant="primary" className="h-4 px-1.5 text-[8px] font-bold">+{p.packs_lines.length - 3}</Badge>}
                </div>
            ),
        },
        {
            id: 'actions', header: tc('actions'), enableSorting: false,
            cell: ({ row: { original: p } }) => (
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)} className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openDelete(p)} className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></Button>
                </div>
            ),
        },
    ];

    const bulkActions: BulkAction<Pack>[] = [{
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
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Package size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle')}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={fetchPacks} className="h-10 w-10 shrink-0 border-slate-100">
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
                    {packs?.map((p: Pack) => (
                        <CustomCard 
                            key={p.id} 
                            title={p.name} 
                            subtitle={t('table.featuresCount', { count: p.packs_lines?.length || 0 })} 
                            stats={[
                                {label: t('table.monthly'), value: `${t('currency')} ${p.price_month?.toFixed(3)}`},
                                {label: t('table.yearly'), value: `${t('currency')} ${p.price_year?.toFixed(3)}`}
                            ]} 
                            actionLabel={tc('edit')}
                            onAction={() => typeof openEdit !== 'undefined' ? openEdit(p) : {}} 
                            icon={<Package size={20} />}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                    columns={columns}
                    data={packs}
                    searchable
                    searchPlaceholder={t('searchPlaceholder')}
                    bulkActions={bulkActions}
                    emptyMessage={t('empty')}
                    pagesize={10}
                />
                </div>
            )}

            {/* Add/Edit Modal */}
            <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={closeModal}
                title={modal === 'add' ? t('form.addTitle') : t('form.editTitle')}
                description={t('form.description')} size="2xl">
                <div className="space-y-6">
                    <Input
                        label={t('form.name')}
                        value={form.name}
                        placeholder={t('form.namePlaceholder')}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        icon={Package}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input
                            label={t('form.priceMonth')}
                            type="number"
                            step="0.01"
                            value={form.price_month}
                            placeholder="49.00"
                            onChange={e => setForm({ ...form, price_month: e.target.value })}
                        />
                        <Input
                            label={t('form.priceYear')}
                            type="number"
                            step="0.01"
                            value={form.price_year}
                            placeholder="490.00"
                            onChange={e => setForm({ ...form, price_year: e.target.value })}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <Typography variant="label" className="uppercase text-[10px] font-semibold text-slate-400">{t('form.features')}</Typography>
                            <Button variant="ghost" size="sm" onClick={addLine} className="text-blue-600 font-semibold h-7 text-[10px] uppercase">
                                <Plus size={12} className="me-1.5 rtl:rotate-90" /> {t('form.addLine')}
                            </Button>
                        </div>
                        <div className="space-y-3 max-h-64 overflow-y-auto pe-2 custom-scrollbar">
                            {form.lines.map((line, i) => (
                                <div key={i} className="flex items-center gap-4 group">
                                    <div className="flex-1">
                                        <Input
                                            value={line}
                                            placeholder={t('form.featurePlaceholder', { index: i + 1 })}
                                            onChange={e => updateLine(i, e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeLine(i)}
                                        className="h-9 w-9 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <X size={16} />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 mt-10">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-10 font-bold text-[9px] uppercase">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 h-10 font-bold text-[9px] uppercase shadow-lg shadow-blue-900/10">
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
