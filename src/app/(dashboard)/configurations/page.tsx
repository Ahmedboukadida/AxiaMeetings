'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { AppSettings, ApiResponse } from '@/lib/types';
import { toast } from 'sonner';
import { UserRole } from '@/lib/enums/users';
import {
    Server, Phone, Share2, Video, FileText,
    Sparkles, Music2, ExternalLink, Mail, Globe, Lock, ShieldCheck, Settings2, Info, ArrowRight, Loader2, Hash, Key, User, AtSign, MapPin, Settings
} from 'lucide-react';
import { FaFacebookF as Facebook, FaLinkedinIn as Linkedin, FaTiktok as TikTok } from "react-icons/fa";
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { Textarea } from '@/components/ui/textareas';
import { Switch } from '@/components/ui/switchs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';

const emptyForm = {
    email: '', email_password: '', host: '', port: 465, ssl: false, from_email: '', from_name: '',
    logo_file_name: '', favicon_file_name: '',
    contact_phone: '', contact_email: '', contact_adress: '',
    facebook: '', linkedin: '', tiktok: '',
    term_of_use: '', privacy_policy: '',
};

export default function ConfigurationsPage() {
    const t = useTranslations('Dashboard.configurations');
    const tc = useTranslations('Common');
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);
    // The API never returns the SMTP password; empty field = keep the stored one.
    const [passwordSet, setPasswordSet] = useState(false);

    useEffect(() => {
        if (!authLoading && user?.role !== UserRole.DEVELOPER) router.replace('/overview');
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user?.role !== UserRole.DEVELOPER) return;
        const fetchAll = async () => {
            try {
                const settingsRes = await fetch('/api/configurations');
                const settings: ApiResponse<AppSettings> = await settingsRes.json();

                if (settings.status && settings.data) {
                    const d = settings.data;
                    setPasswordSet(!!d.email_password_set);
                    setForm({
                        email: d.email, email_password: '', host: d.host,
                        port: d.port, ssl: d.ssl, from_email: d.from_email, from_name: d.from_name,
                        logo_file_name: d.logo_file_name || '',
                        favicon_file_name: d.favicon_file_name || '',
                        contact_phone: d.contact_phone || '',
                        contact_email: d.contact_email || '',
                        contact_adress: d.contact_adress || '',
                        facebook: d.facebook || '',
                        linkedin: d.linkedin || '',
                        tiktok: d.tiktok || '',
                        term_of_use: d.term_of_use || '',
                        privacy_policy: d.privacy_policy || '',
                    });
                }
            } catch { toast.error(tc('error')); }
            finally { setIsLoading(false); }
        };
        fetchAll();
    }, [user, tc]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await fetch('/api/configurations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const result: ApiResponse<AppSettings> = await res.json();
            if (result.status) {
                toast.success(tc('success'));
                if (form.email_password) setPasswordSet(true);
                setForm((f) => ({ ...f, email_password: '' }));
            }
            else toast.error(result.message || tc('error'));
        } catch { toast.error(tc('error')); }
        finally { setIsSaving(false); }
    };

    if (authLoading || isLoading) return (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
            <Typography variant="label">{tc('loading')}</Typography>
        </div>
    );

    const SectionWrapper = ({ children, title, desc, icon: Icon, colorClass, bgClass, headerAction }: any) => (
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden group">
            <CardHeader className="p-4 pb-3 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-sm border border-current/10 transition-transform group-hover:scale-105", bgClass, colorClass)}>
                        <Icon size={16} />
                    </div>
                    <div>
                        <CardTitle className="text-[13px] font-bold leading-tight">{title}</CardTitle>
                        <CardDescription className="text-[9px] font-bold opacity-50 mt-0.5 uppercase">{desc}</CardDescription>
                    </div>
                </div>
                {headerAction}
            </CardHeader>
            <CardContent className="p-4 space-y-5">
                {children}
            </CardContent>
        </Card>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-10 pb-20">
            {/* Page header */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0">
                            <Settings size={20} className="md:w-6 md:h-6" />
                        </div>
                        <div>
                            <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">{t('title')}</Typography>
                            <Typography variant="p" color="secondary" className="mt-0.5 block max-w-xl text-[11px] font-bold uppercase">
                                {t('subtitle')}
                            </Typography>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={isSaving}
                        className="w-full md:w-auto h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm"
                    >
                        {isSaving ? <Loader2 className="animate-spin me-2" size={18} /> : <ShieldCheck className="me-2" size={18} />}
                        {isSaving ? tc('processing') : tc('save')}
                    </Button>
                </div>
            </div>

            {/* ── Grid Layout ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Left Column: Core Infrastructure */}
                <div className="lg:col-span-7 space-y-10">
                    {/* SMTP Configuration */}
                    <SectionWrapper
                        title={t('smtp.title')}
                        desc={t('smtp.description')}
                        icon={Mail}
                        colorClass="text-blue-600"
                        bgClass="bg-blue-50"
                        headerAction={
                            <div className="hidden sm:block">
                                <Badge variant="success" className="font-bold uppercase px-2 py-0.5 text-[9px]">{tc('status')}: {tc('active') || 'ACTIVE'}</Badge>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label={t('smtp.email')} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={t('smtp.emailPlaceholder')} icon={AtSign} />
                            <Input label={tc('password')} type="password" value={form.email_password} onChange={e => setForm({ ...form, email_password: e.target.value })} placeholder={passwordSet ? '••••••••' : undefined} autoComplete="new-password" icon={Key} />
                            <Input label={t('smtp.host')} value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder={t('smtp.hostPlaceholder')} icon={Server} />
                            <Input label={t('smtp.port')} type="number" value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) })} icon={Hash} />
                            <Input label={t('smtp.fromEmail')} type="email" value={form.from_email} onChange={e => setForm({ ...form, from_email: e.target.value })} icon={Mail} />
                            <Input label={t('smtp.fromName')} value={form.from_name} onChange={e => setForm({ ...form, from_name: e.target.value })} icon={User} />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100 group-hover:bg-white transition-all">
                            <div className="flex items-center gap-2">
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border transition-all", form.ssl ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200")}>
                                    <ShieldCheck size={16} />
                                </div>
                                <Typography variant="large" className="font-bold text-xs leading-none uppercase">{t('smtp.ssl')}</Typography>
                            </div>
                            <Switch checked={form.ssl} onCheckedChange={(val) => setForm({ ...form, ssl: val })} />
                        </div>
                    </SectionWrapper>

                    {/* Branding Assets */}
                    <SectionWrapper
                        title={t('branding.title')}
                        desc={t('branding.subtitle') || "Visual identity files"}
                        icon={Video}
                        colorClass="text-purple-600"
                        bgClass="bg-purple-50"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label={t('branding.logo')} value={form.logo_file_name} onChange={e => setForm({ ...form, logo_file_name: e.target.value })} placeholder={t('branding.logoPlaceholder')} icon={Globe} />
                            <Input label={t('branding.favicon')} value={form.favicon_file_name} onChange={e => setForm({ ...form, favicon_file_name: e.target.value })} placeholder={t('branding.faviconPlaceholder')} icon={Globe} />
                        </div>
                    </SectionWrapper>
                </div>

                {/* Right Column: Support & Integration */}
                <div className="lg:col-span-5 space-y-10">
                    {/* Contact Information */}
                    <SectionWrapper
                        title={t('contact.title')}
                        desc={t('contact.subtitle') || "Public support details"}
                        icon={Phone}
                        colorClass="text-emerald-600"
                        bgClass="bg-emerald-50"
                    >
                        <div className="space-y-4">
                            <Input label={t('contact.phone')} type="tel" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} icon={Phone} />
                            <Input label={t('contact.email')} type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} icon={Mail} />
                            <Input label={t('contact.address')} value={form.contact_adress} onChange={e => setForm({ ...form, contact_adress: e.target.value })} icon={MapPin} />
                        </div>
                    </SectionWrapper>

                    {/* Social Ecosystem */}
                    <SectionWrapper
                        title={t('social.title')}
                        desc={t('social.subtitle') || "Digital presence links"}
                        icon={Share2}
                        colorClass="text-sky-600"
                        bgClass="bg-sky-50"
                    >
                        <div className="space-y-4">
                            <Input label={t('social.facebook')} value={form.facebook} onChange={e => setForm({ ...form, facebook: e.target.value })} placeholder={t('social.facebookPlaceholder')} icon={Facebook} />
                            <Input label={t('social.linkedin')} value={form.linkedin} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder={t('social.linkedinPlaceholder')} icon={Linkedin} />
                            <Input label={t('social.tiktok')} value={form.tiktok} onChange={e => setForm({ ...form, tiktok: e.target.value })} placeholder={t('social.tiktokPlaceholder')} icon={TikTok} />
                        </div>
                    </SectionWrapper>
                </div>
            </div>

            {/* Legal Policies: Full Width */}
            <SectionWrapper
                title={t('legal.title')}
                desc={t('legal.description')}
                icon={FileText}
                colorClass="text-slate-600"
                bgClass="bg-slate-100"
            >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 md:gap-10">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-slate-50 text-slate-500 border-slate-100 uppercase font-bold text-[9px]">{t('legal.terms')}</Badge>
                        </div>
                        <Textarea
                            value={form.term_of_use}
                            onChange={e => setForm({ ...form, term_of_use: e.target.value })}
                            placeholder={t('legal.termsPlaceholder') || "Enter the official terms of use document content..."}
                            className="bg-slate-50/30 border-slate-100 focus:bg-white min-h-[160px] rounded-xl p-3 text-xs leading-relaxed"
                        />
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-slate-50 text-slate-500 border-slate-100 uppercase font-bold text-[9px]">{t('legal.privacy')}</Badge>
                        </div>
                        <Textarea
                            value={form.privacy_policy}
                            onChange={e => setForm({ ...form, privacy_policy: e.target.value })}
                            placeholder={t('legal.privacyPlaceholder') || "Enter the official privacy policy document content..."}
                            className="bg-slate-50/30 border-slate-100 focus:bg-white min-h-[160px] rounded-xl p-3 text-xs leading-relaxed"
                        />
                    </div>
                </div>
            </SectionWrapper>

            {/* Final Action Bar */}
            <div className="flex justify-end pt-8">
                <Button
                    type="submit"
                    disabled={isSaving}
                    className="h-10 px-12 shadow-lg shadow-blue-900/10 rounded-xl w-full md:w-auto font-bold text-xs uppercase"
                >
                    {isSaving ? <Loader2 className="animate-spin me-2" size={16} /> : <ShieldCheck className="me-2" size={16} />}
                    {isSaving ? tc('processing') : tc('save')}
                </Button>
            </div>
        </form>
    );
}
