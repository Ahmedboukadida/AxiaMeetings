'use client';
import { fetchPublicData } from '@/lib/public-data';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Calendar, ArrowLeft, Info, FileText, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';

export default function PrivacyPolicyPage() {
    const t = useTranslations('Home');
    const router = useRouter();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPublicData()
            .then(res => {
                if (res.status && res.data?.settings) {
                    setContent(res.data.settings.privacy_policy);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="pt-48 pb-32 px-6 relative bg-white print:pt-0 print:pb-0 print:px-0">

            <div className="max-w-5xl mx-auto space-y-12 relative z-10">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
                >
                    <div className="space-y-4">
                        <button onClick={() => router.back()} className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-[#002B5B] transition-all group no-print">
                            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> {t('legal.back')}
                        </button>
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-[#002B5B] rounded-[1.2rem] md:rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shadow-blue-900/20 shrink-0">
                                <ShieldCheck size={32} className="md:w-9 md:h-9" />
                            </div>
                            <div>
                                <Typography variant="h1" className="text-4xl md:text-6xl font-black tracking-tight text-[#002B5B]">{t('legal.privacyTitle')}</Typography>
                                <div className="flex items-center gap-3 mt-3">
                                    <Badge variant="secondary" className="h-7 px-3 font-black text-[10px] uppercase tracking-widest bg-blue-50 text-[#002B5B] border-blue-100">{t('legal.officialDocument')}</Badge>
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                    <div className="flex items-center gap-1.5 text-slate-400 font-bold text-xs uppercase tracking-widest">
                                        <Calendar size={14} /> {t('legal.lastUpdated')}: {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_40px_100px_-20px_rgba(0,43,91,0.08)] overflow-hidden print:rounded-none print:border-none print:shadow-none"
                >
                    <div className="p-10 md:p-20 relative print:p-0">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 -z-10 opacity-50 no-print"></div>

                        {loading ? (
                            <div className="space-y-8">
                                <div className="space-y-3">
                                    <div className="h-8 bg-slate-100 rounded-xl w-1/2 animate-pulse" />
                                    <div className="h-4 bg-slate-50 rounded-xl w-3/4 animate-pulse" />
                                </div>
                                <div className="space-y-3">
                                    <div className="h-4 bg-slate-50 rounded-xl w-full animate-pulse" />
                                    <div className="h-4 bg-slate-50 rounded-xl w-5/6 animate-pulse" />
                                    <div className="h-4 bg-slate-50 rounded-xl w-4/5 animate-pulse" />
                                </div>
                                <div className="space-y-3 pt-10">
                                    <div className="h-8 bg-slate-100 rounded-xl w-1/3 animate-pulse" />
                                    <div className="h-4 bg-slate-50 rounded-xl w-full animate-pulse" />
                                    <div className="h-4 bg-slate-50 rounded-xl w-11/12 animate-pulse" />
                                </div>
                            </div>
                        ) : content ? (
                            <div className="prose prose-slate max-w-none">
                                <div className="flex items-center gap-3 mb-10 pb-6 border-b border-slate-50 no-print">
                                    <div className="w-12 h-12 rounded-2xl bg-[#002B5B]/5 flex items-center justify-center text-[#002B5B] shadow-sm">
                                        <Info size={24} />
                                    </div>
                                    <Typography variant="label" className="text-[#002B5B] font-black uppercase tracking-[0.2em] text-xs">{t('legal.complianceOverview')}</Typography>
                                </div>
                                <div className="whitespace-pre-wrap text-slate-600 text-lg font-medium leading-loose text-justify px-2 md:px-6">
                                    {content}
                                </div>
                            </div>
                        ) : (
                            <div className="py-32 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200">
                                    <FileText size={48} />
                                </div>
                                <div>
                                    <Typography variant="h3" className="text-slate-400 font-bold">{t('legal.noContent')}</Typography>
                                    <Typography variant="p" className="text-slate-300 mt-2">{t('legal.noContentDescPrivacy')}</Typography>
                                </div>
                            </div>
                        )}

                        <div className="mt-20 pt-12 border-t border-slate-50 flex flex-col md:flex-row justify-between items-center gap-8 no-print">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                                    <Lock size={14} className="text-emerald-500" /> {t('legal.secureProcessing')}
                                </div>
                                <span className="w-1 h-1 rounded-full bg-slate-200" />
                                <div className="flex items-center gap-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                                    <FileText size={14} className="text-blue-500" /> {t('legal.officialRecord')}
                                </div>
                            </div>
                            <Typography variant="muted" className="text-[10px] uppercase font-black tracking-widest opacity-30">© {new Date().getFullYear()} {t('legal.copyright')}</Typography>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
