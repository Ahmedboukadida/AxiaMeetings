"use client";
import { fetchPublicData } from '@/lib/public-data';
import { localAssetUrl } from '@/lib/utils';

import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    ArrowRight, CheckCircle2, Globe, Layout, PlayCircle, ShieldCheck, Star, Users, Zap,
    Quote, Smartphone, Monitor, Cloud, ArrowUpRight, Sparkles, Video, FileText,
    Languages, MousePointer2, Shield, Activity, Cpu
} from "lucide-react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/context/AuthContext";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const fadeIn = { hidden: { opacity: 0, y: 30 }, visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.8, ease: [0.21, 0.6, 0.35, 1] } }) } as any;

interface PublicPack { id: number; name: string; price_month: number; price_year: number; packs_lines: { id: number; title: string }[]; }
interface PublicRef { id: number; name: string; logo_file_name: string; website: string; }

function ReferenceCarousel({ references }: { references: PublicRef[] }) {
    if (references.length === 0) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="pt-12 flex flex-wrap items-center gap-12 opacity-30 grayscale hover:grayscale-0 transition-all duration-700 cursor-default">
                <div className="text-xl font-black text-slate-900 tracking-tighter italic">SYNDIC.PRO</div>
                <div className="text-xl font-black text-slate-900 tracking-tighter">CORP-X</div>
                <div className="text-xl font-black text-slate-900 tracking-tighter italic">VOTE.LY</div>
                <div className="text-xl font-black text-slate-900 tracking-tighter">BOARD.IO</div>
            </motion.div>
        );
    }

    return (
        <div className="pt-4 relative w-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#FDFDFD] to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#FDFDFD] to-transparent z-10" />
            <motion.div className="flex gap-20 items-center whitespace-nowrap py-4" animate={{ x: [0, -2000] }} transition={{ x: { repeat: Infinity, duration: 60, ease: "linear" } }}>
                {[...references, ...references, ...references, ...references].map((ref, i) => (
                    <a key={`${ref.id}-${i}`} href={ref.website} target="_blank" rel="noopener noreferrer" className="opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-700 hover:scale-110 shrink-0">
                        <img src={ref.logo_file_name.startsWith('http') ? ref.logo_file_name : localAssetUrl(ref.logo_file_name)} alt={ref.name} className="h-10 w-auto object-contain" />
                    </a>
                ))}
            </motion.div>
        </div>
    );
}

