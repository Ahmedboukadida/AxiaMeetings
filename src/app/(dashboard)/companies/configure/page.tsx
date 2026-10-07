'use client';

import { useEffect, useState, Suspense } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Company, CompanyApi, ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { ArrowLeft, Settings2, CheckCircle2, XCircle, Save, Info, ShieldCheck, Globe, Mail, MessageSquare, Phone, Settings } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/selects';
import { Card, CardContent } from '@/components/ui/cards';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';

interface CompanyWithConfig extends Company {
    login_endpoint_id: number | null;
    users_endpoint_id: number | null;
}

const emptyConfig = {
    login_endpoint_id: '',
    users_endpoint_id: '',
    have_notifications_service: false,
    notifications_service_endpoint_id: '',
    have_messages_service: false,
    messages_service_endpoint_id: '',
    have_sms_service: false,
    sms_service_endpoint_id: '',
};

function ConfigureServicesContent() {
    const t = useTranslations('Dashboard.companies');
    const tc = useTranslations('Common');
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const companyId = searchParams.get('companyId');

    const [company, setCompany] = useState<CompanyWithConfig | null>(null);
    const [apis, setApis] = useState<CompanyApi[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [config, setConfig] = useState(emptyConfig);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    useEffect(() => {
        if (!companyId || user?.role !== UserRole.DEVELOPER) return;
        const load = async () => {
            setIsLoading(true);
            try {
                const [compRes, apisRes] = await Promise.all([
                    fetch(`/api/companies/${companyId}`),
                    fetch(`/api/companies/apis?companyId=${companyId}`),
                ]);
                const compData: ApiResponse<CompanyWithConfig> = await compRes.json();
                const apisData: ApiResponse<CompanyApi[]> = await apisRes.json();

                if (compData.status && compData.data) {
                    const c = compData.data;
                    setCompany(c);
                    setConfig({
                        login_endpoint_id: c.login_endpoint_id ? String(c.login_endpoint_id) : '',
                        users_endpoint_id: c.users_endpoint_id ? String(c.users_endpoint_id) : '',
                        have_notifications_service: c.have_notifications_service,
                        notifications_service_endpoint_id: c.notifications_service_endpoint_id ? String(c.notifications_service_endpoint_id) : '',
                        have_messages_service: c.have_messages_service,
                        messages_service_endpoint_id: c.messages_service_endpoint_id ? String(c.messages_service_endpoint_id) : '',
                        have_sms_service: c.have_sms_service,
                        sms_service_endpoint_id: c.sms_service_endpoint_id ? String(c.sms_service_endpoint_id) : '',
                    });
                }
                if (apisData.status && apisData.data) setApis(apisData.data);
            } catch { toast.error(tc('error')); }
            finally { setIsLoading(false); }
        };
        load();
    }, [companyId, user, tc]);

    const handleSave = async () => {
        if (!company) return;
        if (!config.login_endpoint_id) {
            toast.error(tc('error'));
            return;
        }
        setSaving(true);
        try {
            const body = {
                name: company.name,
                logo_url: company.logo_url,
                url: company.url,
                database_schema: company.database_schema,
                login_endpoint_id: Number(config.login_endpoint_id),
                users_endpoint_id: config.users_endpoint_id ? Number(config.users_endpoint_id) : null,
                have_notifications_service: config.have_notifications_service,
                notifications_service_endpoint_id: config.have_notifications_service && config.notifications_service_endpoint_id
                    ? Number(config.notifications_service_endpoint_id) : null,
                have_messages_service: config.have_messages_service,
                messages_service_endpoint_id: config.have_messages_service && config.messages_service_endpoint_id
                    ? Number(config.messages_service_endpoint_id) : null,
                have_sms_service: config.have_sms_service,
                sms_service_endpoint_id: config.have_sms_service && config.sms_service_endpoint_id
                    ? Number(config.sms_service_endpoint_id) : null,
            };
            const res = await fetch(`/api/companies/${companyId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result: ApiResponse<Company> = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                router.push('/companies');
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    if (authLoading || isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                <Typography variant="label">{tc('loading')}</Typography>
            </div>
        );
    }

    if (!companyId) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-center">
                <Typography variant="p" color="secondary">{t('config.noCompanySelected')}</Typography>
                <Link href="/companies" className="mt-4">
                    <Button variant="link" className="font-bold underline uppercase">{tc('back')}</Button>
                </Link>
            </div>
        );
    }

    const sections = [
        {
            key: 'login_endpoint_id',
            label: t('config.loginLabel'),
            desc: t('config.loginDesc'),
            icon: ShieldCheck,
            color: 'blue',
            required: true,
            filter: 'POST'
        },
        {
            key: 'users_endpoint_id',
            label: t('config.usersLabel'),
            desc: t('config.usersDesc'),
            icon: Globe,
            color: 'slate',
            required: false,
            filter: 'GET'
        }
    ];

    const toggles = [
        {
            toggleKey: 'have_notifications_service',
            endpointKey: 'notifications_service_endpoint_id',
            label: t('config.notifLabel'),
            desc: t('config.notifDesc'),
            icon: Mail
        },
        {
            toggleKey: 'have_messages_service',
            endpointKey: 'messages_service_endpoint_id',
            label: t('config.msgLabel'),
            desc: t('config.msgDesc'),
            icon: MessageSquare
        },
        {
            toggleKey: 'have_sms_service',
            endpointKey: 'sms_service_endpoint_id',
            label: t('config.smsLabel'),
            desc: t('config.smsDesc'),
            icon: Phone
        }
    ];

    return (
        <div className="space-y-8 pb-20 max-w-4xl">
            {/* Header */}
            <div className="bg-white p-6 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                    <div className="space-y-6">
                        <button onClick={() => router.push('/companies')}
                            className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 hover:text-[#002B5B] transition-all group">
                            <ArrowLeft size={12} className="group-hover:-translate-x-1 transition-transform" /> {tc('back')}
                        </button>
                        <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left">
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-[#002B5B] rounded-[1.2rem] md:rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shadow-blue-900/20 shrink-0">
                                <Settings size={32} className="md:w-9 md:h-9" />
                            </div>
                            <div>
                                <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('config.title')}</Typography>
                                <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                    {t('config.assignDescription', { name: company?.name || '' })}
                                </Typography>
                            </div>
                        </div>
                    </div>
                    <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto px-8 h-11 shadow-lg shadow-blue-900/10 uppercase font-bold text-xs">
                        <Save size={18} className="me-2" /> {saving ? tc('processing') : tc('save')}
                    </Button>
                </div>

                {apis.length === 0 && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                    className="p-5 md:p-6 bg-amber-50 border border-amber-200 rounded-[1.2rem] md:rounded-[2rem] text-amber-800 flex flex-col md:flex-row items-center gap-4 shadow-sm shadow-amber-900/5">
                    <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-amber-500 shadow-sm shrink-0">
                        <Info size={24} />
                    </div>
                    <div>
                        <Typography variant="large" className="text-amber-900">{t('config.noApisWarning')}</Typography>
                        <Link href={`/companies/apis?companyId=${companyId}`} className="text-[11px] font-bold underline uppercase mt-1 block hover:text-amber-700 transition-colors">
                            {t('config.addApisFirst')}
                        </Link>
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 gap-6">
                {/* Core Services */}
                {sections.map((s) => (
                    <Card key={s.key} className={cn("overflow-hidden border-2", s.required && !config[s.key as keyof typeof config] ? "border-amber-100" : "border-slate-100")}>
                        <CardContent className="p-6 md:p-8">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                <div className="flex gap-4">
                                    <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 shadow-sm", s.color === 'blue' ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600")}>
                                        <s.icon size={20} className="md:w-5.5 md:h-5.5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <Typography variant="h4" className="uppercase text-xs font-bold">{s.label}</Typography>
                                            {s.required && <Badge variant="destructive" size="sm">{tc('required')}</Badge>}
                                            {config[s.key as keyof typeof config] && <CheckCircle2 size={18} className="text-emerald-500" />}
                                        </div>
                                        <Typography variant="p" className="text-sm mt-1">{s.desc}</Typography>
                                    </div>
                                </div>
                                <div className="w-full lg:w-96">
                                    <Select
                                        value={config[s.key as keyof typeof config] as string}
                                        onValueChange={(val) => setConfig({ ...config, [s.key]: val })}
                                        options={apis.filter(a => !s.filter || a.method === s.filter).map(a => ({
                                            value: String(a.id),
                                            label: `${a.method} ${a.endpoint}`
                                        }))}
                                        placeholder={`— ${s.required ? tc('selectRequired') : tc('none')} —`}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {/* Optional Services with Toggles */}
                <div className="grid grid-cols-1 gap-6">
                    {toggles.map((tgl) => (
                        <Card key={tgl.toggleKey} className={cn("overflow-hidden transition-all duration-500", (config as any)[tgl.toggleKey] ? "bg-slate-50/50 border-blue-100" : "bg-white border-slate-100")}>
                            <CardContent className="p-6 md:p-8">
                                <div className="flex flex-col space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-4">
                                            <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-all duration-500", (config as any)[tgl.toggleKey] ? "bg-[#002B5B] text-white" : "bg-slate-50 text-slate-400")}>
                                                <tgl.icon size={20} className="md:w-5.5 md:h-5.5" />
                                            </div>
                                            <div>
                                                <Typography variant="h4" className="uppercase text-xs font-bold">{tgl.label}</Typography>
                                                <Typography variant="p" className="text-sm mt-1">{tgl.desc}</Typography>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setConfig({ ...config, [tgl.toggleKey]: !(config as any)[tgl.toggleKey] })}
                                            className={cn(
                                                "relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 shadow-inner",
                                                (config as any)[tgl.toggleKey] ? 'bg-[#002B5B]' : 'bg-slate-200'
                                            )}
                                        >
                                            <span className={cn(
                                                "inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-300",
                                                (config as any)[tgl.toggleKey] ? 'translate-x-7' : 'translate-x-1'
                                            )} />
                                        </button>
                                    </div>

                                    <AnimatePresence>
                                        {(config as any)[tgl.toggleKey] && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="pt-2">
                                                    <Select
                                                        value={(config as any)[tgl.endpointKey]}
                                                        onValueChange={(val) => setConfig({ ...config, [tgl.endpointKey]: val })}
                                                        options={apis.map(a => ({
                                                            value: String(a.id),
                                                            label: `${a.method} ${a.endpoint}`
                                                        }))}
                                                        placeholder={`— ${tc('select')} —`}
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6">
                <Link href="/companies" className="w-full sm:w-auto">
                    <Button variant="outline" className="w-full sm:px-8 h-11 uppercase font-bold text-xs">{tc('cancel')}</Button>
                </Link>
                <Button onClick={handleSave} disabled={saving || apis.length === 0} className="w-full sm:w-auto sm:px-12 h-11 shadow-lg shadow-blue-900/10 uppercase font-bold text-xs">
                    <Save size={18} className="me-2" /> {saving ? tc('processing') : tc('save')}
                </Button>
            </div>
        </div>
    );
}

export default function ConfigureServicesPage() {
    const tc = useTranslations('Common');
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                <Typography variant="label">{tc('loading')}</Typography>
            </div>
        }>
            <ConfigureServicesContent />
        </Suspense>
    );
}

