'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Company, CompanyApi, ApiResponse } from '@/lib/types';
import { MeetingDuration } from '@/lib/enums/meetings';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users as UsersIcon, Webhook, Building2, Settings2, CheckCircle2, XCircle, Sparkles, Info, Globe, Shield, Calendar, BarChart3, Database, Bell, MessageCircle, Mail , LayoutGrid, List as ListIcon, RefreshCw } from 'lucide-react';
import { formatLogoUrl } from '@/lib/utils';
import Link from 'next/link';
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
import { motion, AnimatePresence } from 'framer-motion';
import { CompanyCard } from '@/components/CompanyCard';

type ModalType = 'add' | 'edit' | 'delete' | 'bulk-delete' | 'configure' | 'view-services' | null;
const emptyForm = {
    name: '',
    logo_url: '',
    url: '',
    database_schema: '',
    meeting_time_limit: 'ONE_HOUR' as MeetingDuration,
    users_number_limit: 10
};
const emptyConfig = {
    login_endpoint_id: '', users_endpoint_id: '',
    have_notifications_service: false, notifications_service_endpoint_id: '',
    have_messages_service: false, messages_service_endpoint_id: '',
    have_sms_service: false, sms_service_endpoint_id: '',
    have_mail_service: false, push_mails_endpoint_id: '',
};

interface CompanyWithConfig extends Company {
    login_endpoint_id: number | null;
    users_endpoint_id: number | null;
    have_notifications_service: boolean;
    notifications_service_endpoint_id: number | null;
    have_messages_service: boolean;
    messages_service_endpoint_id: number | null;
    have_sms_service: boolean;
    sms_service_endpoint_id: number | null;
    mail_is_active: boolean;
    have_mail_service: boolean;
    push_mails_endpoint_id: number | null;
    ai_is_active: boolean;
    companies_apis_list?: CompanyApi[];
}

