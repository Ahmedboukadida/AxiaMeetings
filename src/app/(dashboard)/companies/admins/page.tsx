'use client';

import { UserAdminCard } from '@/components/UserAdminCard';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, User, Link2, ShieldCheck, Mail, Key, Hash, Building2, ExternalLink , LayoutGrid, List as ListIcon, RefreshCw } from 'lucide-react';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { ListGridToggle } from '@/components/ui/ListGridToggle';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { Select } from '@/components/ui/selects';
import { Badge } from '@/components/ui/badges';
import { Card, CardContent } from '@/components/ui/cards';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface Admin {
    id: number;
    fullname: string | null;
    email: string | null;
    username: string | null;
    role: string | null;
    company_id: number | null;
    company?: { id: number; name: string } | null;
    companies_admins_login?: { id: number; linked: boolean; identifiant_extern: number | null }[];
    identifiant_extern?: number | null;
}

type ModalType = 'add' | 'edit' | 'delete' | 'bulk-delete' | null;
const emptyForm = { fullname: '', email: '', username: '', password: '', company_id: '', identifiant_extern: '' };

export default function CompanyAdminsPage() {
    const t = useTranslations('Dashboard.admins');
    const tc = useTranslations('Common');
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const companyId = searchParams.get('companyId');

    const [admins, setAdmins] = useState<Admin[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modal, setModal] = useState<ModalType>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<Admin | null>(null);
    const [bulkSelected, setBulkSelected] = useState<Admin[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchAdmins = async () => {
        setIsLoading(true);
        try {
            const url = companyId ? `/api/companies/admins?companyId=${companyId}` : '/api/companies/admins';
            const res = await fetch(url);
            const result: ApiResponse<Admin[]> = await res.json();
            if (result.status && result.data) setAdmins(result.data);
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setIsLoading(false); }
    };

    const fetchCompanies = async () => {
        try {
            const res = await fetch('/api/companies');
            const result = await res.json();
            if (result.status && result.data) setCompanies(result.data);
        } catch { console.error('Failed to fetch companies'); }
    };

    useEffect(() => {
        if (user?.role === UserRole.DEVELOPER) {
            fetchAdmins();
            fetchCompanies();
        }
    }, [user, companyId]);

    const closeModal = () => { setModal(null); setSelected(null); };
    const openAdd = () => { setForm({ ...emptyForm, company_id: companyId || '' }); setSelected(null); setModal('add'); };
    const openEdit = (a: Admin) => {
        setSelected(a);
        const adminIdentifiant = a.identifiant_extern || '';
        setForm({ fullname: a.fullname || '', email: a.email || '', username: a.username || '', password: '', company_id: String(a.company_id || ''), identifiant_extern: String(adminIdentifiant) });
        setModal('edit');
    };
    const openDelete = (a: Admin) => { setSelected(a); setModal('delete'); };

    const handleSave = async () => {
        if (!form.username || !form.company_id) { toast.error(tc('error')); return; }
        if (modal === 'add' && !form.password) { toast.error(tc('error')); return; }
        setSaving(true);
        try {
            const isEdit = modal === 'edit' && selected;
            const res = await fetch('/api/companies/admins', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isEdit ? { id: selected.id, ...form } : form),
            });
            const result: ApiResponse<Admin> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchAdmins(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/companies/admins', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id }) });
            const result: ApiResponse<null> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchAdmins(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.all(bulkSelected.map(a => fetch('/api/companies/admins', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) })));
            toast.success(tc('success'));
            fetchAdmins(); closeModal(); setBulkSelected([]);
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const columns: Column<Admin>[] = [
        {
            accessorKey: 'fullname',
            header: tc('fullname'),
            cell: ({ row: { original: a } }) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 shadow-sm text-[#002B5B]">
                        <User size={18} />
                    </div>
                    <div>
                        <Typography variant="large" className="text-slate-900 font-bold text-sm">{a.fullname || '—'}</Typography>
                        <Typography variant="small" color="secondary" className="text-[11px] font-bold uppercase">{a.email || t('table.noEmail')}</Typography>
                    </div>
                </div>
            ),
        },
        {
            id: 'username',
            accessorKey: 'username',
            header: tc('username'),
            cell: ({ row }) => <Badge variant="secondary" className="font-mono text-[11px] font-bold h-5 px-1.5 uppercase">{row.original.username}</Badge>
        },
        {
            accessorKey: 'company',
            header: tc('company'),
            cell: ({ row: { original: a } }) => (
                <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-slate-400" />
                    <Typography variant="large" className="text-sm font-bold">{a.company?.name || '—'}</Typography>
                </div>
            )
        },
        {
            id: 'identifiant_extern',
            header: t('table.extId'),
            cell: ({ row: { original: a } }) => {
                const idExt = a.identifiant_extern;
                return <Typography variant="large" className="font-mono text-[12px] font-bold text-slate-600">{idExt || '—'}</Typography>;
            }
        },
        {
            id: 'token',
            header: t('table.token'),
            enableSorting: false,
            cell: ({ row: { original: a } }) => a.companies_admins_login?.[0]?.linked
                ? <Badge variant="success" className="gap-1.5 h-5 px-2 font-semibold uppercase text-[10px] shadow-sm border-white">
                    <Link2 size={10} /> {t('status.linked')}
                </Badge>
                : <Typography variant="muted" className="italic text-xs opacity-50">{t('status.notLinked')}</Typography>,
        },
        {
            id: 'actions',
            header: tc('actions'),
            enableSorting: false,
            cell: ({ row: { original: a } }) => (
                <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(a)} className="h-8 w-8 text-amber-500 hover:bg-amber-50 rounded-lg transition-all" title={tc('edit')}><Pencil size={16} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openDelete(a)} className="h-8 w-8 text-red-500 hover:bg-red-50 rounded-lg transition-all" title={tc('delete')}><Trash2 size={16} /></Button>
                </div>
            ),
        },
    ];

    const bulkActions: BulkAction<Admin>[] = [{
        label: tc('delete'), icon: <Trash2 size={14} />, variant: 'danger',
        onClick: (rows) => { setBulkSelected(rows); setModal('bulk-delete'); },
    }];

    if (authLoading || isLoading) {
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
                            <ShieldCheck size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography as="div" variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {companyId ? (
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-50">{t('subtitleCompany')}</span>
                                        <Badge variant="primary" className="h-4 px-1.5 font-mono text-[9px]">#{companyId}</Badge>
                                    </div>
                                ) : t('subtitle')}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={fetchAdmins} className="h-10 w-10 shrink-0 border-slate-100">
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
                            <Plus size={18} className="me-2" /> {t('add')}
                        </Button>
                    </div>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {admins?.map((u: any) => (
                        <UserAdminCard key={u.id} user={u} onEdit={() => typeof openEdit !== 'undefined' ? openEdit(u) : {}} onDelete={() => typeof openDelete !== 'undefined' ? openDelete(u) : {}} />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                    columns={columns}
                    data={admins}
                    searchable
                    searchPlaceholder={tc('search')}
                    bulkActions={bulkActions}
                    emptyMessage={t('empty')}
                    pagesize={10}
                />
                </div>
            )}

            {/* Add / Edit Modal */}
            <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={closeModal}
                title={modal === 'add' ? t('form.addTitle') : t('form.editTitle')} size="4xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <Input label={t('form.fullname')} value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} placeholder={t('form.fullnamePlaceholder')} icon={User} />
                    <Input label={t('form.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('form.emailPlaceholder')} icon={Mail} />
                    <Input label={t('form.extId')} type="number" value={form.identifiant_extern} onChange={(e) => setForm({ ...form, identifiant_extern: e.target.value })} placeholder={t('form.extIdPlaceholder')} icon={Hash} />
                    <Input label={t('form.username') + " *"} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={t('form.usernamePlaceholder')} icon={User} />

                    <div className="md:col-span-2">
                        <Input
                            label={modal === 'edit' ? t('form.passwordEdit') : tc('password') + " *"}
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            placeholder={modal === 'edit' ? t('form.passwordEditPlaceholder') : t('form.passwordPlaceholder')}
                            icon={Key}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <Select
                            label={tc('company') + " *"}
                            value={form.company_id}
                            onValueChange={(val) => setForm({ ...form, company_id: val })}
                            options={companies.map(c => ({ value: String(c.id), label: c.name }))}
                            placeholder={tc('select')}
                        />
                    </div>
                </div>
                <div className="flex gap-3 mt-8">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-11 font-semibold">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 font-semibold shadow-lg shadow-blue-900/10">
                        {saving ? tc('processing') : tc('save')}
                    </Button>
                </div>
            </Modal>

            <ConfirmModal isOpen={modal === 'delete'} onClose={closeModal} onConfirm={handleDelete}
                title={tc('deleteTitle', { item: t('single') })} description={tc('confirmDelete')}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />

            <ConfirmModal isOpen={modal === 'bulk-delete'} onClose={closeModal} onConfirm={handleBulkDelete}
                title={tc('deleteTitle', { item: `${bulkSelected.length} ${t('multiple')}` })}
                description={tc('confirmDelete')}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />
        </div>
    );
}
