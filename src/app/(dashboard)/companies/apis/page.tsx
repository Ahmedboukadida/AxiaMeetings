'use client';

import { CustomCard } from '@/components/ui/custom-card';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { CompanyApi, ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Sliders, Globe, Code2, Link2, DownloadCloud, Layers, ArrowRight, X, Lightbulb, Database, Shield, Loader2, CheckCircle2, Webhook , LayoutGrid, List as ListIcon, RefreshCw } from 'lucide-react';
import { DataTable, Column, BulkAction } from '@/components/ui/data-tables';
import { Modal, ConfirmModal } from '@/components/ui/modals';
import { ListGridToggle } from '@/components/ui/ListGridToggle';
import { motion, AnimatePresence } from 'framer-motion';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { Select } from '@/components/ui/selects';
import { Badge } from '@/components/ui/badges';
import { Textarea } from '@/components/ui/textareas';
import { Card, CardContent } from '@/components/ui/cards';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type ModalType = 'add' | 'edit' | 'delete' | 'bulk-delete' | 'format' | 'import' | null;
const emptyForm = { endpoint: '', method: 'GET', payload_example: '', response_example: '', company_id: '' };

export default function CompanyApisPage() {
    const t = useTranslations('Dashboard.apis');
    const tc = useTranslations('Common');
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const companyId = searchParams.get('companyId');

    const [apis, setApis] = useState<CompanyApi[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [modal, setModal] = useState<ModalType>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [selected, setSelected] = useState<CompanyApi | null>(null);
    const [bulkSelected, setBulkSelected] = useState<CompanyApi[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [swaggerApis, setSwaggerApis] = useState<any[]>([]);
    const [selectedSwaggerApis, setSelectedSwaggerApis] = useState<Set<number>>(new Set());
    const [docUrl, setDocUrl] = useState('');
    const [formatMappings, setFormatMappings] = useState<{ response_key: string; formated_response_key: string; format_for: 'PAYLOAD' | 'RESPONSE' }[]>([]);
    const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    const fetchCompanies = async () => {
        try {
            const res = await fetch('/api/companies');
            const result = await res.json();
            if (result.status && result.data) setCompanies(result.data);
        } catch { console.error('Failed to fetch companies'); }
    };

    const fetchApis = async () => {
        setIsLoading(true);
        try {
            const url = companyId ? `/api/companies/apis?companyId=${companyId}` : '/api/companies/apis';
            const res = await fetch(url);
            const result: ApiResponse<CompanyApi[]> = await res.json();
            if (result.status && result.data) setApis(result.data);
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        if (user?.role === UserRole.DEVELOPER) {
            fetchApis();
            fetchCompanies();
        }
    }, [user, companyId]);

    const closeModal = () => { setModal(null); setSelected(null); };
    const openAdd = () => { setForm({ ...emptyForm, company_id: companyId || '' }); setSelected(null); setModal('add'); };
    const openEdit = (a: CompanyApi) => {
        setSelected(a);
        setForm({
            endpoint: a.endpoint, method: a.method,
            payload_example: a.payload_example ? JSON.stringify(a.payload_example, null, 2) : '',
            response_example: a.response_example ? JSON.stringify(a.response_example, null, 2) : '',
            company_id: String(a.company_id),
        });
        setModal('edit');
    };
    const openDelete = (a: CompanyApi) => { setSelected(a); setModal('delete'); };
    const openFormat = (a: CompanyApi) => {
        setSelected(a);
        setFormatMappings(a.formated_responses?.map(r => ({ response_key: r.response_key, formated_response_key: r.formated_response_key, format_for: r.format_for as 'PAYLOAD' | 'RESPONSE' || 'RESPONSE' })) || []);
        setModal('format');
    };

    const parseJson = (str: string) => { try { return str ? JSON.parse(str) : null; } catch { return null; } };

    const handleSave = async () => {
        if (!form.endpoint || !form.method || !form.company_id) { toast.error(tc('error')); return; }
        setSaving(true);
        try {
            const isEdit = modal === 'edit' && selected;
            const body = { ...(isEdit ? { id: selected.id } : {}), endpoint: form.endpoint, method: form.method, payload_example: parseJson(form.payload_example), response_example: parseJson(form.response_example), company_id: Number(form.company_id) };
            const res = await fetch('/api/companies/apis', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const result: ApiResponse<CompanyApi> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchApis(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/companies/apis', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id }) });
            const result: ApiResponse<null> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchApis(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleBulkDelete = async () => {
        setSaving(true);
        try {
            await Promise.all(bulkSelected.map(a => fetch('/api/companies/apis', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) })));
            toast.success(tc('success'));
            fetchApis(); closeModal(); setBulkSelected([]);
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleSaveFormat = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await fetch('/api/companies/apis/format', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint_id: selected.id, mappings: formatMappings }) });
            const result: ApiResponse<null> = await res.json();
            if (result.status) { toast.success(tc('success')); fetchApis(); closeModal(); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const openImport = () => {
        setSwaggerApis([]);
        setSelectedSwaggerApis(new Set());
        setDocUrl('');
        setModal('import');
    };

    const handleFetchSwagger = async () => {
        if (!companyId) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/companies/${companyId}/swagger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ docUrl })
            });
            const result = await res.json();
            if (result.status) {
                setSwaggerApis(result.data);
                setSelectedSwaggerApis(new Set(result.data.map((_: any, i: number) => i)));
                toast.success(tc('success'));
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch {
            toast.error(tc('error'));
        }
        setSaving(false);
    };

    const handleImportSwagger = async () => {
        if (!companyId) return;
        setSaving(true);
        try {
            const apisToImport = swaggerApis.filter((_, i) => selectedSwaggerApis.has(i));
            let successCount = 0;
            for (const api of apisToImport) {
                const body = {
                    endpoint: api.endpoint,
                    method: api.method,
                    payload_example: api.payload_example,
                    response_example: api.response_example,
                    company_id: Number(companyId)
                };
                const res = await fetch('/api/companies/apis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (res.ok) successCount++;
            }
            toast.success(tc('success'));
            fetchApis();
            closeModal();
        } catch {
            toast.error(tc('error'));
        }
        setSaving(false);
    };

    const methodVariant = (m: string): any => {
        const map: Record<string, any> = { GET: 'success', POST: 'primary', PUT: 'warning', DELETE: 'danger', PATCH: 'info' };
        return map[m] || 'secondary';
    };

    const columns: Column<CompanyApi>[] = [
        {
            accessorKey: 'method',
            header: t('table.method'),
            cell: ({ row }) => <Badge variant={methodVariant(row.original.method)} className="h-5 px-2 font-semibold uppercase">{row.original.method}</Badge>,
        },
        {
            accessorKey: 'endpoint',
            header: t('table.endpoint'),
            cell: ({ row }) => (
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
                        <Globe size={12} className="text-[#002B5B]" />
                    </div>
                    <Typography variant="large" className="font-mono text-xs font-semibold text-slate-700">{row.original.endpoint}</Typography>
                </div>
            )
        },
        {
            id: 'company',
            header: tc('company'),
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Layers size={14} className="text-slate-400" />
                    <Typography variant="large" className="text-sm font-bold">{row.original.company?.name || `#${row.original.company_id}`}</Typography>
                </div>
            )
        },
        {
            id: 'mappings',
            header: t('table.mappings'),
            cell: ({ row }) => (
                <Badge variant="secondary" className="h-5 px-2 font-semibold text-[10px] bg-slate-50 border-slate-100">
                    {row.original.formated_responses?.length || 0} {t('table.mappingsLabel')}
                </Badge>
            ),
        },
        {
            id: 'actions',
            header: tc('actions'),
            enableSorting: false,
            cell: ({ row: { original: a } }) => (
                <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => openFormat(a)} className="h-8 w-8 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title={t('table.formatTip')}><Sliders size={16} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(a)} className="h-8 w-8 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title={tc('edit')}><Pencil size={16} /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openDelete(a)} className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title={tc('delete')}><Trash2 size={16} /></Button>
                </div>
            ),
        },
    ];

    const bulkActions: BulkAction<CompanyApi>[] = [{
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

    const selectedCompany = companies.find(c => c.id === Number(companyId));

    return (
        <div className="space-y-8 pb-20">
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Webhook size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography as="div" variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {selectedCompany ? (
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-50">{t('subtitleCompany')}</span>
                                        <Badge variant="primary" className="h-4.5 px-2 font-bold text-[9px] uppercase">{selectedCompany.name}</Badge>
                                    </div>
                                ) : companyId ? (
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-50">{t('subtitleId')}</span>
                                        <Badge variant="primary" className="h-4.5 px-2 font-mono text-[9px]">#{companyId}</Badge>
                                    </div>
                                ) : t('subtitle')}
                            </Typography>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                        <Button variant="outline" size="icon" onClick={fetchApis} className="h-10 w-10 shrink-0 border-slate-100">
                            <RefreshCw size={18} className={cn("text-slate-500", isLoading && "animate-spin")} />
                        </Button>

                        {companyId && (
                            <Button variant="outline" onClick={openImport} className="w-full md:w-auto h-10 px-6 border border-slate-100 font-semibold text-sm">
                                <DownloadCloud size={18} className="me-2 text-blue-500" /> <span>{t('import')}</span>
                            </Button>
                        )}
                        
                        <ListGridToggle
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            className="w-full md:w-auto mt-4 md:mt-0 ltr:mr-4 rtl:ml-4"
                        />

                        <Button onClick={openAdd} className="flex-1 md:flex-none h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm">
                            <Plus size={18} className="me-2" /> <span>{t('add')}</span>
                        </Button>
                    </div>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                    {apis?.map((a: CompanyApi) => (
                        <CustomCard 
                            key={a.id} 
                            title={a.endpoint} 
                            subtitle={a.company?.name || `#${a.company_id}`} 
                            badge={{ text: a.method, variant: methodVariant(a.method) === 'primary' ? 'default' : methodVariant(a.method) }} 
                            stats={[
                                { label: t('table.mappingsLabel'), value: a.formated_responses?.length || 0 }
                            ]} 
                            actionLabel={tc('edit')}
                            onAction={() => typeof openEdit !== 'undefined' ? openEdit(a) : {}} 
                            icon={<Webhook size={20} />}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-6">
                    <DataTable
                    columns={columns}
                    data={apis}
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
                title={modal === 'add' ? t('form.addTitle') : t('form.editTitle')} size="5xl">
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div className="md:col-span-2">
                            <Input
                                label={t('form.endpoint') + " *"}
                                value={form.endpoint}
                                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                                placeholder={t('form.endpointPlaceholder')}
                                icon={Globe}
                                className="font-mono text-sm"
                            />
                        </div>
                        <Select
                            label={t('form.method') + " *"}
                            value={form.method}
                            onValueChange={(val) => setForm({ ...form, method: val })}
                            options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ value: m, label: m }))}
                        />
                        <Select
                            label={tc('company') + " *"}
                            value={form.company_id}
                            onValueChange={(val) => setForm({ ...form, company_id: val })}
                            options={companies.map(c => ({ value: String(c.id), label: c.name }))}
                            placeholder={tc('select')}
                        />
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between px-1">
                            <Typography variant="label" className="text-slate-400 font-semibold">{t('form.templates') || 'Quick Templates'}</Typography>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { label: 'Auth Login', payload: { username: '...', password: '...' }, response: { status: true, token: '...', user: { id: 1, name: '...' } } },
                                { label: 'Fetch Users', payload: null, response: { status: true, data: [{ id: 1, fullname: '...', email: '...' }] } },
                                { label: 'Send SMS', payload: { to: '+216...', message: '...' }, response: { success: true, message_id: '...' } },
                                { label: 'Push Notif', payload: { title: '...', body: '...', tokens: ['...'] }, response: { success: true } }
                            ].map((tpl, i) => (
                                <Button
                                    key={i}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setForm({
                                        ...form,
                                        payload_example: tpl.payload ? JSON.stringify(tpl.payload, null, 2) : '',
                                        response_example: tpl.response ? JSON.stringify(tpl.response, null, 2) : ''
                                    })}
                                    className="h-8 px-3 rounded-lg border-slate-100 hover:border-[#002B5B] hover:bg-[#002B5B]/5 transition-all text-[10px] font-semibold text-[#002B5B]"
                                >
                                    <Lightbulb size={11} className="me-1.5" /> {tpl.label}
                                </Button>
                    ))}
                </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <Typography variant="label" className="text-slate-400 font-semibold px-1">{t('form.payload')}</Typography>
                            <div className="relative group">
                                <Textarea
                                    value={form.payload_example}
                                    onChange={(e) => setForm({ ...form, payload_example: e.target.value })}
                                    rows={8}
                                    placeholder={t('form.payloadPlaceholder')}
                                    className="font-mono text-xs bg-slate-50/50 border-slate-100 focus:bg-white focus:border-[#002B5B] transition-all rounded-xl p-4"
                                />
                                <div className="absolute top-3 right-3 text-slate-300 group-focus-within:text-[#002B5B] transition-colors">
                                    <Code2 size={14} />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Typography variant="label" className="text-slate-400 font-semibold px-1">{t('form.response')}</Typography>
                            <div className="relative group">
                                <Textarea
                                    value={form.response_example}
                                    onChange={(e) => setForm({ ...form, response_example: e.target.value })}
                                    rows={8}
                                    placeholder={t('form.responsePlaceholder')}
                                    className="font-mono text-xs bg-slate-50/50 border-slate-100 focus:bg-white focus:border-[#002B5B] transition-all rounded-xl p-4"
                                />
                                <div className="absolute top-3 right-3 text-slate-300 group-focus-within:text-[#002B5B] transition-colors">
                                    <Code2 size={14} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-10">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-11 font-semibold text-sm">{tc('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 font-semibold text-sm shadow-lg shadow-blue-900/10">
                        {saving ? tc('processing') : tc('save')}
                    </Button>
                </div>
            </Modal>

            {/* Import Swagger Modal */}
            <Modal isOpen={modal === 'import'} onClose={closeModal} title={t('swagger.title')} size="6xl">
                <div className="space-y-8">
                    <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 bg-blue-50/50 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border border-blue-100/50">
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-white rounded-xl md:rounded-2xl flex items-center justify-center text-blue-500 shadow-sm shrink-0 border border-blue-100">
                            <Lightbulb size={28} className="md:w-8 md:h-8" />
                        </div>
                        <Typography variant="p" className="text-slate-600 leading-relaxed text-xs md:text-sm text-center md:text-left">
                            {t('swagger.description')}
                        </Typography>
                    </div>

                    <div className="flex flex-col md:flex-row items-end gap-4 bg-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-sm">
                        <div className="flex-1 w-full">
                            <Input
                                label={t('swagger.url')}
                                value={docUrl}
                                onChange={(e) => setDocUrl(e.target.value)}
                                placeholder={t('swagger.placeholder')}
                                icon={Link2}
                                className="font-mono text-xs md:text-sm"
                            />
                        </div>
                        <Button onClick={handleFetchSwagger} disabled={saving} className="w-full md:w-auto h-11 px-8 shadow-xl shadow-blue-900/10 min-w-[160px] uppercase font-bold text-xs">
                            {saving ? <Loader2 size={18} className="animate-spin" /> : t('swagger.fetch')}
                        </Button>
                    </div>

                    <AnimatePresence>
                        {swaggerApis.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6 bg-slate-50/50 rounded-[1.5rem] md:rounded-[2.5rem] p-6 md:p-10 border border-slate-100"
                            >
                                <div className="flex items-center justify-between px-4">
                                    <div className="flex items-center gap-4">
                                        <Badge variant="primary" className="h-6 px-3 font-bold text-xs rounded-lg">{swaggerApis.length}</Badge>
                                        <Typography variant="h3" className="text-base font-bold uppercase">{t('swagger.found')}</Typography>
                                    </div>
                                    <Button variant="ghost" onClick={() => {
                                        if (selectedSwaggerApis.size === swaggerApis.length) setSelectedSwaggerApis(new Set());
                                        else setSelectedSwaggerApis(new Set(swaggerApis.map((_, i) => i)));
                                    }} className="text-[#002B5B] font-bold uppercase text-xs hover:bg-white rounded-lg h-9 px-4">
                                        {selectedSwaggerApis.size === swaggerApis.length ? t('swagger.deselectAll') : t('swagger.toggle')}
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                                    {swaggerApis.map((api, idx) => (
                                        <motion.div
                                            key={idx}
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => {
                                                const newSet = new Set(selectedSwaggerApis);
                                                if (newSet.has(idx)) newSet.delete(idx); else newSet.add(idx);
                                                setSelectedSwaggerApis(newSet);
                                            }}
                                            className={cn(
                                                "flex items-start gap-5 p-6 rounded-[1.5rem] border-2 transition-all cursor-pointer group",
                                                selectedSwaggerApis.has(idx) ? "bg-white border-[#002B5B] shadow-xl shadow-blue-900/5" : "bg-white border-slate-50 hover:border-slate-200"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all mt-1 shrink-0",
                                                selectedSwaggerApis.has(idx) ? "bg-[#002B5B] border-[#002B5B] text-white shadow-inner" : "border-slate-200"
                                            )}>
                                                {selectedSwaggerApis.has(idx) && <CheckCircle2 size={14} />}
                                            </div>
                                            <div className="min-w-0 space-y-1.5">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant={methodVariant(api.method)} className="h-5 px-2 font-bold uppercase text-[11px]">{api.method}</Badge>
                                                    <Typography variant="p" className="font-mono text-[12px] font-bold text-slate-700">{api.endpoint}</Typography>
                                                </div>
                                                <Typography variant="small" color="secondary" className="text-[11px] line-clamp-2 leading-relaxed">{api.summary || t('swagger.noSummary')}</Typography>
                                            </div>
                                        </motion.div>
                    ))}
                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-10">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-11 font-bold uppercase text-xs">{tc('cancel')}</Button>
                    <Button
                        onClick={handleImportSwagger}
                        disabled={saving || swaggerApis.length === 0 || selectedSwaggerApis.size === 0}
                        className="flex-1 h-11 font-bold uppercase text-xs shadow-xl shadow-blue-900/10"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : `${t('swagger.importSelected')} (${selectedSwaggerApis.size})`}
                        <ArrowRight className="ms-2 w-4 h-4" />
                    </Button>
                </div>
            </Modal>

            {/* Format Mappings Modal */}
            <Modal isOpen={modal === 'format'} onClose={closeModal}
                title={t('format.title')}
                description={t('format.description')}
                size="4xl">
                <div className="space-y-6">
                    {formatMappings.length === 0 && (
                        <div className="text-center py-16 md:py-24 bg-slate-50/50 rounded-[1.5rem] md:rounded-[2.5rem] border border-dashed border-slate-200">
                            <div className="w-12 h-12 md:w-16 md:h-16 bg-white rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-200 shadow-sm border border-slate-50">
                                <Sliders size={28} className="md:w-8 md:h-8" />
                            </div>
                            <Typography variant="p" color="secondary" className="italic text-sm md:text-base">{t('format.empty')}</Typography>
                        </div>
                    )}
                    <AnimatePresence>
                        {formatMappings.map((m, i) => (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={i}
                                className="flex flex-col md:flex-row gap-4 md:gap-6 items-center bg-white p-4 md:p-6 rounded-[1.2rem] md:rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-blue-900/5 transition-all group"
                            >
                                <div className="flex-1 space-y-2 w-full md:w-auto">
                                    <Typography variant="label" className="px-1 uppercase text-sm text-slate-400">{t('format.theirKey')}</Typography>
                                    <Input
                                        value={m.response_key}
                                        onChange={(e) => { const n = [...formatMappings]; n[i].response_key = e.target.value; setFormatMappings(n); }}
                                        placeholder="user_fullname"
                                        className="font-mono text-sm bg-slate-50/50 border-transparent hover:border-slate-200"
                                        icon={Database}
                                    />
                                </div>
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100 text-blue-500 shadow-sm rotate-90 md:rotate-0">
                                    <ArrowRight size={18} className="md:w-5 md:h-5" strokeWidth={3} />
                                </div>
                                <div className="flex-1 space-y-2 w-full md:w-auto">
                                    <Typography variant="label" className="px-1 uppercase text-sm text-slate-400">{t('format.axiaKey')}</Typography>
                                    <Input
                                        value={m.formated_response_key}
                                        onChange={(e) => { const n = [...formatMappings]; n[i].formated_response_key = e.target.value; setFormatMappings(n); }}
                                        placeholder="fullname"
                                        className="font-mono text-sm bg-slate-50/50 border-transparent hover:border-slate-200"
                                        icon={CheckCircle2}
                                    />
                                </div>
                                <div className="flex-1 space-y-2 w-full md:w-auto">
                                    <Typography variant="label" className="px-1 uppercase text-sm text-slate-400">Direction</Typography>
                                    <Select
                                        value={m.format_for}
                                        onValueChange={(val) => { const n = [...formatMappings]; n[i].format_for = val as 'PAYLOAD' | 'RESPONSE'; setFormatMappings(n); }}
                                        options={[
                                            { value: 'RESPONSE', label: 'Response' },
                                            { value: 'PAYLOAD', label: 'Payload' },
                                        ]}
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setFormatMappings(formatMappings.filter((_, j) => j !== i))}
                                    className="h-10 w-10 md:h-12 md:w-12 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-xl md:rounded-2xl shrink-0 md:mt-6 transition-all self-end md:self-center"
                                >
                                    <X size={20} className="md:w-5.5 md:h-5.5" />
                                </Button>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    <Button
                        variant="ghost"
                        onClick={() => setFormatMappings([...formatMappings, { response_key: '', formated_response_key: '', format_for: 'RESPONSE' }])}
                        className="w-full h-11 border-2 border-dashed border-slate-100 rounded-xl hover:border-[#002B5B]/30 hover:bg-[#002B5B]/5 transition-all text-[#002B5B] font-bold uppercase text-xs"
                    >
                        <Plus size={16} className="me-2" /> {t('format.add')}
                    </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-10">
                    <Button variant="outline" onClick={closeModal} className="flex-1 h-11 font-bold uppercase text-xs">{tc('cancel')}</Button>
                    <Button onClick={handleSaveFormat} disabled={saving} className="flex-1 h-11 font-bold uppercase text-xs shadow-xl shadow-blue-900/10">
                        {saving ? <Loader2 size={18} className="animate-spin" /> : tc('save')}
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
