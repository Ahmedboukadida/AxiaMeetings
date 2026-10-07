'use client';
import { fetchPublicData } from '@/lib/public-data';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Mail, Send, User, MessageSquare, CheckCircle2, Loader2, Phone, MapPin, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';

export default function ContactPage() {
    const t = useTranslations('Contact');
    const [settings, setSettings] = useState<any>({});
    const [form, setForm] = useState({ sender_name: '', sender_email: '', subject: '', message: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        fetchPublicData()
            .then(r => { if (r.status && r.data?.settings) setSettings(r.data.settings); });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.sender_email || !form.subject || !form.message) {
            toast.error(t('toast.required'));
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const result = await res.json();
            if (result.status) {
                setSubmitted(true);
                toast.success(t('toast.success'));
            } else {
                toast.error(result.message || t('toast.error'));
            }
        } catch {
            toast.error(t('toast.error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#FDFDFD]">
            <PublicNavbar settings={settings} />

            <main className="flex-grow pt-40 pb-24 px-6 relative overflow-hidden">
                {/* Background blobs */}
                <div className="absolute top-0 right-0 w-[900px] h-[900px] bg-gradient-to-br from-blue-100/40 to-transparent rounded-full blur-[140px] -translate-y-1/2 translate-x-1/3 -z-10" />
                <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-gradient-to-tr from-indigo-50/60 to-transparent rounded-full blur-[120px] translate-y-1/3 -translate-x-1/4 -z-10" />

                <div className="max-w-6xl mx-auto">
                    {/* Hero header */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: [0.33, 1, 0.68, 1] }}
                        className="text-center mb-16"
                    >
                        <div className="inline-flex items-center gap-2 bg-[#002B5B]/5 border border-[#002B5B]/10 rounded-full px-5 py-2 mb-6">
                            <Mail size={14} className="text-[#002B5B]" />
                            <span className="text-xs font-bold uppercase tracking-widest text-[#002B5B]">{t('badge')}</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black text-[#002B5B] leading-tight mb-4">
                            {t('title')}
                        </h1>
                        <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">{t('subtitle')}</p>
                    </motion.div>

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                        {/* Info Panel */}
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.7, delay: 0.15 }}
                            className="lg:col-span-2 space-y-6"
                        >
                            <div className="bg-[#002B5B] rounded-[2rem] p-8 text-white relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
                                <div className="relative z-10 space-y-8">
                                    <div>
                                        <Typography variant="h3" className="text-white font-bold text-xl mb-2">{t('info.title')}</Typography>
                                        <Typography variant="p" className="text-blue-200/80 text-sm leading-relaxed">{t('info.desc')}</Typography>
                                    </div>

                                    {settings?.contact_phone && (
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                                <Phone size={18} className="text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-blue-200/60 uppercase font-bold mb-1">{t('info.phone')}</p>
                                                <p className="text-white font-semibold">{settings.contact_phone}</p>
                                            </div>
                                        </div>
                                    )}

                                    {settings?.contact_email && (
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                                <Mail size={18} className="text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-blue-200/60 uppercase font-bold mb-1">{t('info.email')}</p>
                                                <p className="text-white font-semibold">{settings.contact_email}</p>
                                            </div>
                                        </div>
                                    )}

                                    {settings?.contact_address && (
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                                <MapPin size={18} className="text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-blue-200/60 uppercase font-bold mb-1">{t('info.address')}</p>
                                                <p className="text-white font-semibold">{settings.contact_address}</p>
                                            </div>
                                        </div>
                                    )}

                                    {!settings?.contact_phone && !settings?.contact_email && !settings?.contact_address && (
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                                <Mail size={18} className="text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-blue-200/60 uppercase font-bold mb-1">{t('info.email')}</p>
                                                <p className="text-white font-semibold">support@axiameetings.com</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-[2rem] p-6 border border-slate-100">
                                <p className="text-xs text-slate-400 uppercase font-black tracking-widest mb-3">{t('info.responseTime')}</p>
                                <p className="text-[#002B5B] font-bold text-base">{t('info.responseValue')}</p>
                                <p className="text-slate-500 text-sm mt-1">{t('info.responseDesc')}</p>
                            </div>
                        </motion.div>

                        {/* Form Panel */}
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.7, delay: 0.2 }}
                            className="lg:col-span-3"
                        >
                            <div className="bg-white rounded-[2rem] shadow-[0_40px_80px_-20px_rgba(0,43,91,0.12)] border border-slate-100 p-8 md:p-12">
                                {submitted ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex flex-col items-center justify-center py-16 text-center gap-6"
                                    >
                                        <div className="w-20 h-20 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
                                            <CheckCircle2 size={40} className="text-green-500" />
                                        </div>
                                        <div>
                                            <Typography variant="h3" className="text-[#002B5B] font-bold text-2xl mb-2">{t('success.title')}</Typography>
                                            <Typography variant="p" className="text-slate-500 max-w-sm">{t('success.desc')}</Typography>
                                        </div>
                                        <Button onClick={() => setSubmitted(false)} variant="ghost" className="mt-2">
                                            {t('success.another')}
                                        </Button>
                                    </motion.div>
                                ) : (
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div>
                                            <Typography variant="h3" className="text-[#002B5B] font-bold text-xl mb-1">{t('form.title')}</Typography>
                                            <Typography variant="p" className="text-slate-400 text-sm">{t('form.subtitle')}</Typography>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <Input
                                                label={t('form.name')}
                                                id="contact-name"
                                                type="text"
                                                value={form.sender_name}
                                                onChange={e => setForm(f => ({ ...f, sender_name: e.target.value }))}
                                                placeholder={t('form.namePlaceholder')}
                                                icon={User}
                                            />
                                            <Input
                                                label={t('form.email')}
                                                id="contact-email"
                                                type="email"
                                                value={form.sender_email}
                                                onChange={e => setForm(f => ({ ...f, sender_email: e.target.value }))}
                                                placeholder={t('form.emailPlaceholder')}
                                                icon={Mail}
                                                required
                                            />
                                        </div>

                                        <Input
                                            label={t('form.subject')}
                                            id="contact-subject"
                                            type="text"
                                            value={form.subject}
                                            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                                            placeholder={t('form.subjectPlaceholder')}
                                            icon={MessageSquare}
                                            required
                                        />

                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('form.message')}</label>
                                            <textarea
                                                id="contact-message"
                                                value={form.message}
                                                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                                                placeholder={t('form.messagePlaceholder')}
                                                required
                                                rows={6}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#002B5B]/20 focus:border-[#002B5B] transition-all resize-none"
                                            />
                                        </div>

                                        <Button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full h-14 text-base font-bold shadow-xl shadow-blue-900/20 rounded-2xl group relative overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-[#002B5B] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            <span className="relative z-10 flex items-center justify-center gap-3">
                                                {isLoading ? (
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Send size={18} />
                                                        {t('form.submit')}
                                                        <ArrowRight size={16} className="group-hover:translate-x-2 transition-transform duration-300" />
                                                    </>
                                                )}
                                            </span>
                                        </Button>
                                    </form>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>

            <PublicFooter settings={settings} />
        </div>
    );
}
