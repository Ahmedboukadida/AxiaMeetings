'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ApiResponse } from '@/lib/types';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Calendar, MapPin, Clock, Video, Info, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badges';
import { cn } from '@/lib/utils';

interface ParticipantData {
    id: number;
    email: string;
    meeting_id: number;
    token: string;
    meeting: {
        id: number;
        subject: string;
        date: string;
        time: string;
        location: string;
        mode: string;
        status: string;
    };
    meetings_invitations: { id: number; status: string }[];
}

export default function JoinMeetingPage() {
    const { id } = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    const [data, setData] = useState<ParticipantData | null>(null);
    const [loading, setLoading] = useState(true);
    const [responding, setResponding] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<string | null>(null);
    const t = useTranslations('JoinMeeting');
    const tc = useTranslations('Common');


    useEffect(() => {
        if (!token || !email) {
            toast.error(t('toast.invalidLink'));
            router.replace('/');
            return;
        }
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/meetings/${id}/join?token=${token}&email=${encodeURIComponent(email)}`);
                const result: ApiResponse<ParticipantData> = await res.json();
                if (result.status && result.data) {
                    setData(result.data);
                    setCurrentStatus(result.data.meetings_invitations?.[0]?.status || 'PENDING');
                } else {
                    toast.error(result.message || t('toast.invalidInvitation'));
                    router.replace('/');
                }
            } catch {
                toast.error(t('toast.errorLoading'));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, token, email, router, t]);

    const respond = async (response: 'ACCEPTED' | 'REJECTED') => {
        setResponding(true);
        try {
            const res = await fetch(`/api/meetings/${id}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, email, response }),
            });
            const result: ApiResponse<null> = await res.json();
            if (result.status) {
                setCurrentStatus(response);
                toast.success(response === 'ACCEPTED' ? t('toast.accepted') : t('toast.declined'));
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch {
            toast.error(t('toast.errorResponding'));
        } finally {
            setResponding(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFDFD] gap-4">
                <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                <Typography variant="label">{tc('loading')}</Typography>
            </div>
        );
    }

    if (!data) return null;

    const meeting = data.meeting;
    const isAccepted = currentStatus === 'ACCEPTED';
    const isRejected = currentStatus === 'REJECTED';

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 md:p-12 relative overflow-hidden">
            {/* Ultra-Premium Background Elements */}
            <div className="absolute -top-[10%] -right-[10%] w-[60%] h-[60%] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-grid-blue" />

            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-2xl relative z-10"
            >
                <div className="bg-white/80 backdrop-blur-2xl rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,43,91,0.12)] border border-white/50 overflow-hidden">
                    {/* Header: Immersive & Dynamic */}
                    <div className="bg-[#002B5B] p-10 md:p-12 text-white relative">
                        <div className="absolute inset-0 opacity-20 bg-radial-white-small" />
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl" />
                        
                        <div className="relative z-10">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                <Badge variant="primary" className="bg-white/10 text-white border-white/10 px-3 py-1 uppercase font-semibold text-[10px] mb-4 inline-flex">
                                    {t('title')}
                                </Badge>
                            </motion.div>
                            <Typography variant="h1" className="text-white text-3xl md:text-4xl font-semibold leading-tight">
                                {meeting.subject}
                            </Typography>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="p-8 md:p-10 space-y-10">
                        {/* Info Grid: Refined Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {[
                                { icon: Calendar, label: t('info.date'), value: meeting.date, color: 'text-blue-600', bg: 'bg-blue-50/50' },
                                { icon: Clock, label: t('info.time'), value: meeting.time, color: 'text-indigo-600', bg: 'bg-indigo-50/50' },
                                { icon: MapPin, label: t('info.location'), value: meeting.location || t('info.locationOnline'), color: 'text-emerald-600', bg: 'bg-emerald-50/50' },
                                { icon: Video, label: t('info.mode'), value: t(`info.modes.${meeting.mode}`), color: 'text-purple-600', bg: 'bg-purple-50/50' },
                            ].map((item, idx) => (
                                <motion.div 
                                    key={item.label}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + idx * 0.1 }}
                                    className="flex items-center gap-4 group"
                                >
                                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-current/5 transition-all group-hover:scale-105 group-hover:shadow-lg", item.bg, item.color)}>
                                        <item.icon size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <Typography variant="label" className="text-slate-400 font-semibold uppercase text-[10px] block mb-0.5">{item.label}</Typography>
                                        <Typography variant="large" className="truncate text-slate-800 font-semibold text-sm">{item.value}</Typography>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Invitation Context */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.7 }}
                            className="p-6 rounded-2xl bg-slate-50/50 border border-slate-100 flex items-center gap-4"
                        >
                            <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm">
                                <Info size={20} />
                            </div>
                            <div className="min-w-0">
                                <Typography variant="label" className="text-slate-400 font-semibold uppercase text-[10px] mb-0.5 block">{t('info.invitedAs')}</Typography>
                                <Typography variant="large" className="text-[#002B5B] font-semibold text-sm truncate">{data.email}</Typography>
                            </div>
                        </motion.div>

                        {/* Action Interaction Zone */}
                        <div className="pt-4">
                            <AnimatePresence mode="wait">
                                {currentStatus === 'PENDING' ? (
                                    <motion.div
                                        key="pending"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="space-y-8"
                                    >
                                        <Typography variant="h3" className="text-center text-slate-500 font-medium text-lg">
                                            {t('question')}
                                        </Typography>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Button
                                                onClick={() => respond('ACCEPTED')}
                                                disabled={responding}
                                                className="h-14 text-base font-semibold uppercase bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-500/20 rounded-xl"
                                            >
                                                {responding ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                                    <>
                                                        <CheckCircle2 size={20} className="mr-3" />
                                                        {t('accept')}
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => respond('REJECTED')}
                                                disabled={responding}
                                                className="h-14 text-base font-semibold uppercase border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-100 rounded-xl transition-all"
                                            >
                                                <XCircle size={20} className="mr-3" />
                                                {t('decline')}
                                            </Button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="status"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className={cn(
                                            "rounded-2xl p-10 text-center border",
                                            isAccepted ? "bg-emerald-50/30 border-emerald-100" : "bg-red-50/30 border-red-100"
                                        )}
                                    >
                                        {isAccepted ? (
                                            <div className="space-y-6">
                                                <div className="relative inline-block">
                                                    <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
                                                    <div className="relative w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-lg border border-emerald-50">
                                                        <CheckCircle2 size={40} className="text-emerald-500" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <Typography variant="h2" className="text-emerald-900 text-2xl font-semibold mb-2">{t('status.accepted.title')}</Typography>
                                                    <Typography variant="p" className="text-emerald-600/80 font-medium max-w-sm mx-auto text-sm">{t('status.accepted.message')}</Typography>
                                                </div>
                                                {meeting.status === 'STARTED' && (
                                                    <Button
                                                        onClick={() => router.push(`/meetings/${id}/live?token=${token}&email=${encodeURIComponent(email || '')}`)}
                                                        className="h-14 px-10 text-base font-semibold uppercase shadow-xl shadow-blue-900/20 rounded-xl bg-[#002B5B] hover:bg-blue-900 group"
                                                    >
                                                        {t('status.accepted.joinLive')}
                                                        <ArrowRight className="ml-3 w-5 h-5 transition-transform group-hover:translate-x-1" />
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <div className="relative inline-block">
                                                    <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
                                                    <div className="relative w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-lg border border-red-50">
                                                        <XCircle size={40} className="text-red-500" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <Typography variant="h2" className="text-red-900 text-2xl font-semibold mb-2">{t('status.declined.title')}</Typography>
                                                    <Typography variant="p" className="text-red-600/80 font-medium max-w-sm mx-auto text-sm">{t('status.declined.message')}</Typography>
                                                </div>
                                                <button
                                                    onClick={() => setCurrentStatus('PENDING')}
                                                    className="text-[10px] font-semibold text-[#002B5B] hover:text-blue-700 uppercase mt-4 transition-colors border-b border-blue-900/10 pb-0.5"
                                                >
                                                    {t('status.declined.change')}
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Brand Support */}
                <div className="mt-10 text-center opacity-40">
                    <Typography variant="label" className="uppercase font-semibold text-[10px] text-slate-400">
                        Powered by Axia Agile Ecosystem
                    </Typography>
                </div>
            </motion.div>
        </div>
    );
}
