'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { ApiResponse } from '@/lib/types';
import { UserRole } from '@/lib/enums/users';
import { toast } from 'sonner';
import { Link2, Unlink, CheckCircle2, AlertCircle, Info, Building2, UserCircle2, ArrowRight, Shield, ShieldCheck, Key, Lock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { Select } from '@/components/ui/selects';
import { Badge } from '@/components/ui/badges';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface LinkStatus {
    id: number;
    username: string | null;
    token_id: string | null;
    company_id: number;
}

export default function CompanyLinkPage() {
    const t = useTranslations('Dashboard.link');
    const tc = useTranslations('Common');
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [form, setForm] = useState({ username: '', password: '' });
    const [saving, setSaving] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
    const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('');
    const [admins, setAdmins] = useState<{ id: number; fullname: string; username: string }[]>([]);
    const [selectedAdminFilter, setSelectedAdminFilter] = useState<string>('');

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.ADMIN && user?.role !== UserRole.DEVELOPER) {
            router.replace('/overview');
        }
    }, [user, authLoading, router]);

    const fetchCompanies = async () => {
        if (user?.role !== UserRole.DEVELOPER) return;
        try {
            const res = await fetch('/api/companies');
            const result = await res.json();
            if (result.status && result.data) setCompanies(result.data);
        } catch { toast.error(tc('error')); }
    };

    const fetchLinkStatus = async () => {
        if (user?.role === UserRole.DEVELOPER && (!selectedCompanyFilter || !selectedAdminFilter)) {
            setIsLoading(false);
            setLinkStatus(null);
            return;
        }
        setIsLoading(true);
        try {
            const url = user?.role === UserRole.DEVELOPER ? `/api/companies/link?companyId=${selectedCompanyFilter}&adminId=${selectedAdminFilter}` : '/api/companies/link';
            const res = await fetch(url);
            const result: ApiResponse<LinkStatus> = await res.json();
            if (result.status) setLinkStatus(result.data || null);
            else setLinkStatus(null);
        } catch { setLinkStatus(null); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        if (user?.role === UserRole.ADMIN || user?.role === UserRole.DEVELOPER) fetchCompanies();
    }, [user]);

    useEffect(() => {
        if (user?.role === UserRole.DEVELOPER && selectedCompanyFilter) {
            const fetchAdmins = async () => {
                try {
                    const res = await fetch(`/api/users?companyId=${selectedCompanyFilter}`);
                    const result = await res.json();
                    if (result.status && result.data) {
                        setAdmins(result.data.filter((u: any) => u.role === UserRole.ADMIN));
                    }
                } catch { console.error('Failed to fetch admins'); }
            };
            fetchAdmins();
        } else {
            setAdmins([]);
            setSelectedAdminFilter('');
        }
    }, [selectedCompanyFilter, user]);

    useEffect(() => {
        if (user?.role === UserRole.ADMIN || user?.role === UserRole.DEVELOPER) fetchLinkStatus();
    }, [user, selectedCompanyFilter, selectedAdminFilter]);

    const handleLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.username || !form.password) { toast.error(tc('error')); return; }
        setSaving(true);
        try {
            const payload = user?.role === UserRole.DEVELOPER ? { ...form, companyId: selectedCompanyFilter, adminId: selectedAdminFilter } : form;
            const res = await fetch('/api/companies/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result: ApiResponse<{ token_id: string }> = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                setForm({ username: '', password: '' });
                fetchLinkStatus();
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch { toast.error(tc('error')); }
        finally { setSaving(false); }
    };

    const handleUnlink = async () => {
        setUnlinking(true);
        try {
            const url = user?.role === UserRole.DEVELOPER ? `/api/companies/link?companyId=${selectedCompanyFilter}&adminId=${selectedAdminFilter}` : '/api/companies/link';
            const res = await fetch(url, { method: 'DELETE' });
            const result: ApiResponse<null> = await res.json();
            if (result.status) { toast.success(tc('success')); setLinkStatus(null); }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setUnlinking(false); }
    };

    if (authLoading || isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                <Typography variant="label">{tc('loading')}</Typography>
            </div>
        );
    }

    const isLinked = !!linkStatus?.token_id;

    return (
        <div className="space-y-8 pb-20">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                        <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                        <Link2 size={20} className="md:w-6 md:h-6" />
                    </div>
                    <div>
                        <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                        <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                            {t('description')}
                        </Typography>
                    </div>
                </div>
            </div>

            {/* Developer Controls */}
            {user?.role === UserRole.DEVELOPER && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-slate-200 shadow-blue-900/5 transition-all hover:shadow-xl group">
                        <CardContent className="p-6 md:p-10 space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                    <Building2 size={20} className="md:w-6 md:h-6" />
                                </div>
                                <div>
                                    <Typography variant="large" className="text-slate-900 font-bold uppercase text-[11px]">{t('dev.selectCompany')}</Typography>
                                    <Typography variant="small" color="secondary" className="text-[10px] uppercase font-bold">{t('dev.companyDesc')}</Typography>
                                </div>
                            </div>
                            <Select
                                value={selectedCompanyFilter}
                                onValueChange={(val) => { setSelectedCompanyFilter(val); setLinkStatus(null); }}
                                options={companies.map(c => ({ value: String(c.id), label: c.name }))}
                                placeholder={tc('select')}
                            />
                        </CardContent>
                    </Card>

                    <AnimatePresence mode="wait">
                        {selectedCompanyFilter ? (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="h-full"
                            >
                                <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-slate-200 shadow-blue-900/5 transition-all hover:shadow-xl group h-full">
                                    <CardContent className="p-6 md:p-10 space-y-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 group-hover:bg-purple-600 group-hover:text-white transition-all">
                                                <UserCircle2 size={20} className="md:w-6 md:h-6" />
                                            </div>
                                            <div>
                                                <Typography variant="large" className="text-slate-900 font-bold uppercase text-[11px]">{t('dev.selectAdmin')}</Typography>
                                                <Typography variant="small" color="secondary" className="text-[10px] uppercase font-bold">{t('dev.adminDesc')}</Typography>
                                            </div>
                                        </div>
                                        <Select
                                            value={selectedAdminFilter}
                                            onValueChange={(val) => { setSelectedAdminFilter(val); setLinkStatus(null); }}
                                            options={admins.map(a => ({ value: String(a.id), label: a.fullname || a.username }))}
                                            placeholder={tc('select')}
                                        />
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ) : (
                            <div className="bg-slate-50/50 rounded-[1.5rem] md:rounded-[2.5rem] border border-dashed border-slate-200 flex flex-col items-center justify-center p-8 md:p-10 text-center text-slate-400">
                                <Shield className="w-8 h-8 mb-3 opacity-20" />
                                <Typography variant="small" className="font-bold uppercase text-[10px]">{t('dev.selectionRequired')}</Typography>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {user?.role === UserRole.DEVELOPER && (!selectedCompanyFilter || !selectedAdminFilter) ? (
                <div className="hidden" />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Main Content Area */}
                    <div className="lg:col-span-7 space-y-8">
                        {/* Status Visualization */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={cn(
                                "rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-12 border-2 transition-all duration-700 relative overflow-hidden",
                                isLinked
                                    ? "bg-emerald-50/30 border-emerald-100 shadow-2xl shadow-emerald-900/5"
                                    : "bg-amber-50/30 border-amber-100 shadow-2xl shadow-amber-900/5"
                            )}
                        >
                            <div className={cn(
                                "absolute -bottom-8 -right-8 w-40 h-40 opacity-5",
                                isLinked ? "text-emerald-500" : "text-amber-500"
                            )}>
                                {isLinked ? <ShieldCheck size={160} /> : <AlertCircle size={160} />}
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10">
                                <div className="shrink-0">
                                    <div className={cn(
                                        "w-16 h-16 md:w-24 md:h-24 rounded-[1.2rem] md:rounded-[2rem] flex items-center justify-center shadow-2xl border transition-all duration-700",
                                        isLinked
                                            ? "bg-emerald-500 text-white border-emerald-300 scale-110 shadow-emerald-500/20"
                                            : "bg-amber-500 text-white border-amber-300 shadow-amber-500/20"
                                    )}>
                                        {isLinked ? <ShieldCheck size={32} className="md:w-12 md:h-12" /> : <AlertCircle size={32} className="md:w-12 md:h-12" />}
                                    </div>
                                </div>
                                <div className="text-center sm:text-left space-y-2">
                                    <Typography variant="h2" className={cn("text-xl font-bold", isLinked ? 'text-emerald-900' : 'text-amber-900')}>
                                        {isLinked ? t('status.linked') : t('status.notLinked')}
                                    </Typography>
                                    <Typography variant="large" className={cn("font-bold text-[11px] uppercase", isLinked ? 'text-emerald-800' : 'text-amber-800')}>
                                        {isLinked
                                            ? t('status.active', { username: linkStatus?.username || '' })
                                            : t('status.action')}
                                    </Typography>
                                    {isLinked && (
                                        <div className="pt-2">
                                            <Badge variant="success" className="h-5 px-2 font-mono text-[9px] bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/20">
                                                {t('status.tokenPrefix')}: {linkStatus?.token_id?.slice(0, 8)}...
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        {/* Link/Unlink Interaction Panel */}
                        <AnimatePresence mode="wait">
                            {!isLinked ? (
                                <motion.div
                                    key="link-panel"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-slate-100 shadow-2xl shadow-blue-900/5 p-8 md:p-12">
                                        <div className="flex items-center gap-4 mb-10">
                                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#002B5B] flex items-center justify-center border border-blue-100">
                                                <Key size={24} />
                                            </div>
                                            <div>
                                                <Typography variant="h4" className="text-sm font-bold uppercase">{t('form.title')}</Typography>
                                                <Typography variant="small" color="secondary" className="text-[10px] font-bold uppercase">{t('form.authRequired')}</Typography>
                                            </div>
                                        </div>

                                        <form onSubmit={handleLink} className="space-y-6">
                                            <Input
                                                label={tc('username')}
                                                value={form.username}
                                                onChange={(e) => setForm({ ...form, username: e.target.value })}
                                                placeholder={t('form.usernamePlaceholder')}
                                                icon={UserCircle2}
                                                required
                                            />
                                            <Input
                                                label={tc('password')}
                                                type="password"
                                                value={form.password}
                                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                                                placeholder={t('form.passwordPlaceholder')}
                                                icon={Lock}
                                                required
                                            />
                                            <Button
                                                type="submit"
                                                disabled={saving}
                                                className="w-full h-11 text-xs uppercase font-bold shadow-lg shadow-blue-900/10 mt-4 rounded-xl"
                                            >
                                                {saving ? <Loader2 size={16} className="animate-spin me-2" /> : <Link2 size={16} className="me-2" />}
                                                {saving ? tc('processing') : t('form.link')}
                                                {!saving && <ArrowRight className="ml-auto w-4 h-4 opacity-50" />}
                                            </Button>
                                        </form>
                                    </Card>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="unlink-panel"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <Card className="rounded-[1.5rem] md:rounded-[2.5rem] border-red-50 shadow-2xl shadow-red-900/5 p-8 md:p-12 bg-white">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100">
                                                <Unlink size={24} />
                                            </div>
                                            <Typography variant="h3" className="text-red-900">{t('manage.title')}</Typography>
                                        </div>

                                        <Typography variant="p" className="text-slate-500 mb-10 leading-relaxed text-base">
                                            {t('manage.description')}
                                        </Typography>

                                        <Button
                                            variant="danger"
                                            onClick={handleUnlink}
                                            disabled={unlinking}
                                            className="w-full sm:w-auto h-11 px-8 text-xs uppercase font-bold shadow-lg shadow-red-900/10 rounded-xl"
                                        >
                                            {unlinking ? <Loader2 size={16} className="animate-spin me-2" /> : <Unlink size={16} className="me-2" />}
                                            {unlinking ? tc('processing') : t('manage.unlink')}
                                        </Button>
                                    </Card>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Information Sidebar */}
                    <div className="lg:col-span-5 h-full">
                        <div className="bg-linear-to-br from-[#002B5B] to-[#1a4a8a] rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-12 text-white shadow-2xl shadow-blue-900/20 relative overflow-hidden h-full">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-400/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>

                            <div className="flex items-center gap-5 mb-10 relative z-10">
                                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20">
                                    <Info size={28} className="text-blue-300" />
                                </div>
                                <Typography variant="h2" className="text-2xl text-white font-bold">{t('info.howTitle')}</Typography>
                            </div>

                            <div className="space-y-10 relative z-10">
                                <div className="space-y-4">
                                    <Typography variant="p" className="text-white leading-relaxed text-lg font-medium opacity-90">
                                        {t('info.howDesc')}
                                    </Typography>
                                </div>

                                <Card className="bg-white/10 backdrop-blur-xl border-white/10 shadow-none rounded-[1.2rem] md:rounded-[2rem]">
                                    <CardContent className="p-6 md:p-8 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <Badge variant="secondary" className="bg-blue-400 text-[#002B5B] border-none font-bold text-[10px] uppercase h-5">{t('info.proTip')}</Badge>
                                            <div className="h-px bg-white/10 flex-1" />
                                        </div>
                                        <Typography variant="p" className="text-blue-200 italic leading-relaxed font-bold text-xs">
                                            {t('info.howTip')}
                                        </Typography>
                                    </CardContent>
                                </Card>

                                <div className="flex items-center gap-4 text-blue-300/40">
                                    <Shield size={24} />
                                    <div className="h-px bg-blue-300/20 flex-1" />
                                    <Lock size={24} />
                                    <div className="h-px bg-blue-300/20 flex-1" />
                                    <Key size={24} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