export default function HomePage() {
    const t = useTranslations('Home');
    const [packs, setPacks] = useState<PublicPack[]>([]);
    const [references, setReferences] = useState<PublicRef[]>([]);
    const targetRef = useRef(null);
    const { scrollYProgress } = useScroll({ target: targetRef, offset: ["start start", "end start"] });

    const heroOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
    const heroScale = useTransform(scrollYProgress, [0, 0.4], [1, 0.95]);
    const heroY = useTransform(scrollYProgress, [0, 0.4], [0, 100]);

    useEffect(() => {
        fetchPublicData().then(res => {
            if (res.status && res.data) {
                setPacks(res.data.packs || []);
                setReferences(res.data.references || []);
            }
        }).catch(() => { });
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-[#FDFDFD] text-[#0F172A] selection:bg-blue-600 selection:text-white overflow-x-hidden">
            <main className="flex-1">
                {/* HERO 3.0 */}
                <section ref={targetRef} className="relative min-h-screen flex items-center pt-20 overflow-hidden bg-white">
                    <div className="absolute inset-0 -z-10">
                        <div className="absolute inset-0 opacity-[0.02] bg-radial-blue" />
                    </div>

                    <div className="max-w-7xl mx-auto px-6 w-full py-20">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
                            <motion.div style={{ opacity: heroOpacity, scale: heroScale, y: heroY }} className="lg:col-span-7 space-y-12">
                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-[#002B5B] text-sm font-black uppercase tracking-[0.3em] shadow-sm">
                                    <Sparkles size={18} className="text-[#002B5B] animate-pulse" />
                                    {t('hero.badge')}
                                </motion.div>

                                <div className="space-y-6">
                                    <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 1 }} className="text-2xl md:text-3xl lg:text-7xl font-black text-[#002B5B] leading-[0.95] md:leading-[0.85] tracking-tighter">
                                        {t.rich('hero.title', {
                                            br: () => <br className="hidden md:block" />,
                                            highlight: (chunks) => <span className="relative inline-block text-[#002B5B]">
                                                {chunks}
                                                <motion.span initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ delay: 1, duration: 1 }} className="absolute bottom-2 left-0 h-4 bg-blue-100/50 -z-10 rounded-full" />
                                            </span>
                                        })}
                                    </motion.h1>

                                    <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-xl md:text-3xl text-slate-600 font-medium max-w-2xl leading-tight tracking-tight">
                                        {t('hero.subtitle')}
                                    </motion.p>
                                </div>

                                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="flex flex-col sm:flex-row items-center gap-6 pt-6">
                                    <Link href="/auth/login" className="w-full sm:w-auto">
                                        <Button size="lg" className="w-full sm:w-auto h-14 md:h-18 px-8 md:px-12 text-base md:text-xl font-black rounded-2xl bg-[#002B5B] hover:bg-[#003d80] text-white shadow-[0_20px_50px_-10px_rgba(0,43,91,0.3)] group transition-all hover:scale-105 active:scale-95">
                                            {t('hero.cta')} <ArrowRight className="ml-3 w-5 h-5 md:w-6 md:h-6 group-hover:translate-x-2 transition-transform" />
                                        </Button>
                                    </Link>
                                    <button
                                        onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                                        className="flex items-center gap-4 text-base md:text-lg font-black text-slate-700 hover:text-[#002B5B] transition-all group"
                                    >
                                        <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white shadow-xl flex items-center justify-center border border-slate-200 group-hover:border-[#002B5B] group-hover:scale-110 transition-all">
                                            <PlayCircle size={28} className="text-[#002B5B]" />
                                        </div>
                                        {t('hero.watch')}
                                    </button>
                                </motion.div>
                            </motion.div>

                            <motion.div initial={{ opacity: 0, scale: 0.8, x: 50 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ delay: 0.2, duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }} className="lg:col-span-5 relative hidden lg:block">
                                <div className="relative z-10 bg-white rounded-[4rem] p-4 shadow-[0_50px_100px_-20px_rgba(0,43,91,0.2)] border border-slate-200">
                                    <div className="rounded-[3.5rem] overflow-hidden aspect-[4/5] bg-slate-100 relative group">
                                        <img src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2000" alt="Platform" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                    </div>

                                    <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="absolute top-10 -left-8 bg-white p-6 rounded-[2.5rem] shadow-2xl border border-slate-100 flex items-center gap-5 max-w-[280px] z-20">
                                        <div className="w-20 h-12 bg-[#002B5B] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/30">
                                            <Sparkles size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-500 uppercase tracking-widest leading-none mb-2">{t('hero.aiTag')}</p>
                                            <p className="text-base font-black text-[#002B5B]">{t('hero.aiStatus')}</p>
                                        </div>
                                    </motion.div>

                                    <motion.div animate={{ y: [0, 15, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute bottom-16 -right-10 bg-[#002B5B] p-6 rounded-[2.5rem] shadow-2xl text-white flex items-center gap-5 max-w-[260px] z-20">
                                        <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                            <Activity size={24} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-blue-200 uppercase tracking-widest leading-none mb-2">{t('hero.quorumTag')}</p>
                                            <p className="text-base font-black text-white">{t('hero.quorumStatus')}</p>
                                        </div>
                                    </motion.div>
                                </div>
                            </motion.div>
                        </div>

                        {/* References / Trusted Section */}
                        <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 }} className="mt-32 pt-20 border-t border-slate-200">
                            <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
                                <div className="shrink-0 space-y-1 text-center md:text-left">
                                    <p className="text-[#002B5B] font-black text-lg tracking-tighter">{t('references.title')}</p>
                                    <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">{t('references.subtitle')}</p>
                                </div>
                                <div className="flex-1 w-full overflow-hidden">
                                    <ReferenceCarousel references={references} />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* Core Pillars Section */}
                <section id="pillars" className="py-32 px-6 bg-[#FDFDFD]">
                    <div className="max-w-7xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
                            {[
                                { icon: Cpu, title: t('pillars.item1.title'), desc: t('pillars.item1.desc'), color: "text-blue-600", bg: "bg-blue-50" },
                                { icon: Video, title: t('pillars.item2.title'), desc: t('pillars.item2.desc'), color: "text-indigo-600", bg: "bg-indigo-50" },
                                { icon: Languages, title: t('pillars.item3.title'), desc: t('pillars.item3.desc'), color: "text-emerald-600", bg: "bg-emerald-50" }
                            ].map((pillar, i) => (
                                <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }} className="space-y-6 group cursor-default">
                                    <div className={`w-16 h-16 ${pillar.bg} ${pillar.color} rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-sm`}>
                                        <pillar.icon size={28} />
                                    </div>
                                    <div className="space-y-3">
                                        <h3 className="text-xl font-black text-[#002B5B] tracking-tighter">{pillar.title}</h3>
                                        <p className="text-sm text-slate-500 font-medium leading-relaxed tracking-tight">{pillar.desc}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Bento Intelligence Grid */}
                <section id="features" className="py-32 px-6 bg-[#FDFDFD] relative overflow-hidden">
                    <div className="max-w-7xl mx-auto relative z-10">
                        <div className="max-w-3xl mb-24 space-y-4">
                            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="text-[#002B5B] text-sm font-black uppercase tracking-[0.4em]">{t('features.tag')}</motion.div>
                            <h2 className="text-4xl md:text-6xl font-black text-[#002B5B] tracking-tighter leading-tight">
                                {t.rich('features.title', {
                                    br: () => <br />,
                                    highlight: (chunks) => <span className="text-[#002B5B] underline decoration-blue-200 decoration-8 underline-offset-[-2px] italic">{chunks}</span>
                                })}
                            </h2>
                            <p className="text-lg text-slate-500 font-medium italic tracking-tight">{t('features.subtitle')}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                            <motion.div whileHover={{ y: -10 }} className="md:col-span-8 bg-white rounded-3xl md:rounded-[3rem] p-8 md:p-12 border border-slate-100 relative overflow-hidden group min-h-[400px] shadow-sm">
                                <div className="relative z-20 max-w-md space-y-6">
                                    <div className="w-14 h-14 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-2xl shadow-blue-900/20">
                                        <FileText size={24} />
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-3xl font-black text-[#002B5B] tracking-tighter leading-tight">{t('features.item1.title')}</h3>
                                        <p className="text-base text-slate-500 font-medium leading-relaxed tracking-tight">{t('features.item1.desc')}</p>
                                    </div>
                                    <Button variant="link" className="text-[#002B5B] p-0 font-black uppercase tracking-widest text-sm md:text-base h-auto flex items-center gap-2 group/btn">
                                        {t('features.item1.link')} <ArrowUpRight size={16} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                                    </Button>
                                </div>
                                <img loading="lazy" decoding="async" src="https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&q=80&w=1000" className="absolute right-0 top-0 w-1/2 h-full object-cover opacity-5 group-hover:opacity-10 transition-opacity duration-700" alt={t('features.imageAlt')} />
                            </motion.div>

                            <motion.div whileHover={{ y: -10 }} className="md:col-span-4 bg-[#002B5B] rounded-3xl md:rounded-[3rem] p-8 md:p-12 text-white flex flex-col justify-between shadow-2xl shadow-blue-900/20 relative overflow-hidden">
                                <MousePointer2 size={48} className="text-white/10 -rotate-12" />
                                <div className="space-y-4 relative z-10">
                                    <h3 className="text-2xl font-black text-white tracking-tighter leading-tight">{t('features.item2.title')}</h3>
                                    <p className="text-base text-slate-200/90 font-medium tracking-tight leading-relaxed">{t('features.item2.desc')}</p>
                                </div>
                            </motion.div>

                            <motion.div whileHover={{ y: -10 }} className="md:col-span-4 bg-white rounded-3xl md:rounded-[3rem] p-8 md:p-12 text-slate-900 border border-slate-100 flex flex-col justify-between shadow-sm group">
                                <Languages size={48} className="text-[#002B5B] transition-transform duration-500 group-hover:rotate-12" />
                                <div className="space-y-4">
                                    <h3 className="text-2xl font-black text-[#002B5B] tracking-tighter leading-tight">{t('features.item3.title')}</h3>
                                    <p className="text-base text-slate-500 font-medium leading-relaxed tracking-tight">{t('features.item3.desc')}</p>
                                </div>
                            </motion.div>

                            <motion.div whileHover={{ y: -10 }} className="md:col-span-8 bg-slate-50 rounded-3xl md:rounded-[3rem] p-8 md:p-12 border border-slate-100 flex flex-col md:flex-row items-center justify-between group overflow-hidden">
                                <div className="max-w-md space-y-8">
                                    <div className="space-y-4">
                                        <h3 className="text-3xl font-black text-[#002B5B] tracking-tighter leading-tight">{t('features.item4.title')}</h3>
                                        <p className="text-base text-slate-500 font-medium leading-relaxed tracking-tight">{t('features.item4.desc')}</p>
                                    </div>
                                    <div className="flex -space-x-3">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <img loading="lazy" decoding="async" key={i} src={`https://i.pravatar.cc/100?img=${i + 20}`} className="w-12 h-12 rounded-full border-4 border-white shadow-lg" alt={t('features.userAlt')} />
                                        ))}
                                        <div className="w-12 h-12 rounded-full border-4 border-white bg-[#002B5B] text-white flex items-center justify-center text-sm font-black shadow-lg">+120</div>
                                    </div>
                                </div>
                                <div className="hidden lg:flex w-1/4 aspect-square bg-white rounded-full items-center justify-center border border-slate-100 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 shadow-sm">
                                    <Users size={64} className="text-[#002B5B]/10" />
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Modern Vertical Stepper */}
                <section id="how-it-works" className="py-32 px-6 bg-white">
                    <div className="max-w-7xl mx-auto">
                        <div className="text-center max-w-3xl mx-auto mb-24 space-y-4">
                            <div className="text-blue-600 text-sm font-black uppercase tracking-[0.4em]">{t('process.tag')}</div>
                            <h2 className="text-4xl md:text-5xl font-black text-[#002B5B] tracking-tighter">
                                {t.rich('process.title', { br: () => <br /> })}
                            </h2>
                            <p className="text-lg text-slate-500 font-medium italic tracking-tight">{t('process.subtitle')}</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
                            <div className="space-y-16 relative">
                                <div className="absolute left-[31px] top-10 bottom-10 w-1 bg-slate-100 rounded-full" />
                                {[
                                    { step: "01", title: t('process.step1.title'), desc: t('process.step1.desc'), icon: Cloud, color: "bg-blue-600 shadow-blue-200" },
                                    { step: "02", title: t('process.step2.title'), desc: t('process.step2.desc'), icon: Monitor, color: "bg-indigo-600 shadow-indigo-200" },
                                    { step: "03", title: t('process.step3.title'), desc: t('process.step3.desc'), icon: Shield, color: "bg-emerald-600 shadow-emerald-200" }
                                ].map((item, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.2 }} className="flex gap-8 items-start relative z-10 group">
                                        <div className={`w-16 h-16 shrink-0 rounded-2xl ${item.color} text-white flex items-center justify-center shadow-2xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                                            <item.icon size={28} />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-sm md:text-base font-black text-blue-600 uppercase tracking-[0.2em] leading-none">{t('process.step')} {item.step}</div>
                                            <h3 className="text-2xl font-black text-[#002B5B] tracking-tighter leading-none">{item.title}</h3>
                                            <p className="text-base text-slate-500 font-medium leading-relaxed max-w-lg tracking-tight">{item.desc}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="relative group">
                                <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ duration: 1 }} className="rounded-3xl md:rounded-[3rem] overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] border-[8px] md:border-[12px] border-white relative z-10">
                                    <img loading="lazy" decoding="async" src="https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&q=80&w=2000" className="w-full h-full object-cover aspect-[4/5] transition-transform duration-[2000ms] group-hover:scale-110" alt={t('process.imageAlt')} />
                                    <div className="absolute inset-0 bg-blue-900/5 mix-blend-multiply" />
                                </motion.div>
                                <div className="absolute -bottom-12 -right-1 md:-right-10 bg-white p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] shadow-2xl max-w-[280px] md:max-w-xs border border-slate-100/50 z-20">
                                    <Quote size={32} className="text-blue-600 mb-4 opacity-20" />
                                    <p className="text-slate-900 font-bold text-base md:text-lg mb-6 italic leading-relaxed">{t('process.testimonial')}</p>
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-slate-200 overflow-hidden shadow-inner shrink-0">
                                            <img loading="lazy" decoding="async" src="https://i.pravatar.cc/100?img=33" alt={t('process.testimonialAuthor')} />
                                        </div>
                                        <div>
                                            <p className="text-sm md:text-base font-black text-slate-900 leading-none">{t('process.testimonialAuthor')}</p>
                                            <p className="text-[10px] md:text-xs text-slate-500 font-black mt-2 uppercase tracking-widest leading-none">{t('process.testimonialRole')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stats Impact */}
                <section className="py-32 px-6 bg-white overflow-hidden relative border-y border-slate-100">
                    <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-16 relative z-10">
                        {[
                            { label: t('stats.meetings'), value: "50K+", icon: Layout },
                            { label: t('stats.users'), value: "120K+", icon: Users },
                            { label: t('stats.saved'), value: "45%", icon: Zap },
                            { label: t('stats.rate'), value: "99.9%", icon: ShieldCheck },
                        ].map((stat, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center space-y-3">
                                <div className="text-4xl md:text-6xl font-black tracking-tighter text-[#002B5B]">{stat.value}</div>
                                <div className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.3em]">{stat.label}</div>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* Advanced Pricing Section */}
                <section id="pricing" className="py-32 px-6 bg-slate-50">
                    <div className="max-w-7xl mx-auto">
                        <div className="text-center max-w-3xl mx-auto mb-24 space-y-4">
                            <h2 className="text-4xl md:text-5xl font-black text-[#002B5B] tracking-tighter italic leading-none">
                                {t.rich('pricing.title', { br: () => <br /> })}
                            </h2>
                            <p className="text-lg text-slate-500 font-medium tracking-tight leading-relaxed">{t('pricing.subtitle')}</p>
                        </div>

                        {packs.length === 0 ? (
                            <div className="text-center p-24 bg-white rounded-[3rem] border border-dashed border-slate-200 shadow-inner">
                                <Sparkles size={36} className="mx-auto text-slate-200 mb-4" />
                                <p className="text-slate-400 font-black uppercase tracking-widest text-sm italic">{t('pricing.comingSoon')}</p>
                            </div>
                        ) : (
                            <div className={`grid grid-cols-1 gap-8 ${packs.length === 1 ? 'max-w-md mx-auto' : packs.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' : 'md:grid-cols-3'}`}>
                                {packs.map((pack, i) => {
                                    const isPopular = i === Math.floor(packs.length / 2);
                                    return (
                                        <motion.div key={pack.id} whileHover={{ y: -10 }} transition={{ type: "spring", stiffness: 300 }}
                                            className={`p-8 md:p-10 rounded-3xl md:rounded-[3rem] border relative flex flex-col justify-between transition-all duration-500 ${isPopular ? 'bg-[#002B5B] text-white border-transparent shadow-[0_40px_80px_-20px_rgba(0,43,91,0.2)] scale-105 z-10' : 'bg-white border-slate-200 shadow-2xl shadow-slate-200/50'}`}>
                                            <div className="space-y-8">
                                                <div className="flex justify-between items-start flex-wrap gap-4">
                                                    <div className="space-y-1">
                                                        <h3 className={`text-sm font-black uppercase tracking-[0.25em] mb-4 ${isPopular ? 'text-blue-300' : 'text-blue-600'}`}>{pack.name}</h3>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-3xl md:text-4xl font-black tracking-tighter">TND {pack.price_month.toFixed(0)}</span>
                                                            <span className={`text-sm font-black ${isPopular ? 'text-white/60' : 'text-slate-400'}`}>{t('pricing.month')}</span>
                                                        </div>
                                                        <p className={`text-sm font-black uppercase tracking-[0.3em] ${isPopular ? 'text-white/40' : 'text-slate-400'}`}>TND {pack.price_year.toFixed(0)} {t('pricing.yearly')}</p>
                                                    </div>
                                                    {isPopular && <div className="px-4 py-1.5 bg-blue-600 rounded-full text-xs md:text-sm font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-blue-600/40">{t('pricing.popular')}</div>}
                                                </div>
                                                <div className={`h-px w-full opacity-10 ${isPopular ? 'bg-white' : 'bg-slate-900'}`} />
                                                <ul className="space-y-4">
                                                    {pack.packs_lines.map(line => (
                                                        <li key={line.id} className="flex items-start gap-3 font-bold text-sm md:text-base leading-tight tracking-tight">
                                                            <CheckCircle2 size={20} className={`shrink-0 ${isPopular ? 'text-blue-400' : 'text-blue-600'}`} />
                                                            {line.title}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <Link href="/auth/signup" className="w-full block relative z-20">
                                                <Button size="lg" className={`w-full mt-12 h-14 md:h-16 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 ${isPopular ? 'bg-white text-[#002B5B] hover:bg-blue-50' : 'bg-[#002B5B] text-white hover:bg-[#003d80]'}`}>
                                                    {t('pricing.cta')}
                                                </Button>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {/* Ultimate CTA Section */}
                <section className="py-32 px-6">
                    <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="max-w-7xl mx-auto rounded-3xl md:rounded-[4rem] bg-[#002B5B] p-10 md:p-32 text-center text-white relative overflow-hidden shadow-2xl shadow-blue-900/20">
                        <div className="max-w-4xl mx-auto space-y-12 relative z-10">
                            <h2 className="text-3xl md:text-7xl text-white font-black tracking-tighter leading-[1.1] md:leading-[1.1]">
                                {t.rich('cta.title', {
                                    br: () => <br className="hidden md:block" />,
                                    highlight: (chunks) => <span className="text-white underline decoration-blue-500/50 decoration-8 underline-offset-4 italic inline-block">{chunks}</span>
                                })}
                            </h2>
                            <p className="text-base md:text-xl text-blue-100/70 font-medium leading-relaxed tracking-tight max-w-2xl mx-auto">{t('cta.subtitle')}</p>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-6">
                                <Link href="/auth/signup" className="w-full sm:w-auto">
                                    <Button size="lg" className="w-full sm:w-auto h-16 md:h-20 px-8 md:px-12 text-lg font-black rounded-2xl bg-white text-[#002B5B] hover:scale-105 active:scale-95 transition-all shadow-xl">
                                        {t('cta.primary')}
                                    </Button>
                                </Link>
                                <Link href="/contact" className="w-full sm:w-auto">
                                    <Button variant="outline" size="lg" className="w-full sm:w-auto h-16 md:h-20 px-8 md:px-12 text-lg font-black rounded-2xl border-white text-white hover:bg-white/10 transition-all">
                                        {t('cta.secondary')}
                                    </Button>
                                </Link>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 pt-16 opacity-50">
                                <div className="flex items-center gap-2 text-[10px] md:text-sm font-black uppercase tracking-[0.3em]"><Star size={18} className="fill-amber-400 text-amber-400" /> {t('cta.rating')}</div>
                                <div className="flex items-center gap-2 text-[10px] md:text-sm font-black uppercase tracking-[0.3em]"><ShieldCheck size={18} /> {t('cta.soc2')}</div>
                                <div className="flex items-center gap-2 text-[10px] md:text-sm font-black uppercase tracking-[0.3em]"><Globe size={18} /> {t('cta.support')}</div>
                            </div>
                        </div>
                    </motion.div>
                </section>
            </main>
        </div>
    );
}
