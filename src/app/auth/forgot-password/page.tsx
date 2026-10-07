'use client';
import { fetchPublicData } from '@/lib/public-data';
import { localAssetUrl } from '@/lib/utils';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Lock, Loader2, CheckCircle2, ShieldCheck, Sparkles, KeyRound, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';

export default function ForgotPasswordPage() {
    const t = useTranslations('Auth.forgotPassword');
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [settings, setSettings] = useState<any>({});

    useEffect(() => {
        fetchPublicData()
            .then(res => { if (res.status && res.data?.settings) setSettings(res.data.settings); });
    }, []);

    const logoSrc = settings.logo_file_name === 'AxiaMeetings.svg'
        ? '/AxiaMeetings.svg'
        : (settings.logo_file_name ? localAssetUrl(settings.logo_file_name) : '/AxiaMeetings.svg');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) { toast.error(t('errorEmail')); return; }
        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const result = await res.json();
            if (result.status) {
                setSubmitted(true);
            } else {
                toast.error(result.message || t('errorGeneral'));
            }
        } catch {
            toast.error(t('errorGeneral'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-[#FDFDFD]">
            {/* ── Left Hero Panel ─────────────────────────────────────── */}
            <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] bg-[#002B5B] flex-col relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2" />
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.04] pointer-events-none" />
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                        <motion.div key={i} className="absolute w-px bg-white/5"
                            style={{ left: `${(i + 1) * 16.66}%`, top: 0, bottom: 0 }}
                            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                            transition={{ duration: 1.4, delay: i * 0.1, ease: [0.33, 1, 0.68, 1] }}
                        />
                    ))}
                </div>
                <div className="relative z-10 flex flex-col h-full px-12 py-14">
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                        <Link href="/"><Image src={logoSrc} alt="Axia Meetings" width={200} height={60} className="h-10 w-auto filter-white cursor-pointer" priority /></Link>
                    </motion.div>
                    <motion.div className="flex-1 flex flex-col justify-center" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}>
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-1.5 mb-8 w-fit">
                            <Sparkles size={12} className="text-blue-300" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">{t('accountRecovery')}</span>
                        </div>
                        <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] mb-6">
                            {t('forgot')}<br /><span className="text-blue-300">{t('password')}</span>
                        </h1>
                        <p className="text-blue-200/70 text-lg font-medium leading-relaxed max-w-xs">{t('heroSubtitle')}</p>
                        <div className="mt-12 space-y-4">
                            {[
                                { step: '1', title: t('step1Title'), desc: t('step1Desc') },
                                { step: '2', title: t('step2Title'), desc: t('step2Desc') },
                                { step: '3', title: t('step3Title'), desc: t('step3Desc') },
                            ].map((item) => (
                                <div key={item.step} className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-blue-300">{item.step}</div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white">{item.title}</h4>
                                        <p className="text-xs text-blue-200/50 mt-0.5">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="border-t border-white/10 pt-6">
                        <p className="text-blue-200/40 text-xs font-medium">© {new Date().getFullYear()} Axia Meetings. {t('allRightsReserved')}</p>
                    </motion.div>
                </div>
            </div>

            {/* ── Right Form Panel ────────────────────────────────────── */}
            <div className="flex-1 flex flex-col justify-between">
                <div className="w-full flex items-center justify-between px-6 md:px-12 pt-8 pb-4 shrink-0">
                    <Link href="/auth/login" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowLeft size={14} /> {t('backToLogin')}
                    </Link>
                    <div className="flex gap-4 text-xs font-semibold text-slate-400">
                        <Link href="/terms-of-use" className="hover:text-slate-600 transition-colors">{t('termsOfUse')}</Link>
                        <Link href="/privacy-policy" className="hover:text-slate-600 transition-colors">{t('privacyPolicy')}</Link>
                    </div>
                </div>
                <div className="lg:hidden flex items-center justify-center pt-10 pb-2 bg-[#002B5B]">
                    <Link href="/"><Image src={logoSrc} alt="Axia Meetings" width={160} height={50} className="h-9 w-auto filter-white cursor-pointer" priority /></Link>
                </div>
                <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50/60 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1] }} className="w-full max-w-md relative z-10">
                        <AnimatePresence mode="wait">
                            {submitted ? (
                                <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                    className="bg-white rounded-[2rem] border border-slate-100 p-10 text-center shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                                        className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-6">
                                        <CheckCircle2 size={40} className="text-green-500" />
                                    </motion.div>
                                    <Typography variant="h2" className="text-[#002B5B] font-black text-2xl mb-3">{t('successTitle')}</Typography>
                                    <Typography variant="p" className="text-slate-500 text-sm leading-relaxed mb-6 max-w-xs mx-auto">
                                        {t('successDesc')} <strong className="text-slate-700">{email}</strong>
                                    </Typography>
                                    <div className="flex items-center justify-center gap-2 text-slate-300 mb-8">
                                        <ShieldCheck size={14} />
                                        <span className="text-[10px] uppercase font-black tracking-[0.18em]">{t('linkExpires')}</span>
                                    </div>
                                    <Link href="/auth/login">
                                        <Button className="h-12 px-8 rounded-2xl font-bold shadow-xl shadow-blue-900/10 w-full">{t('backToLogin')}</Button>
                                    </Link>
                                    <p className="text-xs text-slate-400 mt-4">
                                        {t('noEmail')}{' '}
                                        <button onClick={() => { setSubmitted(false); setEmail(''); }} className="text-[#002B5B] font-bold hover:underline underline-offset-2">{t('tryAgain')}</button>
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <div className="w-14 h-14 rounded-2xl bg-[#002B5B] flex items-center justify-center mb-6 shadow-lg shadow-blue-900/20 relative">
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-[inherit]" />
                                        <KeyRound size={24} className="text-white relative z-10" />
                                    </div>
                                    <div className="mb-8">
                                        <Typography variant="h2" className="text-[#002B5B] font-black text-3xl mb-1">{t('title')}</Typography>
                                        <Typography variant="muted" className="text-slate-400 text-sm">{t('subtitle')}</Typography>
                                    </div>
                                    <form onSubmit={handleSubmit} className="space-y-5">
                                        <Input label={t('emailLabel')} id="forgot-email" type="email" value={email}
                                            onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')}
                                            icon={Lock} required autoComplete="email" />
                                        <Button type="submit" disabled={isLoading} className="w-full h-14 text-base font-bold shadow-xl shadow-blue-900/25 rounded-2xl group relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-[#002B5B] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            <span className="relative z-10 flex items-center justify-center gap-2">
                                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{t('submit')}</>}
                                            </span>
                                        </Button>
                                    </form>
                                    <div className="mt-8 flex items-center justify-center gap-2 text-slate-300">
                                        <ShieldCheck size={14} />
                                        <span className="text-[10px] uppercase font-black tracking-[0.18em]">{t('encryptionEnabled')}</span>
                                    </div>
                                    <p className="text-center text-sm text-slate-400 mt-6">
                                        {t('rememberPassword')}{' '}
                                        <Link href="/auth/login" className="text-[#002B5B] font-bold hover:underline underline-offset-2 transition-colors">{t('signIn')}</Link>
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
