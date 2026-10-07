'use client';
import { fetchPublicData } from '@/lib/public-data';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Mail, Lock, Building2, Globe, Package,
    CheckCircle2, Loader2, ArrowRight, ShieldCheck, Sparkles, Check,
    LogIn, UserPlus, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/button';
import { Typography } from '@/components/ui/typographys';
import { cn, localAssetUrl } from '@/lib/utils';

interface Pack {
    id: number;
    name: string;
    description?: string;
    price?: number;
    period?: string;
    features?: string[];
    price_month: number;
    price_year: number;
    packs_lines: { id: number; title: string }[];
}

function SignupForm() {
    const t = useTranslations('Signup');
    const searchParams = useSearchParams();
    const router = useRouter();
    const [settings, setSettings] = useState<any>({});
    const [packs, setPacks] = useState<Pack[]>([]);
    const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
    const [form, setForm] = useState({
        fullname: '',
        email: '',
        password: '',
        confirmPassword: '',
        company_name: '',
        company_url: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [step, setStep] = useState<'pack' | 'details'>('pack');

    useEffect(() => {
        fetchPublicData()
            .then(r => {
                if (r.status && r.data?.settings) setSettings(r.data.settings);
                if (r.status && r.data?.packs) setPacks(r.data.packs);
            });
    }, []);

    useEffect(() => {
        const packId = searchParams.get('packId');
        if (packId) {
            setSelectedPackId(Number(packId));
            setStep('details');
        }
    }, [searchParams]);

    const selectedPack = packs.find(p => p.id === selectedPackId);

    const handlePackSelect = (packId: number) => {
        setSelectedPackId(packId);
        setStep('details');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPackId) { toast.error(t('toast.selectPack')); return; }
        if (!form.fullname || !form.email || !form.password || !form.company_name) {
            toast.error(t('toast.required')); return;
        }
        if (form.password !== form.confirmPassword) {
            toast.error(t('toast.passwordMismatch')); return;
        }
        if (form.password.length < 10 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
            toast.error(t('toast.passwordLength')); return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullname: form.fullname,
                    email: form.email,
                    password: form.password,
                    company_name: form.company_name,
                    company_url: form.company_url || null,
                    pack_id: selectedPackId,
                }),
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

    const logoSrc = settings.logo_file_name === 'AxiaMeetings.svg'
        ? '/AxiaMeetings.svg'
        : (settings.logo_file_name ? localAssetUrl(settings.logo_file_name) : '/AxiaMeetings.svg');

    return (
        <div className="min-h-screen flex bg-[#FDFDFD]">
            {/* ── Left Hero Panel (Same consistent design as Login) ────────── */}
            <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] bg-[#002B5B] flex-col relative overflow-hidden shrink-0">
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

                <div className="relative z-10 flex flex-col h-full px-12 py-14 justify-between">
                    {/* Logo */}
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                        <Link href="/">
                            <Image src={logoSrc} alt="Axia Meetings" width={200} height={60} className="h-10 w-auto filter-white cursor-pointer" priority />
                        </Link>
                    </motion.div>

                    {/* Main copy */}
                    <motion.div
                        className="my-auto py-10"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-1.5 mb-8 w-fit">
                            <Sparkles size={12} className="text-blue-300" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">{t('workspace')}</span>
                        </div>

                        <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] mb-6">
                            {t('startYour')}<br />
                            <span className="text-blue-300">{t('journey')}</span>
                        </h1>
                        <p className="text-blue-200/70 text-lg font-medium leading-relaxed max-w-sm">
                            {t('heroSubtitle')}
                        </p>

                        {/* Feature milestones */}
                        <div className="mt-12 space-y-4">
                            {[
                                { title: t('milestone1Title'), desc: t('milestone1Desc') },
                                { title: t('milestone2Title'), desc: t('milestone2Desc') },
                                { title: t('milestone3Title'), desc: t('milestone3Desc') }
                            ].map((item, index) => (
                                <div key={index} className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-blue-300">
                                        {index + 1}
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white">{item.title}</h4>
                                        <p className="text-xs text-blue-200/50 mt-0.5">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Footer note */}
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
            <div className="flex-1 flex flex-col min-w-0 justify-between">
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
                        className="w-full max-w-2xl relative z-10"
                    >
                        {/* Mode toggle */}
                        {!submitted && (
                            <div className="flex bg-slate-100 rounded-2xl p-1 mb-8 max-w-md mx-auto lg:mx-0">
                                <Link href="/auth/login" className="flex-1 flex items-center justify-center gap-2 py-3 text-slate-400 hover:text-slate-600 font-semibold text-sm transition-colors">
                                    <LogIn size={15} />
                                    {t('success.login') || 'Sign In'}
                                </Link>
                                <div className="flex-1 flex items-center justify-center gap-2 bg-white rounded-xl py-3 shadow-sm text-[#002B5B] font-bold text-sm">
                                    <UserPlus size={15} />
                                    {t('badge') || 'Sign Up'}
                                </div>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            {submitted ? (
                                /* Submitted Success State */
                                <motion.div
                                    key="submitted"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="bg-white rounded-[2rem] border border-slate-100 p-8 md:p-12 text-center shadow-[0_20px_50px_rgba(0,0,0,0.05)]"
                                >
                                    <div className="w-20 h-20 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-6">
                                        <CheckCircle2 size={40} className="text-green-500" />
                                    </div>
                                    <Typography variant="h2" className="text-[#002B5B] font-black text-2xl md:text-3xl mb-3">
                                        {t('success.title')}
                                    </Typography>
                                    <Typography variant="p" className="text-slate-500 max-w-md mx-auto mb-8 leading-relaxed text-sm">
                                        {t('success.desc')}
                                    </Typography>
                                    <div className="flex items-center justify-center gap-2 text-slate-400 mb-8">
                                        <ShieldCheck size={16} />
                                        <span className="text-xs uppercase font-bold tracking-widest">{t('success.note')}</span>
                                    </div>
                                    <Button onClick={() => router.push('/auth/login')} className="h-14 px-8 rounded-2xl text-base font-bold shadow-xl shadow-blue-900/10">
                                        {t('success.login')} <ArrowRight size={16} className="ml-2" />
                                    </Button>
                                </motion.div>
                            ) : step === 'pack' ? (
                                /* Step 1: Pack Selection */
                                <motion.div
                                    key="pack-step"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="space-y-6"
                                >
                                    <div className="mb-6">
                                        <Typography variant="h2" className="text-[#002B5B] font-black text-3xl mb-1">
                                            {t('title') || 'Choose your workspace plan'}
                                        </Typography>
                                        <Typography variant="muted" className="text-slate-400 text-sm">
                                            {t('subtitle') || 'Select the ideal plan for your organization size'}
                                        </Typography>
                                    </div>

                                    {/* Vertical/Flexible dynamic plans listing */}
                                    {packs.length === 0 ? (
                                        <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center">
                                            <Package size={40} className="text-slate-200 mx-auto mb-4" />
                                            <Typography variant="h3" className="text-slate-400 font-bold">{t('noPacks')}</Typography>
                                            <Button onClick={() => setStep('details')} variant="ghost" className="mt-4">
                                                {t('skipPack')} <ArrowRight size={14} className="ml-2" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {packs.map((pack) => (
                                                <motion.div
                                                    key={pack.id}
                                                    whileHover={{ y: -4 }}
                                                    onClick={() => handlePackSelect(pack.id)}
                                                    className="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer hover:border-[#002B5B] hover:shadow-xl hover:shadow-[#002b5b]/5 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
                                                >
                                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full blur-xl group-hover:bg-blue-100/50 transition-all -translate-y-1/2 translate-x-1/2" />
                                                    <div className="relative z-10">
                                                        <div className="w-9 h-9 rounded-xl bg-[#002B5B]/5 flex items-center justify-center mb-3">
                                                            <Package size={18} className="text-[#002B5B]" />
                                                        </div>
                                                        <h3 className="text-[#002B5B] font-black text-lg mb-1">{pack.name}</h3>
                                                        <div className="mb-3">
                                                            <p className="text-xl font-black text-[#002B5B]">
                                                                {pack.price_month === 0 ? t('free') : `TND ${pack.price_month.toFixed(0)}`}
                                                                <span className="text-xs font-semibold text-slate-400">{t('perMonth')}</span>
                                                            </p>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                                                TND {pack.price_year.toFixed(0)} {t('perYear')}
                                                            </p>
                                                        </div>
                                                        {pack.description && (
                                                            <p className="text-slate-500 text-xs mb-4 leading-relaxed line-clamp-2">{pack.description}</p>
                                                        )}
                                                    </div>
                                                    <Button className="w-full h-11 text-xs font-bold rounded-xl mt-2 group-hover:bg-[#002B5B] group-hover:text-white transition-colors">
                                                        {t('selectPack')} <ArrowRight size={12} className="ml-2 group-hover:translate-x-1 transition-transform" />
                                                    </Button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                /* Step 2: Register Details Form */
                                <motion.div
                                    key="details-step"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
                                >
                                    {/* Left summary / Details input container */}
                                    <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-[0_15px_40px_rgba(0,43,91,0.04)]">
                                        <button
                                            onClick={() => setStep('pack')}
                                            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 mb-6 transition-colors"
                                        >
                                            <ArrowLeft size={14} /> {t('backToPlans')}
                                        </button>

                                        <form onSubmit={handleSubmit} className="space-y-6">
                                            <div>
                                                <Typography variant="h3" className="text-[#002B5B] font-bold text-xl mb-1">{t('form.title')}</Typography>
                                                <Typography variant="p" className="text-slate-400 text-xs">{t('form.subtitle')}</Typography>
                                            </div>

                                            {/* Personal info */}
                                            <div className="space-y-4">
                                                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">{t('form.personalInfo')}</p>
                                                <Input
                                                    label={t('form.fullname')}
                                                    id="signup-fullname"
                                                    type="text"
                                                    value={form.fullname}
                                                    onChange={e => setForm(f => ({ ...f, fullname: e.target.value }))}
                                                    placeholder={t('form.fullnamePlaceholder')}
                                                    icon={User}
                                                    required
                                                />
                                                <Input
                                                    label={t('form.email')}
                                                    id="signup-email"
                                                    type="email"
                                                    value={form.email}
                                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                                    placeholder={t('form.emailPlaceholder')}
                                                    icon={Mail}
                                                    required
                                                />
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <Input
                                                        label={t('form.password')}
                                                        id="signup-password"
                                                        type="password"
                                                        value={form.password}
                                                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                                        placeholder="••••••••"
                                                        icon={Lock}
                                                        required
                                                    />
                                                    <Input
                                                        label={t('form.confirmPassword')}
                                                        id="signup-confirm-password"
                                                        type="password"
                                                        value={form.confirmPassword}
                                                        onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                                                        placeholder="••••••••"
                                                        icon={Lock}
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            {/* Company info */}
                                            <div className="space-y-4 pt-2">
                                                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">{t('form.companyInfo')}</p>
                                                <Input
                                                    label={t('form.companyName')}
                                                    id="signup-company-name"
                                                    type="text"
                                                    value={form.company_name}
                                                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                                                    placeholder={t('form.companyNamePlaceholder')}
                                                    icon={Building2}
                                                    required
                                                />
                                                <Input
                                                    label={t('form.companyUrl')}
                                                    id="signup-company-url"
                                                    type="text"
                                                    value={form.company_url}
                                                    onChange={e => setForm(f => ({ ...f, company_url: e.target.value }))}
                                                    placeholder={t('form.companyUrlPlaceholder')}
                                                    icon={Globe}
                                                />
                                            </div>

                                            <Button
                                                type="submit"
                                                disabled={isLoading}
                                                className="w-full h-14 text-base font-bold shadow-xl shadow-blue-900/20 rounded-2xl group relative overflow-hidden"
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-[#002B5B] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                <span className="relative z-10 flex items-center justify-center gap-2">
                                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                                        <>{t('form.submit')} <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></>
                                                    )}
                                                </span>
                                            </Button>

                                            <div className="flex items-center justify-center gap-2 text-slate-400">
                                                <ShieldCheck size={14} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">{t('form.security')}</span>
                                            </div>
                                        </form>
                                    </div>

                                    {/* Sidebar: Selected pack & What's included summary */}
                                    <div className="lg:col-span-4 space-y-4">
                                        {selectedPack && (
                                            <div className="bg-[#002B5B] rounded-2xl p-5 text-white relative overflow-hidden shadow-xl shadow-[#002b5b]/10">
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                                <div className="relative z-10">
                                                    <p className="text-[10px] text-blue-200/60 uppercase font-black tracking-wider mb-2">{t('selectedPlan')}</p>
                                                    <h3 className="text-white font-black text-lg mb-2">{selectedPack.name}</h3>
                                                    <div>
                                                        <p className="text-2xl font-black text-white">
                                                            {selectedPack.price_month === 0 ? t('free') : `TND ${selectedPack.price_month.toFixed(0)}`}
                                                            <span className="text-xs font-medium text-blue-200/60">{t('perMonth')}</span>
                                                        </p>
                                                        <p className="text-[10px] font-bold text-blue-200/60 uppercase tracking-widest mt-0.5">
                                                            TND {selectedPack.price_year.toFixed(0)} {t('perYear')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-2xl p-5 border border-slate-100">
                                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-3">{t('whatsIncluded')}</p>
                                            <div className="space-y-2.5">
                                                {selectedPack?.packs_lines && selectedPack.packs_lines.length > 0 ? (
                                                    selectedPack.packs_lines.map((line) => (
                                                        <div key={line.id} className="flex items-start gap-2.5">
                                                            <div className="w-4.5 h-4.5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                                                                <Check size={10} className="text-green-600" />
                                                            </div>
                                                            <span className="text-xs text-slate-600 font-medium leading-relaxed">{line.title}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    [t('feature1'), t('feature2'), t('feature3')].map((f, i) => (
                                                        <div key={i} className="flex items-start gap-2.5">
                                                            <div className="w-4.5 h-4.5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                                                                <Check size={10} className="text-green-600" />
                                                            </div>
                                                            <span className="text-xs text-slate-600 font-medium leading-relaxed">{f}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={null}>
            <SignupForm />
        </Suspense>
    );
}