export default function CompaniesPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const t = useTranslations('Dashboard.companies');
    const tc = useTranslations('Common');
    const ts = useTranslations('Dashboard.sidebar');
    const td = useTranslations('MeetingDetails.durations');
    const [companies, setCompanies] = useState<CompanyWithConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modal, setModal] = useState<ModalType>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<CompanyWithConfig | null>(null);
    const [bulkSelected, setBulkSelected] = useState<CompanyWithConfig[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [config, setConfig] = useState(emptyConfig);
    const [companyApis, setCompanyApis] = useState<CompanyApi[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchCompanies = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/companies');
            const result: ApiResponse<CompanyWithConfig[]> = await res.json();
            if (result.status && result.data) setCompanies(result.data);
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (user?.role === UserRole.DEVELOPER) fetchCompanies(); }, [user]);

    const closeModal = () => { setModal(null); setSelected(null); setCompanyApis([]); };

    const openAdd = () => { setForm(emptyForm); setSelected(null); setModal('add'); };
    const openEdit = (c: CompanyWithConfig) => {
        setSelected(c);
        setForm({
            name: c.name,
            logo_url: c.logo_url,
            url: c.url,
            database_schema: c.database_schema || '',
            meeting_time_limit: (c.meeting_time_limit as MeetingDuration) || MeetingDuration.ONE_HOUR,
            users_number_limit: c.users_number_limit || 10
        });
        setModal('edit');
    };
    const openDelete = (c: CompanyWithConfig) => { setSelected(c); setModal('delete'); };
    const openConfigure = async (c: CompanyWithConfig) => {
        setSelected(c);
        setConfig({
            login_endpoint_id: c.login_endpoint_id ? String(c.login_endpoint_id) : '',
            users_endpoint_id: c.users_endpoint_id ? String(c.users_endpoint_id) : '',
            have_notifications_service: c.have_notifications_service,
            notifications_service_endpoint_id: c.notifications_service_endpoint_id ? String(c.notifications_service_endpoint_id) : '',
            have_messages_service: c.have_messages_service,
            messages_service_endpoint_id: c.messages_service_endpoint_id ? String(c.messages_service_endpoint_id) : '',
            have_sms_service: c.have_sms_service,
            sms_service_endpoint_id: c.sms_service_endpoint_id ? String(c.sms_service_endpoint_id) : '',
            have_mail_service: c.have_mail_service,
            push_mails_endpoint_id: c.push_mails_endpoint_id ? String(c.push_mails_endpoint_id) : '',
        });
        try {
            const res = await fetch(`/api/companies/apis?companyId=${c.id}`);
            const result: ApiResponse<CompanyApi[]> = await res.json();
            if (result.status && result.data) setCompanyApis(result.data);
        } catch { setCompanyApis([]); }
        setModal('configure');
    };

    const handleSave = async () => {
        if (!form.name || !form.url) { toast.error(tc('error')); return; }
        setSaving(true);
        try {
            const isEdit = modal === 'edit' && selected;
            const res = await fetch(isEdit ? `/api/companies/${selected.id}` : '/api/companies', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const result: ApiResponse<Company> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchCompanies(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleSaveConfig = async () => {
        if (!selected || !config.login_endpoint_id) { toast.error(tc('error')); return; }
        setSaving(true);
        try {
            const body = {
                name: selected.name, logo_url: selected.logo_url, url: selected.url, database_schema: selected.database_schema,
                login_endpoint_id: Number(config.login_endpoint_id),
                users_endpoint_id: config.users_endpoint_id ? Number(config.users_endpoint_id) : null,
                have_notifications_service: config.have_notifications_service,
                notifications_service_endpoint_id: config.have_notifications_service && config.notifications_service_endpoint_id ? Number(config.notifications_service_endpoint_id) : null,
                have_messages_service: config.have_messages_service,
                messages_service_endpoint_id: config.have_messages_service && config.messages_service_endpoint_id ? Number(config.messages_service_endpoint_id) : null,
                have_sms_service: config.have_sms_service,
                sms_service_endpoint_id: config.have_sms_service && config.sms_service_endpoint_id ? Number(config.sms_service_endpoint_id) : null,
                have_mail_service: (config as any).have_mail_service,
                push_mails_endpoint_id: (config as any).have_mail_service && (config as any).push_mails_endpoint_id ? Number((config as any).push_mails_endpoint_id) : null,
            };
            const res = await fetch(`/api/companies/${selected.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const result: ApiResponse<Company> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchCompanies(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/companies/${selected.id}`, { method: 'DELETE' });
            const result: ApiResponse<null> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchCompanies(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.all(bulkSelected.map(c => fetch(`/api/companies/${c.id}`, { method: 'DELETE' })));
            toast.success(tc('success'));
            fetchCompanies(); closeModal(); setBulkSelected([]);
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const toggleAiAccess = async (company: Company) => {
        try {
            const res = await fetch(`/api/companies/${company.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ai_is_active: !company.ai_is_active }),
            });
            if (res.ok) {
                toast.success(company.ai_is_active ? t('ai.disabled') : t('ai.enabled'));
                fetchCompanies();
            }
        } catch { toast.error(tc('error')); }
    };

    const toggleMailAccess = async (company: Company) => {
        try {
            const res = await fetch(`/api/companies/${company.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mail_is_active: !company.mail_is_active }),
            });
            if (res.ok) {
                toast.success(company.mail_is_active ? 'Axia Mail Disabled' : 'Axia Mail Enabled');
                fetchCompanies();
            }
        } catch { toast.error(tc('error')); }
    };

    const ServiceBadge = ({ active, label }: { active: boolean; label: string }) => (
        <Badge variant={active ? "success" : "secondary"} className="gap-1.5 h-5 px-2 text-[10px] uppercase font-semibold">
            {active ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
            {label}
        </Badge>
    );

    const columns: Column<CompanyWithConfig>[] = [
        {
            accessorKey: 'name',
            header: tc('company'),
            cell: ({ row: { original: c } }) => (
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 shadow-sm overflow-hidden p-1">
                        {c.logo_url ? <img src={formatLogoUrl(c.logo_url)} alt={c.name} className="w-full h-full object-contain" /> : <Building2 size={14} className="text-[#002B5B]" />}
                    </div>
                    <div className="min-w-0">
                        <Typography variant="large" className="text-slate-900 font-bold text-xs leading-tight truncate">{c.name}</Typography>
                        <Badge variant="secondary" className="mt-0.5 h-3.5 px-1 font-mono text-[8px] lowercase opacity-70">
                            {c.database_schema || t('table.noSchema')}
                        </Badge>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'url',
            header: t('form.url'),
            cell: ({ row }) => (
                <a href={`https://${row.original.url}`} target="_blank" rel="noopener noreferrer" className="text-[#002B5B] hover:text-blue-600 transition-colors font-bold text-[11px] uppercase">
                    {row.original.url}
                </a>
            ),
        },
        {
            id: 'services',
            header: t('table.services'),
            enableSorting: false,
            cell: ({ row: { original: c } }) => {
                const activeServices = [
                    !!c.login_endpoint_id,
                    !!c.users_endpoint_id,
                    c.have_notifications_service,
                    c.have_messages_service,
                    c.have_sms_service,
                    !!c.push_mails_endpoint_id
                ].filter(Boolean).length;

                return (
                    <button
                        onClick={() => { setSelected(c); setModal('view-services'); }}
                        className="group relative flex items-center justify-center w-7 h-7 bg-slate-50 border border-slate-100 rounded-lg transition-all hover:bg-[#002B5B] hover:border-[#002B5B] hover:shadow-md hover:shadow-blue-900/10"
                    >
                        <span className="text-[11px] font-bold text-[#002B5B] group-hover:text-white">{activeServices}</span>
                        <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full border border-white shadow-sm" />
                    </button>
                );
            },
        },
        {
            id: 'ai',
            header: t('ai.title'),
            enableSorting: false,
            cell: ({ row: { original: c } }) => (
                <button
                    onClick={() => toggleAiAccess(c)}
                    title={c.ai_is_active ? t('ai.clickToDisable') : t('ai.clickToEnable')}
                    className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all duration-300 uppercase",
                        c.ai_is_active
                            ? "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 shadow-sm"
                            : "bg-slate-50 border-slate-100 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                    )}
                >
                    <Sparkles size={9} className={cn(c.ai_is_active ? 'animate-pulse' : '')} />
                    {c.ai_is_active ? t('ai.on') : t('ai.off')}
                </button>
            ),
        },
        {
            id: 'mail',
            header: 'Mail SMTP',
            enableSorting: false,
            cell: ({ row: { original: c } }) => (
                <button
                    onClick={() => toggleMailAccess(c)}
                    title={c.mail_is_active ? 'Click to disable' : 'Click to enable'}
                    className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-all duration-300 uppercase",
                        c.mail_is_active
                            ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 shadow-sm"
                            : "bg-slate-50 border-slate-100 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                    )}
                >
                    {c.mail_is_active ? 'ON' : 'OFF'}
                </button>
            ),
        },
        {
            id: 'actions',
            header: tc('actions'),
            enableSorting: false,
            cell: ({ row: { original: c } }) => (
                <div className="flex items-center gap-0.5 justify-end">
                    <Link href={`/companies/admins?companyId=${c.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50 rounded-lg" title={ts('admins')}><UsersIcon size={12} /></Button>
                    </Link>
                    <Link href={`/companies/apis?companyId=${c.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-50 rounded-lg" title={ts('companyApis')}><Webhook size={12} /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-purple-600 hover:bg-purple-50 rounded-lg" onClick={() => openConfigure(c)} title={tc('configure')}><Settings2 size={12} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:bg-amber-50 rounded-lg" onClick={() => openEdit(c)} title={tc('edit')}><Pencil size={12} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50 rounded-lg" onClick={() => openDelete(c)} title={tc('delete')}><Trash2 size={12} /></Button>
                </div>
            ),
        },
    ];

    const bulkActions: BulkAction<CompanyWithConfig>[] = [{
        label: tc('delete'), icon: <Trash2 size={12} />, variant: 'danger',
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
                <div className="absolute top-0 right-0 w-64 md:w-80 h-64 md:h-80 bg-blue-50/50 rounded-full blur-[80px] md:blur-[100px] -translate-y-1/2 translate-x-1/2 -z-10"></div>
                
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Building2 size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle')}
                            </Typography>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={fetchCompanies} className="h-10 w-10 shrink-0 border-slate-100">
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
                            <Plus size={18} className="me-2 rtl:rotate-90" /> {t('new')}
                        </Button>
                    </div>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {companies?.map((c: any) => (
                        <CompanyCard 
                            key={c.id} 
                            company={c} 
                            onEdit={() => typeof openEdit !== 'undefined' ? openEdit(c) : {}} 
                            onViewServices={() => { setSelected(c); setModal('view-services'); }}
                            onToggleAi={() => toggleAiAccess(c)}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                    columns={columns}
                    data={companies}
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
                title={modal === 'add' ? t('form.addTitle') : t('form.editTitle')}
                description={t('form.description')}
                size="4xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <Input label={t('form.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('form.namePlaceholder')} icon={Building2} />
                    <Input label={t('form.logo')} value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder={t('form.logoPlaceholder')} icon={Globe} />
                    <Input label={t('form.url')} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={t('form.urlPlaceholder')} icon={Globe} />
                    <Input label={t('form.schema')} value={form.database_schema} onChange={(e) => setForm({ ...form, database_schema: e.target.value })} placeholder={t('form.schemaPlaceholder')} icon={Database} />

                    <Select
                        label={t('form.timeLimit')}
                        value={form.meeting_time_limit}
                        onValueChange={(val) => setForm({ ...form, meeting_time_limit: val as MeetingDuration })}
                        options={Object.values(MeetingDuration).map((d) => ({ value: d, label: td(d) }))}
                    />
                    <Input label={t('form.userLimit')} type="number" value={form.users_number_limit} onChange={(e) => setForm({ ...form, users_number_limit: parseInt(e.target.value) || 0 })} placeholder={t('form.userLimitPlaceholder')} icon={UsersIcon} />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-10 font-bold text-xs uppercase">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 h-10 font-bold text-xs uppercase shadow-lg shadow-blue-900/10">
                        {saving ? tc('processing') : tc('save')}
                    </Button>
                </div>
            </Modal>

            {/* Configure Services Modal */}
            <Modal isOpen={modal === 'configure'} onClose={closeModal}
                title={t('config.title')}
                description={selected ? `${t('config.assign')} ${selected.name}` : ''}
                size="4xl">
                {companyApis.length === 0 && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-semibold flex items-center gap-3">
                        <Info size={16} /> {t('config.noApis')}
                    </div>
                )}
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                            { key: 'login_endpoint_id', label: t('config.loginLabel'), desc: t('config.loginDesc'), filter: 'POST', required: true, color: 'blue' },
                            { key: 'users_endpoint_id', label: t('config.usersLabel'), desc: t('config.usersDesc'), filter: 'GET', required: false, color: 'slate' },
                        ].map((f) => (
                            <div key={f.key} className={cn("p-3.5 rounded-xl space-y-2 border transition-all hover:shadow-md", f.color === 'blue' ? "bg-blue-50/30 border-blue-100 hover:bg-blue-50" : "bg-slate-50/30 border-slate-100 hover:bg-slate-50")}>
                                <div className="flex items-center justify-between">
                                    <Typography variant="label" className="font-bold text-[9px] uppercase" color={f.color === 'blue' ? 'primary' : 'secondary'}>{f.label}</Typography>
                                    <Shield size={10} className={f.color === 'blue' ? 'text-blue-400' : 'text-slate-400'} />
                                </div>
                                <Typography variant="p" className="text-[9px] text-slate-500 leading-tight font-bold">{f.desc}</Typography>
                                <Select
                                    value={(config as any)[f.key]}
                                    onValueChange={(val) => setConfig({ ...config, [f.key]: val })}
                                    placeholder={`— ${f.required ? tc('selectRequired') : tc('none')} —`}
                                    options={(f.filter ? companyApis.filter(a => a.method === f.filter) : companyApis).map(a => ({
                                        value: String(a.id),
                                        label: `${a.method} ${a.endpoint}`
                                    }))}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="space-y-3.5">
                        <Typography variant="label" className="px-4 uppercase text-[10px] font-semibold text-slate-400">{t('config.additionalServices')}</Typography>
                        <div className="grid grid-cols-1 gap-2.5">
                            {[
                                { toggleKey: 'have_notifications_service', endpointKey: 'notifications_service_endpoint_id', label: t('config.notifLabel'), desc: t('config.notifDesc') },
                                { toggleKey: 'have_messages_service', endpointKey: 'messages_service_endpoint_id', label: 'Messages API', desc: 'Push message integration' },
                                { toggleKey: 'have_sms_service', endpointKey: 'sms_service_endpoint_id', label: t('config.smsLabel'), desc: t('config.smsDesc') },
                                { toggleKey: 'have_mail_service', endpointKey: 'push_mails_endpoint_id', label: 'Push Mails API', desc: 'Push mails via external API' },
                            ].map((f) => (
                                <div key={f.toggleKey} className={cn("p-3.5 bg-slate-50/30 border border-slate-100 rounded-xl transition-all hover:bg-slate-50", (config as any)[f.toggleKey] && "border-[#002B5B]/20")}>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-start gap-2.5">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-all", (config as any)[f.toggleKey] ? "bg-[#002B5B] text-white" : "bg-white text-slate-400")}>
                                                <Webhook size={12} />
                                            </div>
                                            <div>
                                                <Typography variant="large" className="text-slate-900 text-xs font-bold leading-tight uppercase">{f.label}</Typography>
                                                <Typography variant="p" className="text-[9px] text-slate-500 mt-0.5 font-bold uppercase">{f.desc}</Typography>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setConfig({ ...config, [f.toggleKey]: !(config as any)[f.toggleKey] })}
                                            className={cn(
                                                "relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300",
                                                (config as any)[f.toggleKey] ? 'bg-[#002B5B]' : 'bg-slate-200'
                                            )}
                                        >
                                            <motion.span
                                                animate={{ x: (config as any)[f.toggleKey] ? 18 : 4 }}
                                                className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-md"
                                            />
                                        </button>
                                    </div>
                                    <AnimatePresence>
                                        {(config as any)[f.toggleKey] && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                                animate={{ height: "auto", opacity: 1, marginTop: 16 }}
                                                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="pt-4 border-t border-slate-100">
                                                    <Select
                                                        value={(config as any)[f.endpointKey]}
                                                        onValueChange={(val) => setConfig({ ...config, [f.endpointKey]: val })}
                                                        placeholder={`— ${tc('select')} —`}
                                                        options={companyApis.map(a => ({ value: String(a.id), label: `${a.method} ${a.endpoint}` }))}
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-10">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-10 font-bold text-xs uppercase">{tc('cancel')}</Button>
                    <Button onClick={handleSaveConfig} disabled={saving || companyApis.length === 0} className="flex-1 h-10 font-bold text-xs uppercase shadow-lg shadow-blue-900/10">
                        {saving ? tc('processing') : tc('save')}
                    </Button>
                </div>
            </Modal>

            {/* View Services Modal */}
            <Modal isOpen={modal === 'view-services'} onClose={closeModal}
                title={t('table.services')}
                description={selected?.name}
                size="xl">
                {selected && (
                    <div className="grid grid-cols-1 gap-4">
                        {[
                            { active: !!selected.login_endpoint_id, label: t('config.loginLabel'), desc: t('config.loginDesc'), icon: Shield },
                            { active: !!selected.users_endpoint_id, label: t('config.usersLabel'), desc: t('config.usersDesc'), icon: UsersIcon },
                            { active: selected.have_notifications_service, label: t('config.notifLabel'), desc: t('config.notifDesc'), icon: Bell },
                            { active: selected.have_messages_service, label: t('config.msgLabel'), desc: t('config.msgDesc'), icon: MessageCircle },
                            { active: selected.have_sms_service, label: t('config.smsLabel'), desc: t('config.smsDesc'), icon: Mail },
                        ].map((s, i) => (
                            <div key={i} className={cn(
                                "flex flex-col md:flex-row items-center justify-between p-3 rounded-xl border transition-all",
                                s.active ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100 opacity-60"
                            )}>
                                <div className="flex items-center gap-2.5">
                                    <div className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                                        s.active ? "bg-white text-emerald-600" : "bg-white text-slate-400"
                                    )}>
                                        <s.icon size={12} />
                                    </div>
                                    <div>
                                        <Typography variant="large" className={cn("text-slate-900 font-bold text-[11px] leading-tight uppercase", !s.active && "text-slate-500")}>{s.label}</Typography>
                                        <Typography variant="small" color="secondary" className="mt-0.5 text-[9px] font-bold uppercase">{s.desc}</Typography>
                                    </div>
                                </div>
                                <div className={cn(
                                    "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase",
                                    s.active ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                                )}>
                                    {s.active ? tc('active') : tc('inactive')}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="mt-8 pt-6 border-t border-slate-100">
                    <Button onClick={closeModal} variant="primary" className="w-full h-10 font-bold text-xs uppercase">{tc('close')}</Button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={modal === 'delete'}
                onClose={closeModal}
                onConfirm={handleDelete}
                title={tc('deleteTitle', { item: t('single') })}
                description={tc('confirmDelete')}
                confirmLabel={tc('delete')}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />

            <ConfirmModal
                isOpen={modal === 'bulk-delete'}
                onClose={closeModal}
                onConfirm={handleBulkDelete}
                title={tc('deleteTitle', { item: `${bulkSelected.length} ${t('multiple')}` })}
                description={tc('confirmDelete')}
                confirmLabel={tc('delete')}
                confirmVariant="danger"
                loading={saving}
                icon={<Trash2 size={24} className="text-red-500" />}
            />
        </div>
    );
}
