'use client';

import { UserAdminCard } from '@/components/UserAdminCard';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { User, ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RefreshCw, User as UserIcon, Building2, Phone, Mail, Hash, Shield, Users , LayoutGrid, List as ListIcon, FileUp } from 'lucide-react';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { ListGridToggle } from '@/components/ui/ListGridToggle';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { Select } from '@/components/ui/selects';
import { Badge } from '@/components/ui/badges';
import { Card, CardContent } from '@/components/ui/cards';
import { cn } from '@/lib/utils';

type ModalType = 'add' | 'edit' | 'delete' | 'bulk-delete' | 'import' | null;
const emptyForm = { fullname: '', email: '', username: '', password: '', role: 'PARTICIPANT', company_id: '', phone: '', identifiant_extern: '' };

export default function UsersPage() {
    const t = useTranslations('Dashboard.users');
    const tc = useTranslations('Common');
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modal, setModal] = useState<ModalType>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<User | null>(null);
    const [bulkSelected, setBulkSelected] = useState<User[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
    const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('');
    const [importAdmins, setImportAdmins] = useState<{ id: number; fullname: string; username: string }[]>([]);
    const [importAdminId, setImportAdminId] = useState<string>('');

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.ADMIN && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchCompanies = async () => {
        if (user?.role !== UserRole.DEVELOPER) return;
        try {
            const res = await fetch('/api/companies');
            const result = await res.json();
            if (result.status && result.data) setCompanies(result.data);
        } catch { console.error('Failed to fetch companies'); }
    };

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            let url = '/api/users';
            if (user?.role === UserRole.ADMIN) {
                url = `/api/users?companyId=${user?.company_id}`;
            } else if (user?.role === UserRole.DEVELOPER && selectedCompanyFilter) {
                url = `/api/users?companyId=${selectedCompanyFilter}`;
            }
            const res = await fetch(url);
            const result: ApiResponse<User[]> = await res.json();
            if (result.status && result.data) setUsers(result.data);
            else toast.error(result.message || t('toast.fetchError'));
        } catch { toast.error(t('toast.fetchError')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        if (user?.role === UserRole.ADMIN || user?.role === UserRole.DEVELOPER) {
            fetchCompanies();
        }
    }, [user]);

    useEffect(() => {
        if (user?.role === UserRole.ADMIN || user?.role === UserRole.DEVELOPER) {
            fetchUsers();
        }
    }, [user, selectedCompanyFilter]);

    useEffect(() => {
        if (modal === 'import' && user?.role === UserRole.DEVELOPER && selectedCompanyFilter) {
            const fetchAdmins = async () => {
                try {
                    const res = await fetch(`/api/users?companyId=${selectedCompanyFilter}`);
                    const result = await res.json();
                    if (result.status && result.data) {
                        setImportAdmins(result.data.filter((u: any) => u.role === UserRole.ADMIN));
                    }
                } catch { console.error('Failed to fetch admins'); }
            };
            fetchAdmins();
        }
    }, [modal, selectedCompanyFilter, user]);

    const closeModal = () => { setModal(null); setSelected(null); setImportAdminId(''); };
    const openAdd = () => { setForm({ ...emptyForm, company_id: user?.company_id ? String(user.company_id) : '' }); setSelected(null); setModal('add'); };
    const openEdit = (u: User) => {
        setSelected(u);
        setForm({ fullname: u.fullname || '', email: u.email || '', username: u.username || '', password: '', role: u.role || 'PARTICIPANT', company_id: String(u.company_id || ''), phone: u.phone || '', identifiant_extern: u.identifiant_extern ? String(u.identifiant_extern) : '' });
        setModal('edit');
    };
    const openDelete = (u: User) => { setSelected(u); setModal('delete'); };

    const handleImport = async () => {
        if (user?.role === UserRole.DEVELOPER) {
            if (!selectedCompanyFilter) {
                toast.error(t('importModal.errorNoCompany'));
                return;
            }
            if (!importAdminId) {
                toast.error(t('importModal.errorNoAdmin'));
                return;
            }
        }
        setImporting(true);
        try {
            const url = user?.role === UserRole.DEVELOPER ? `/api/users/import?companyId=${selectedCompanyFilter}&adminId=${importAdminId}` : '/api/users/import';
            const res = await fetch(url, { method: 'POST' });
            const result: ApiResponse<{ imported: number }> = await res.json();
            if (result.status) { toast.success(t('importModal.success', { count: result.data?.imported || 0 })); fetchUsers(); closeModal(); }
            else toast.error(result.message || t('toast.importFailed'));
        } catch { toast.error(t('toast.importError')); }
        finally { setImporting(false); }
    };

    const handleSave = async () => {
        if (!form.username) { toast.error(t('toast.usernameRequired')); return; }
        if (modal === 'add' && !form.password) { toast.error(t('toast.passwordRequired')); return; }
        setSaving(true);
        try {
            const isEdit = modal === 'edit' && selected;
            const res = await fetch('/api/users', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isEdit ? { id: selected.id, ...form } : form),
            });
            const result: ApiResponse<User> = await res.json();
            if (result.status) { toast.success(isEdit ? t('toast.updated') : t('toast.created')); fetchUsers(); closeModal(); }
            else toast.error(result.message || t('toast.saveError'));
        } catch { toast.error(t('toast.saveError')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id }) });
            const result: ApiResponse<null> = await res.json();
            if (result.status) { toast.success(t('toast.deleted')); fetchUsers(); closeModal(); }
            else toast.error(result.message || t('toast.deleteError'));
        } catch { toast.error(t('toast.deleteError')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.all(bulkSelected.map(u => fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id }) })));
            toast.success(t('toast.bulkDeleted', { count: bulkSelected.length }));
            fetchUsers(); closeModal(); setBulkSelected([]);
        } catch { toast.error(t('toast.deleteError')); }
        finally { setSaving(false); }
    };

    const columns: Column<User>[] = React.useMemo(() => [
        ...(user?.role === 'DEVELOPER' ? [{
            accessorKey: 'company',
            header: t('form.company'),
            cell: ({ row }: any) => <Badge variant="secondary" className="bg-purple-50 text-purple-600 border-purple-100">{row.original.company?.name || '—'}</Badge>,
        }] : []),
        {
            accessorKey: 'fullname',
            header: t('form.fullname'),
            cell: ({ row: { original: u } }: { row: { original: User } }) => (
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 shadow-sm">
                        <UserIcon size={14} className="text-[#002B5B]" />
                    </div>
                    <div>
                        <Typography variant="large" className="text-slate-900 font-bold text-xs leading-tight">{u.fullname || '—'}</Typography>
                        <Typography variant="small" color="secondary" className="text-[9px] uppercase mt-0.5 font-bold">{u.username}</Typography>
                    </div>
                </div>
            ),
        },
        { accessorKey: 'email', header: t('form.email'), cell: ({ row }) => <Typography variant="p" className="text-xs font-medium">{row.original.email || '—'}</Typography> },
        { accessorKey: 'phone', header: t('form.phone'), cell: ({ row }) => <Typography variant="p" className="text-xs font-medium">{row.original.phone || '—'}</Typography> },
        { accessorKey: 'identifiant_extern', header: t('table.extId'), cell: ({ row }) => <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5">{row.original.identifiant_extern || '—'}</Badge> },
        {
            accessorKey: 'role',
            header: tc('role'),
            cell: ({ row }) => {
                const role = row.original.role;
                const roleLabel = role === 'DEVELOPER' ? t('roles.developer') : role === 'ADMIN' ? t('roles.admin') : t('roles.participant');
                return (
                    <Badge variant={role === 'DEVELOPER' ? 'default' : role === 'ADMIN' ? 'primary' : 'secondary'} className="h-4.5 px-2 text-[9px] font-bold uppercase">
                        {roleLabel}
                    </Badge>
                );
            },
        },
        {
            id: 'actions',
            header: tc('actions'),
            enableSorting: false,
            cell: ({ row: { original: u } }: { row: { original: User } }) => {
                const canModify = user?.role === UserRole.DEVELOPER || (user?.role === UserRole.ADMIN && u.role === 'PARTICIPANT');
                return (
                    <div className="flex items-center gap-1 justify-end">
                        {canModify && (
                            <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" onClick={() => openEdit(u)} title={tc('edit')}><Pencil size={14} /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" onClick={() => openDelete(u)} title={tc('delete')}><Trash2 size={14} /></Button>
                            </>
                        )}
                    </div>
                );
            },
        },
    ], [t, tc, user?.role]);

    const bulkActions: BulkAction<User>[] = [{
        label: tc('deleteSelected'), icon: <Trash2 size={14} />, variant: 'danger',
        onClick: (rows) => {
            const deletable = user?.role === UserRole.DEVELOPER ? rows : rows.filter(r => r.role === 'PARTICIPANT');
            if (deletable.length === 0) { toast.error(t('toast.participantOnlyError')); return; }
            setBulkSelected(deletable); setModal('bulk-delete');
        },
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
                            <Users size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle')}
                            </Typography>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                        {user?.role === UserRole.DEVELOPER && (
                            <div className="w-full md:w-64">
                                <Select
                                    value={selectedCompanyFilter}
                                    onValueChange={(val) => setSelectedCompanyFilter(val)}
                                    options={companies.map(c => ({ value: String(c.id), label: c.name }))}
                                    placeholder={t('allCompanies')}
                                />
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                            <Button variant="outline" size="icon" onClick={fetchUsers} className="h-10 w-10 shrink-0 border-slate-100">
                                <RefreshCw size={18} className={cn("text-slate-500", isLoading && "animate-spin")} />
                            </Button>

                            <Button variant="outline" className="w-full md:w-auto h-10 px-6 border border-slate-100 font-semibold text-sm" onClick={() => {
                                if (user?.role === UserRole.DEVELOPER && !selectedCompanyFilter) { toast.error(t('importModal.errorNoCompany')); return; }
                                setModal('import');
                            }}>
                                <FileUp size={18} className="me-2" /> <span>{t('import')}</span>
                            </Button>
                            
                            <ListGridToggle
                                viewMode={viewMode}
                                setViewMode={setViewMode}
                                className="w-full md:w-auto mt-4 md:mt-0 ltr:mr-4 rtl:ml-4"
                            />

                            <Button className="flex-1 md:flex-none h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm" onClick={openAdd}>
                                <Plus size={18} className="me-2 rtl:rotate-90" /> <span>{t('add')}</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {users?.map((u: any) => {
                        const canModify = user?.role === UserRole.DEVELOPER || (user?.role === UserRole.ADMIN && u.role === 'PARTICIPANT');
                        return (
                            <UserAdminCard 
                                key={u.id} 
                                user={u} 
                                onEdit={canModify ? () => openEdit(u) : undefined} 
                                onDelete={canModify ? () => openDelete(u) : undefined} 
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                    columns={columns}
                    data={users}
                    searchable
                    searchPlaceholder={tc('table.searchPlaceholder')}
                    bulkActions={bulkActions}
                    emptyMessage={t('empty')}
                    pagesize={10}
                />
                </div>
            )}

            {/* Add / Edit Modal */}
            <Modal isOpen={modal === 'add' || modal === 'edit'} onClose={closeModal}
                title={modal === 'add' ? t('form.addTitle') : t('form.editTitle')} size="4xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <Input label={t('form.fullname')} value={form.fullname} onChange={(e) => setForm({ ...form, fullname: e.target.value })} placeholder={t('form.fullnamePlaceholder')} icon={UserIcon} />
                    <Input label={t('form.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t('form.emailPlaceholder')} icon={Mail} />
                    <Input label={t('form.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('form.phonePlaceholder')} icon={Phone} />
                    <Input label={t('form.extId')} value={form.identifiant_extern} onChange={(e) => setForm({ ...form, identifiant_extern: e.target.value })} placeholder={t('form.extIdPlaceholder')} icon={Hash} />
                    <Input label={t('form.username') + ' *'} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={t('form.usernamePlaceholder')} icon={UserIcon} />
                    <Input label={modal === 'edit' ? t('form.passwordEdit') : t('form.password') + ' *'} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={modal === 'edit' ? t('form.passwordEditPlaceholder') : t('form.passwordPlaceholder')} icon={Shield} />

                    <Select
                        label={t('form.role')}
                        value={form.role}
                        onValueChange={(val) => setForm({ ...form, role: val })}
                        options={[
                            { value: 'PARTICIPANT', label: t('roles.participant') },
                            // Only a DEVELOPER may assign ADMIN or DEVELOPER (enforced server-side too).
                            ...(user?.role === UserRole.DEVELOPER ? [
                                { value: 'ADMIN', label: t('roles.admin') },
                                { value: 'DEVELOPER', label: t('roles.developer') },
                            ] : [])
                        ]}
                    />

                    {user?.role === UserRole.DEVELOPER && (
                        <Select
                            label={t('form.company') + ' *'}
                            value={form.company_id}
                            onValueChange={(val) => setForm({ ...form, company_id: val })}
                            options={companies.map(c => ({ value: String(c.id), label: c.name }))}
                            placeholder={t('form.company')}
                        />
                    )}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-10 font-bold text-xs uppercase">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 h-10 font-bold text-xs uppercase shadow-lg shadow-blue-900/10">
                        {saving ? tc('saving') : tc('save')}
                    </Button>
                </div>
            </Modal>

            {/* Import Modal */}
            <Modal isOpen={modal === 'import'} onClose={closeModal} title={t('importModal.title')} size="2xl">
                <div className="space-y-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="w-14 h-14 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center shadow-sm shadow-blue-900/5">
                            <RefreshCw size={24} className="text-[#002B5B]" />
                        </div>
                        <Typography variant="p" className="text-slate-600 leading-relaxed max-w-md text-xs font-medium">
                            {t('importModal.description')}
                        </Typography>
                    </div>

                    {user?.role === UserRole.DEVELOPER && (
                        <div className="space-y-6 pt-4 border-t border-slate-50">
                            <Select
                                label={t('importModal.selectAdmin')}
                                value={importAdminId}
                                onValueChange={(val) => setImportAdminId(val)}
                                placeholder={t('importModal.selectAdminPlaceholder')}
                                options={importAdmins.map(a => ({ value: String(a.id), label: a.fullname || a.username }))}
                            />
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button variant="outline" onClick={closeModal} className="flex-1 h-10 font-bold text-xs uppercase">{tc('cancel')}</Button>
                        <Button onClick={handleImport} disabled={importing} className="flex-1 h-10 font-bold text-xs uppercase shadow-lg shadow-blue-900/10">
                            {importing ? tc('loading') : t('import')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal isOpen={modal === 'delete'} onClose={closeModal} onConfirm={handleDelete}
                title={tc('delete')} description={tc('confirmDelete', { name: selected?.fullname || selected?.username || '' })}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />

            <ConfirmModal isOpen={modal === 'bulk-delete'} onClose={closeModal} onConfirm={handleBulkDelete}
                title={tc('deleteSelected')}
                description={tc('confirmBulkDelete', { count: bulkSelected.length })}
                confirmLabel={tc('delete')} confirmVariant="danger" loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />} />
        </div>
    );
}
