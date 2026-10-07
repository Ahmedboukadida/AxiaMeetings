'use client';
import { fetchPublicData } from '@/lib/public-data';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/context/AuthContext';
import {
    ArrowRight, Lock, Mail, ShieldCheck, CheckCircle2,
    Sparkles, Loader2, LogIn, UserPlus, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { cn, localAssetUrl } from '@/lib/utils';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login, isAuthenticated, loading } = useAuth();
    const [settings, setSettings] = useState<any>({});
    const router = useRouter();
    const t = useTranslations('Auth.login');

    useEffect(() => {
        fetchPublicData()
            .then(res => {
                if (res.status && res.data?.settings) setSettings(res.data.settings);
            });
    }, []);

    useEffect(() => {
        if (!loading && isAuthenticated) router.replace('/overview');
    }, [isAuthenticated, loading, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            toast.error(t('errorFields'));
            return;
        }
        setIsLoading(true);
        try {
            await login({ username: username.trim(), password });
            router.replace('/overview');
        } catch (err: any) {
            toast.error(err?.code === 'NO_COMPANY' ? t('errorNoCompany') : (err.message || t('errorAuth')));
        } finally {
            setIsLoading(false);
        }
    };

    if (loading) return null;

    const logoSrc = settings.logo_file_name === 'AxiaMeetings.svg'
        ? '/AxiaMeetings.svg'
        : (settings.logo_file_name ? localAssetUrl(settings.logo_file_name) : '/AxiaMeetings.svg');

    return (
        <div className="min-h-screen flex bg-[#FDFDFD]">
            {/* ── Left Hero Panel ───────────────────────────────────────── */}
            <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] bg-[#002B5B] flex-col relative overflow-hidden">
                {/* Decorative blobs */}
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2" />
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.04] pointer-events-none" />

                {/* Animated grid lines */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute w-px bg-white/5"
                            style={{ left: `${(i + 1) * 16.66}%`, top: 0, bottom: 0 }}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            transition={{ duration: 1.4, delay: i * 0.1, ease: [0.33, 1, 0.68, 1] }}
                        />
                    ))}
                </div>

                <div className="relative z-10 flex flex-col h-full px-12 py-14">
                    {/* Logo */}
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                        <Link href="/">
                            <Image src={logoSrc} alt="Axia Meetings" width={200} height={60} className="h-10 w-auto filter-white cursor-pointer" priority />
                        </Link>
                    </motion.div>

                    {/* Main copy */}
                    <motion.div
                        className="flex-1 flex flex-col justify-center"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-1.5 mb-8 w-fit">
                            <Sparkles size={12} className="text-blue-300" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">{t('secureGateway')}</span>
                        </div>

                        <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] mb-6">
                            {t('heroTitle')}<br />
                            <span className="text-blue-300">{t('heroTitleHighlight')}</span>
                        </h1>
                        <p className="text-blue-200/70 text-lg font-medium leading-relaxed max-w-xs">
                            {t('subtitle')}
                        </p>

                        {/* Trust badges */}
                        <div className="mt-12 space-y-3">
                            {[
                                { icon: ShieldCheck, label: t('badgeEncrypted') },
                                { icon: CheckCircle2, label: t('badgeISO') },
                                { icon: Sparkles, label: t('badgeAI') },
                            ].map(({ icon: Icon, label }) => (
                                <div key={label} className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                                        <Icon size={14} className="text-blue-300" />
                                    </div>
                                    <span className="text-sm text-blue-200/60 font-medium">{label}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Footer quote */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.9 }}
                        className="border-t border-white/10 pt-6"
                    >
                        <p className="text-blue-200/40 text-xs font-medium">
                            © {new Date().getFullYear()} Axia Meetings. {t('allRightsReserved')}
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* ── Right Form Panel ──────────────────────────────────────── */}
            <div className="flex-1 flex flex-col justify-between">
                {/* Sleek Top Navigation Bar */}
                <div className="w-full flex items-center justify-between px-6 md:px-12 pt-8 pb-4 shrink-0">
                    <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowLeft size={14} /> {t('backToWebsite')}
                    </Link>
                    <div className="flex gap-4 text-xs font-semibold text-slate-400">
                        <Link href="/terms-of-use" className="hover:text-slate-600 transition-colors">{t('termsOfUse')}</Link>
                        <Link href="/privacy-policy" className="hover:text-slate-600 transition-colors">{t('privacyPolicy')}</Link>
                    </div>
                </div>

                {/* Mobile logo */}
                <div className="lg:hidden flex items-center justify-center pt-10 pb-2 bg-[#002B5B]">
                    <Link href="/">
                        <Image src={logoSrc} alt="Axia Meetings" width={160} height={50} className="h-9 w-auto filter-white cursor-pointer" priority />
                    </Link>
                </div>

                <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
                    {/* Subtle bg glow */}
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50/60 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
                        className="w-full max-w-md relative z-10"
                    >
                        {/* Mode toggle */}
                        <div className="flex bg-slate-100 rounded-2xl p-1 mb-10">
                            <div className="flex-1 flex items-center justify-center gap-2 bg-white rounded-xl py-3 shadow-sm text-[#002B5B] font-bold text-sm">
                                <LogIn size={15} />
                                {t('tabLogin') || 'Sign In'}
                            </div>
                            <Link href="/auth/signup" className="flex-1 flex items-center justify-center gap-2 py-3 text-slate-400 hover:text-slate-600 font-semibold text-sm transition-colors">
                                <UserPlus size={15} />
                                {t('tabSignup') || 'Sign Up'}
                            </Link>
                        </div>

                        {/* Heading */}
                        <div className="mb-8">
                            <Typography variant="h2" className="text-[#002B5B] font-black text-3xl mb-1">
                                {t('title') || 'Sign in to your account'}
                            </Typography>
                            <Typography variant="muted" className="text-slate-400 text-sm">
                                {t('titleSub') || 'Enter your credentials below to continue'}
                            </Typography>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <Input
                                label={t('email')}
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder={t('emailPlaceholder')}
                                icon={Mail}
                                required
                                autoComplete="username"
                            />
                            <div>
                                <Input
                                    label={t('password')}
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    icon={Lock}
                                    required
                                    autoComplete="current-password"
                                />
                                <div className="flex justify-end mt-1.5">
                                    <Link
                                        href="/auth/forgot-password"
                                        className="text-[11px] font-bold text-[#002B5B]/60 hover:text-[#002B5B] transition-colors underline-offset-2 hover:underline"
                                    >
                                        {t('forgotPassword')}
                                    </Link>
                                </div>
                            </div>

                            {/* Terms checkbox */}
                            <motion.label
                                whileHover={{ scale: 1.005 }}
                                whileTap={{ scale: 0.995 }}
                                className={cn(
                                    'flex items-start gap-4 p-5 rounded-2xl border transition-all duration-300 cursor-pointer',
                                    acceptedTerms ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50/50 border-slate-100 hover:bg-slate-50'
                                )}
                            >
                                <div className="relative mt-0.5">
                                    <input
                                        id="terms"
                                        type="checkbox"
                                        checked={acceptedTerms}
                                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={cn(
                                        'w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all duration-300',
                                        acceptedTerms ? 'bg-[#002B5B] border-[#002B5B] shadow-lg shadow-blue-900/20' : 'bg-white border-slate-300'
                                    )}>
                                        <AnimatePresence>
                                            {acceptedTerms && (
                                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                                    <CheckCircle2 className="w-4 h-4 text-white" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                <Typography variant="muted" className="text-sm leading-relaxed">
                                    {t.rich('termsNote', {
                                        terms: (chunks) => <Link href="/terms-of-use" target="_blank" className="text-[#002B5B] font-black underline underline-offset-2">{chunks}</Link>,
                                        privacy: (chunks) => <Link href="/privacy-policy" target="_blank" className="text-[#002B5B] font-black underline underline-offset-2">{chunks}</Link>,
                                    })}
                                </Typography>
                            </motion.label>

                            <Button
                                type="submit"
                                disabled={isLoading || !acceptedTerms}
                                className="w-full h-14 text-base font-bold shadow-xl shadow-blue-900/25 rounded-2xl group relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-[#002B5B] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            {t('submit')}
                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                                        </>
                                    )}
                                </span>
                            </Button>
                        </form>

                        {/* Footer note */}
                        <div className="mt-8 flex items-center justify-center gap-2 text-slate-300">
                            <ShieldCheck size={14} />
                            <span className="text-[10px] uppercase font-black tracking-[0.18em]">{t('encryptionEnabled')}</span>
                        </div>

                        <p className="text-center text-sm text-slate-400 mt-6">
                            {t('noAccount') || "Don't have an account?"}{' '}
                            <Link href="/auth/signup" className="text-[#002B5B] font-bold hover:underline underline-offset-2 transition-colors">
                                {t('signupLink') || 'Create one'}
                            </Link>
                        </p>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
