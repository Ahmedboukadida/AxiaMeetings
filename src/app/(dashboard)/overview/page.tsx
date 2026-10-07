'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, Users, Video, CalendarClock, PieChart as PieChartIcon, Activity, Database, ShieldCheck, ScrollText, TrendingUp, ArrowUpRight, Plus, Calendar, Clock, ChevronRight, Sparkles, Ban, Terminal, UserPlus, MessageSquare, KeyRound, MessageCircle, Cpu } from 'lucide-react';
import { OverviewStats, ApiResponse } from '@/lib/types';
import { toast } from 'sonner';
import { motion, animate, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/components/context/AuthContext';
import Link from 'next/link';

import { useTranslations, useLocale } from 'next-intl';
import { Typography } from '@/components/ui/typographys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badges';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/cards';
import { StatsCard } from '@/components/ui/StatsCard';
import { Progress } from '@/components/ui/progress';
import dynamic from 'next/dynamic';

const ChartSkeleton = ({ height = 200 }: { height?: number }) => (
  <div 
    style={{ height }} 
    className="w-full bg-slate-50/50 animate-pulse rounded-2xl flex items-center justify-center border border-slate-100/50"
  >
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Loading...</span>
    </div>
  </div>
);

const AreaChartComponent = dynamic(() => import('@/components/ui/charts/areas'), { 
  ssr: false, 
  loading: () => <ChartSkeleton height={160} /> 
});
const BarChartComponent = dynamic(() => import('@/components/ui/charts/bars'), { 
  ssr: false, 
  loading: () => <ChartSkeleton height={340} /> 
});
const PieChartComponent = dynamic(() => import('@/components/ui/charts/pies'), { 
  ssr: false, 
  loading: () => <ChartSkeleton height={200} /> 
});
const DoughnutChartComponent = dynamic(() => import('@/components/ui/charts/doughnuts'), { 
  ssr: false, 
  loading: () => <ChartSkeleton height={180} /> 
});
const RadialBarChartComponent = dynamic(() => import('@/components/ui/charts/radialbars'), { 
  ssr: false, 
  loading: () => <ChartSkeleton height={180} /> 
});
const HorizontalBarChartComponent = dynamic(() => import('@/components/ui/charts/horizontal-bars'), { 
  ssr: false, 
  loading: () => <ChartSkeleton height={160} /> 
});
const RadarChartComponent = dynamic(() => import('@/components/ui/charts/radars'), { 
  ssr: false, 
  loading: () => <ChartSkeleton height={200} /> 
});

import { cn } from '@/lib/utils';
import { CompanyCarousel } from '@/components/ui/carousels';

const STATUS_COLORS: Record<string, string> = { SCHEDULED: '#3b82f6', STARTED: '#22c55e', FINISHED: '#64748b', CANCELLED: '#ef4444' };
const PIE_COLORS = ["#002B5B", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

function AnimatedCounter({ value }: { value: number }) {
    const nodeRef = useRef<HTMLParagraphElement>(null);
    useEffect(() => {
        const node = nodeRef.current;
        if (node) {
            const controls = animate(0, value, {
                duration: 1.5,
                ease: [0.33, 1, 0.68, 1], // Custom cubic bezier for premium feel
                onUpdate(v) {
                    node.textContent = Math.round(v).toLocaleString();
                }
            });
            return () => controls.stop();
        }
    }, [value]);
    return <Typography variant="h1" as="p" ref={nodeRef} className="text-xl md:text-2xl font-semibold leading-none tabular-nums">{value.toLocaleString()}</Typography>;
}

interface CalendarMeeting {
    id: number;
    subject: string;
    date: string;
    time: string;
    status: string;
    company?: { name: string } | null;
}

const MiniCalendar = ({ meetings = [] }: { meetings?: CalendarMeeting[] }) => {
    const t = useTranslations('Dashboard.overview');
    const tm = useTranslations('Meetings');
    const tc = useTranslations('Common');
    const locale = useLocale();

    const today = new Date();
    const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
    const [selectedYear, setSelectedYear] = useState(today.getFullYear());
    const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

    const currentYear = today.getFullYear();
    const yearsRange = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i);

    const months = t.raw('calendar.months');
    const weekDays = t.raw('calendar.days');

    const firstDayIndex = new Date(selectedYear, selectedMonth, 1).getDay();
    const totalDaysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const totalDaysInPrevMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    const cells = [];

    // Prev month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const d = totalDaysInPrevMonth - i;
        const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
        const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        cells.push({
            day: d,
            isCurrentMonth: false,
            dateString: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
        cells.push({
            day: i,
            isCurrentMonth: true,
            dateString: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        });
    }

    // Next month days
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
        const nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
        const nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
        cells.push({
            day: i,
            isCurrentMonth: false,
            dateString: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        });
    }

    const meetingDateStrings = new Set(meetings.map(m => m.date));

    const formatTime12h = (timeStr: string) => {
        if (!timeStr) return '';
        const [hoursStr, minutesStr] = timeStr.split(':');
        const hours = parseInt(hoursStr, 10);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        return `${String(hours12).padStart(2, '0')}:${minutesStr} ${ampm}`;
    };

    const isToday = (dateString: string) => {
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        return dateString === todayStr;
    };

    const formatEventDate = (dateStr: string) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        const monthIdx = parseInt(m, 10) - 1;
        const monthName = months[monthIdx]?.substring(0, 3) || m;
        return `${d} ${monthName}`;
    };

    const sortedRecentMeetings = [...meetings].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.time.localeCompare(a.time);
    });

    const eventList = selectedDateStr
        ? meetings.filter(m => m.date === selectedDateStr).sort((a, b) => a.time.localeCompare(b.time))
        : sortedRecentMeetings.slice(0, 5);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col h-full group hover:shadow-2xl hover:shadow-blue-900/5 transition-all duration-500"
        >
            <div className="flex items-center justify-between mb-4">
                <Typography variant="h3" className="text-[#002B5B] text-sm md:text-base font-bold">
                    {t('calendar.upcomingSchedules')}
                </Typography>
                <div className="flex items-center gap-1.5">
                    <select
                        value={selectedMonth}
                        onChange={(e) => {
                            setSelectedMonth(parseInt(e.target.value));
                            setSelectedDateStr(null);
                        }}
                        className="text-slate-600 font-semibold border-slate-200 border rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none cursor-pointer hover:border-slate-300 transition-colors"
                    >
                        {months.map((name: string, idx: number) => (
                            <option key={idx} value={idx}>{name}</option>
                        ))}
                    </select>
                    <select
                        value={selectedYear}
                        onChange={(e) => {
                            setSelectedYear(parseInt(e.target.value));
                            setSelectedDateStr(null);
                        }}
                        className="text-slate-600 font-semibold border-slate-200 border rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none cursor-pointer hover:border-slate-300 transition-colors"
                    >
                        {yearsRange.map((yr) => (
                            <option key={yr} value={yr}>{yr}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400 mb-2">
                {weekDays.map((d: string) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs content-start mb-6">
                {cells.map((cell, idx) => {
                    const isCellToday = isToday(cell.dateString);
                    const hasMeeting = meetingDateStrings.has(cell.dateString);
                    const isSelected = selectedDateStr === cell.dateString;
                    return (
                        <div
                            key={idx}
                            onClick={() => {
                                if (selectedDateStr === cell.dateString) {
                                    setSelectedDateStr(null);
                                } else {
                                    setSelectedDateStr(cell.dateString);
                                }
                            }}
                            className={cn(
                                "p-1 rounded-lg flex flex-col items-center justify-center relative transition-all duration-300 h-9 cursor-pointer select-none",
                                !cell.isCurrentMonth ? 'text-slate-300 hover:bg-slate-50/50' :
                                    isCellToday ? 'bg-[#0cb09d] text-white font-bold shadow-md shadow-teal-500/20 z-10 hover:bg-[#0aa391]' :
                                        isSelected ? 'bg-slate-100 text-slate-800 font-bold border border-[#0cb09d]/30' :
                                            'text-slate-600 font-medium hover:bg-slate-50'
                            )}
                        >
                            <span>{cell.day}</span>
                            {hasMeeting && (
                                <span className={cn(
                                    "w-1 h-1 rounded-full absolute bottom-1",
                                    isCellToday ? "bg-white" : "bg-[#0cb09d]"
                                )} />
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="border-t border-slate-100 pt-4 flex-1 flex flex-col justify-start">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                        {t('calendar.eventsHeader')}
                    </span>
                    {selectedDateStr && (
                        <button
                            onClick={() => setSelectedDateStr(null)}
                            className="text-[9px] font-bold text-[#0cb09d] hover:underline uppercase tracking-wider"
                        >
                            {tc('showAll')}
                        </button>
                    )}
                </div>
                <div className="space-y-3 pr-1">
                    {eventList.length > 0 ? (
                        eventList.slice(0, 5).map((m) => {
                            const dayNum = m.date.split('-')[2];
                            return (
                                <Link key={m.id} href={`/meetings/${m.id}`} className="block group">
                                    <div className="flex items-center justify-between py-1 transition-all duration-300 group-hover:translate-x-1 cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-[#0cb09d]/10 text-[#0cb09d] flex items-center justify-center font-bold text-xs shrink-0 transition-colors group-hover:bg-[#0cb09d] group-hover:text-white">
                                                {dayNum}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-slate-700 font-semibold text-xs truncate max-w-[150px] sm:max-w-[200px] group-hover:text-[#002B5B] transition-colors">
                                                    {m.subject}
                                                </span>
                                                <span className="text-slate-400 text-[10px] font-medium truncate max-w-[120px] sm:max-w-[160px]">
                                                    {m.company?.name || tm('card.notSpecified')} • {formatEventDate(m.date)}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-slate-400 text-[10px] font-semibold whitespace-nowrap">
                                            {formatTime12h(m.time)}
                                        </span>
                                    </div>
                                </Link>
                            );
                        })
                    ) : (
                        <div className="text-center text-slate-400 italic text-[11px] py-4">
                            {t('calendar.noEvents')}
                        </div>
                    )}
                </div>
                {meetings.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-center">
                        <Link href="/meetings" className="text-[11px] font-bold text-[#0cb09d] hover:underline uppercase tracking-wider flex items-center gap-1">
                            <span>{t('calendar.viewAllMeetings')}</span>
                            <ChevronRight size={12} className="rtl:rotate-180" />
                        </Link>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default function OverviewPage() {
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [volumePeriod, setVolumePeriod] = useState<'day' | 'days' | 'week' | 'month' | '3months' | 'year' | 'all'>('month');
    const [systemPeriod, setSystemPeriod] = useState<'day' | 'days' | 'week' | 'month' | '3months' | 'year' | 'all'>('days');

    const t = useTranslations('Dashboard.overview');
    const ts = useTranslations('Dashboard.sidebar');
    const tc = useTranslations('Common');
    const tm = useTranslations('Meetings');
    const tf = useTranslations('Dashboard.aiTokens.features');
    const { user } = useAuth();
    const locale = useLocale();
    const isDeveloper = user?.role === 'DEVELOPER';

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch(`/api/overview?volumePeriod=${volumePeriod}&systemPeriod=${systemPeriod}`);
                const result: ApiResponse<OverviewStats> = await res.json();
                if (result.status && result.data) {
                    setStats(result.data);
                } else {
                    toast.error(result.message || tc('error'));
                }
            } catch {
                toast.error(tc('error'));
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [volumePeriod, systemPeriod, tc]);

    const statCards = [
        ...(isDeveloper ? [{ title: ts('companies'), value: stats?.companies ?? 0, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', href: '/companies' }] : []),
        { title: t('stats.apis'), value: stats?.apis ?? 0, icon: Database, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100', href: '/companies/apis' },
        { title: t('stats.admins'), value: stats?.admins ?? 0, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', href: '/companies/admins' },
        { title: ts('users'), value: stats?.users ?? 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', href: '/users' },
        { title: ts('meetings'), value: stats?.meetings ?? 0, icon: Video, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', href: '/meetings' },
        { title: t('stats.cancelled'), value: stats?.meetingsByStatus?.CANCELLED ?? 0, icon: Ban, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', href: '/meetings' },
        { title: ts('logs'), value: stats?.logs ?? 0, icon: ScrollText, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', href: '/logs' },
        ...(isDeveloper ? [{ title: t('stats.aiWorkers'), value: stats?.aiWorkers ?? 0, icon: Cpu, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', href: '/ai-tokens' }] : []),
    ];

    if (loading) {
        return (
            <div className="space-y-8 md:space-y-12 pb-20 animate-pulse">
                {/* Header Skeleton */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div className="flex items-center gap-6 w-full">
                        <div className="w-12 h-12 bg-slate-200 rounded-xl shrink-0" />
                        <div className="space-y-2 w-full max-w-sm">
                            <div className="h-4 bg-slate-200 rounded w-1/3" />
                            <div className="h-3 bg-slate-100 rounded w-2/3" />
                        </div>
                    </div>
                </div>

                {/* Key Metrics Grid Skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                            <div className="space-y-3 w-2/3">
                                <div className="h-2.5 bg-slate-200 rounded w-1/2" />
                                <div className="h-6 bg-slate-300 rounded w-3/4" />
                            </div>
                            <div className="w-10 h-10 bg-slate-200 rounded-xl shrink-0" />
                        </div>
                    ))}
                </div>

                {/* Main Content Grid Skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-2 w-1/3">
                                <div className="h-3 bg-slate-200 rounded" />
                                <div className="h-2.5 bg-slate-100 rounded w-2/3" />
                            </div>
                            <div className="w-20 h-8 bg-slate-200 rounded-lg" />
                        </div>
                        <div className="h-80 bg-slate-50/50 rounded-2xl w-full" />
                    </div>
                    <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                        <div className="space-y-2">
                            <div className="h-3 bg-slate-200 rounded w-1/2" />
                            <div className="h-2.5 bg-slate-100 rounded w-3/4" />
                        </div>
                        <div className="h-80 bg-slate-50/50 rounded-2xl w-full" />
                    </div>
                </div>
            </div>
        );
    }

    const formatPieData = (data: Record<string, number> | undefined) => {
        if (!data) return [];
        return Object.entries(data).filter(([_, value]) => value > 0).map(([name, value]) => ({ name, value }));
    };

    const statusData = formatPieData(stats?.meetingsByStatus);
    const typeData = formatPieData(stats?.meetingsByType);
    const usersRoleData = formatPieData(stats?.usersByRole);
    const apiMethodsData = stats?.apisByMethod ? Object.entries(stats.apisByMethod).filter(([_, value]) => value > 0).map(([name, value]) => ({ name, value })) : [];

    const totalMeetings = (stats?.meetingsByStatus?.SCHEDULED ?? 0) + 
                          (stats?.meetingsByStatus?.STARTED ?? 0) + 
                          (stats?.meetingsByStatus?.FINISHED ?? 0) + 
                          (stats?.meetingsByStatus?.CANCELLED ?? 0);

    const statusesList = [
        { key: 'FINISHED', label: tm('status.finished') || 'Finished', count: stats?.meetingsByStatus?.FINISHED ?? 0, color: '#64748b' },
        { key: 'STARTED', label: tm('status.started') || 'Live', count: stats?.meetingsByStatus?.STARTED ?? 0, color: '#22c55e' },
        { key: 'SCHEDULED', label: tm('status.scheduled') || 'Scheduled', count: stats?.meetingsByStatus?.SCHEDULED ?? 0, color: '#3b82f6' },
        { key: 'CANCELLED', label: tm('status.cancelled') || 'Cancelled', count: stats?.meetingsByStatus?.CANCELLED ?? 0, color: '#ef4444' },
    ];

    return (
        <div className="space-y-8 md:space-y-12 pb-20">
            {/* Premium Welcome Header */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shadow-blue-900/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 md:w-80 h-64 md:h-80 bg-blue-50/40 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 -z-10"></div>
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 text-center sm:text-left w-full md:w-auto">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#002B5B] rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 shrink-0 relative">
                            <div className="absolute inset-0 bg-linear-to-br from-white/10 to-transparent rounded-[inherit]"></div>
                            <Sparkles size={20} className="md:w-6 md:h-6 text-blue-200" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-center sm:justify-start gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-slate-200" />
                                <Typography variant="label" className="text-slate-500 font-bold uppercase text-[8px]">{new Date().toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</Typography>
                            </div>
                            <div className="space-y-0.5">
                                <Typography variant="h2" className="text-[#002B5B] text-xl font-bold leading-tight">
                                    {t('title')}
                                </Typography>
                                <Typography variant="p" color="secondary" className="max-w-xl text-[11px] font-bold uppercase">
                                    {t('welcome', { name: user?.fullname || user?.username || '' })}
                                </Typography>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <Link href="/meetings" className="w-full">
                            <Button className="w-full md:w-auto h-10 px-6 shadow-lg shadow-blue-900/10 font-semibold text-sm">
                                <ArrowRight size={18} className="me-2" /> {ts('meetings')}
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Stats Cards Row */}
            <div className={cn(
                "grid gap-4",
                isDeveloper 
                    ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-4"
                    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3"
            )}>
                {statCards.map((stat, i) => (
                    <Link key={i} href={stat.href} className="block group">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                            className={cn(
                                "bg-white rounded-2xl p-4 border shadow-sm h-28 transition-all duration-500 flex flex-col justify-between relative overflow-hidden group-hover:shadow-xl group-hover:shadow-blue-900/5 group-hover:-translate-y-1",
                                stat.border
                            )}
                        >
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-slate-50/50 rounded-full blur-2xl group-hover:bg-blue-50/50 transition-colors duration-500" />
                            <div className="flex items-center justify-between mb-2 relative z-10">
                                <Typography variant="label" className="text-[11px] font-bold uppercase text-slate-400 group-hover:text-[#002B5B] transition-colors">{stat.title}</Typography>
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-sm border border-current/10 transition-transform duration-500 group-hover:scale-110", stat.bg, stat.color)}>
                                    <stat.icon size={14} />
                                </div>
                            </div>
                            <div className="relative z-10 flex items-baseline gap-2 mt-auto">
                                <AnimatedCounter value={stat.value} />
                                <div className="flex items-center text-emerald-500 text-[9px] font-semibold bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                                    <ArrowUpRight size={10} className="me-1" />
                                    {t('stats.live')}
                                </div>
                            </div>
                        </motion.div>
                    </Link>
                ))}
            </div>

            {/* Calendar & Volume Analysis Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                {/* Calendar View */}
                <div className="lg:col-span-4 flex flex-col">
                    <MiniCalendar meetings={stats?.calendarMeetings} />
                </div>

                {/* Main Volume Trend Chart */}
                <div className="lg:col-span-8 flex flex-col">
                    <StatsCard
                        title={t('charts.volumeTitle')}
                        subtitle={t('charts.volumeSubtitle', { item: ts('meetings') })}
                        icon={<TrendingUp size={14} className="sm:w-[18px] sm:h-[18px]" />}
                        iconWrapperClassName="bg-blue-50 text-[#002B5B] border-blue-100"
                        className="h-full flex flex-col justify-between"
                        action={
                            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold border border-slate-200/50">
                                {(['day', 'days', 'week', 'month', '3months', 'year', 'all'] as const).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setVolumePeriod(p)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-md transition-all uppercase text-[9px] cursor-pointer",
                                            volumePeriod === p
                                                ? "bg-white text-[#002B5B] shadow-xs font-bold"
                                                : "text-slate-500 hover:text-[#002B5B]"
                                        )}
                                    >
                                        {t(`periods.${p}`)}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <BarChartComponent
                            data={stats?.trendData || []}
                            xKey="name"
                            series={[{ key: 'meetings', name: ts('meetings'), color: '#002B5B' }]}
                            height={340}
                        />
                    </StatsCard>
                </div>
            </div>

            {/* Doughnut Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Status Distribution */}
                <StatsCard
                    title={t('charts.statusMix')}
                    subtitle={t('charts.statusMixSubtitle')}
                    icon={<PieChartIcon size={14} className="sm:w-[18px] sm:h-[18px]" />}
                    iconWrapperClassName="bg-purple-50 text-purple-600 border-purple-100"
                    className="lg:col-span-6"
                >
                    <div className="grow flex flex-col items-center justify-between w-full min-h-[300px] py-2">
                        {statusData.length > 0 ? (
                            <>
                                <div className="w-full flex justify-center">
                                    <DoughnutChartComponent
                                        data={statusData}
                                        colors={statusData.map(entry => STATUS_COLORS[entry.name] || PIE_COLORS[0])}
                                        height={180}
                                        totalLabel={tm('multiple') || 'Meetings'}
                                        hideLegend={true}
                                    />
                                </div>
                                <div className="w-full space-y-2 mt-4 pt-4 border-t border-slate-100 text-xs md:text-sm">
                                    {statusesList.map((st) => {
                                        const pct = totalMeetings > 0 ? ((st.count / totalMeetings) * 100).toFixed(1) : "0.0";
                                        return (
                                            <div key={st.key} className="flex items-center justify-between text-slate-600 hover:bg-slate-50/50 p-2 rounded-xl transition-all duration-300">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: st.color }} />
                                                    <span className="font-semibold text-slate-700">{st.label}</span>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    <span className="font-medium text-slate-500">{st.count} {st.count === 1 ? tm('single') : tm('multiple')}</span>
                                                    <span className="font-bold text-[#002B5B] w-12 text-right">{pct}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-slate-300 opacity-20 py-20">
                                <PieChartIcon size={64} className="mb-4" />
                                <Typography variant="label" className="uppercase font-bold">{t('charts.noStatusData')}</Typography>
                            </div>
                        )}
                    </div>
                </StatsCard>

                {/* Role Composition */}
                <StatsCard
                    title={t('charts.roleComposition')}
                    subtitle={t('charts.roleCompositionSubtitle')}
                    icon={<Users size={14} className="sm:w-[18px] sm:h-[18px]" />}
                    iconWrapperClassName="bg-emerald-50 text-emerald-600 border-emerald-100"
                    className="lg:col-span-6"
                >
                    <div className="grow flex items-center justify-center min-h-[280px]">
                        {usersRoleData.length > 0 ? (
                            <DoughnutChartComponent
                                data={usersRoleData}
                                colors={PIE_COLORS}
                                height={280}
                                totalLabel={ts('users')}
                            />
                        ) : (
                            <div className="py-20 flex flex-col items-center justify-center text-slate-100">
                                <Users size={48} />
                            </div>
                        )}
                    </div>
                </StatsCard>

                {!isDeveloper && (
                    <StatsCard
                        title={t('charts.systemActivity')}
                        subtitle={t('charts.systemActivitySubtitle')}
                        icon={<Activity size={14} className="sm:w-[18px] sm:h-[18px]" />}
                        iconWrapperClassName="bg-amber-50 text-amber-600 border-amber-100"
                        className="lg:col-span-12"
                        action={
                            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold border border-slate-200/50">
                                {(['day', 'days', 'week', 'month', '3months', 'year', 'all'] as const).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setSystemPeriod(p)}
                                        className={cn(
                                            "px-2.5 py-1 rounded-md transition-all uppercase text-[9px] cursor-pointer",
                                            systemPeriod === p
                                                ? "bg-white text-amber-600 shadow-xs font-bold"
                                                : "text-slate-500 hover:text-amber-600"
                                        )}
                                    >
                                        {t(`periods.${p}`)}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <AreaChartComponent
                            data={stats?.logsActivity || []}
                            xKey="name"
                            series={[{ key: 'activity', name: ts('logs'), color: '#f59e0b' }]}
                            height={350}
                        />
                    </StatsCard>
                )}
            </div>



            {/* Developer Console Metrics Section */}
            {isDeveloper && stats?.devStats && (
                <motion.div 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="pt-8 border-t border-slate-200/80 space-y-8"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 border border-violet-100 flex items-center justify-center shadow-sm">
                                <Terminal size={20} />
                            </div>
                            <div>
                                <Typography variant="h3" className="text-lg font-bold text-[#002B5B]">
                                    {t('developer.sectionTitle')}
                                </Typography>
                                <Typography variant="p" className="text-xs text-slate-500 font-medium">
                                    {t('developer.sectionDesc')}
                                </Typography>
                            </div>
                        </div>
                    </div>

                    {/* Row 1: Counters and Meters */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* 1. Signup Requests Counter */}
                        <motion.div
                            whileHover={{ y: -4 }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between group hover:shadow-xl hover:border-indigo-200 transition-all duration-300 h-full relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-indigo-50/20 rounded-full blur-2xl group-hover:bg-indigo-50/40 transition-colors" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{t('developer.pendingSignups')}</span>
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                                        <UserPlus size={15} />
                                    </div>
                                </div>
                                <Typography variant="h3" className="text-lg font-semibold text-slate-800">
                                    {t('developer.pendingOf', { pending: stats.devStats.signups.pending, total: stats.devStats.signups.total })}
                                </Typography>
                            </div>
                        </motion.div>

                        {/* 2. Contact Support inbox Counter */}
                        <motion.div
                            whileHover={{ y: -4 }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between group hover:shadow-xl hover:border-emerald-200 transition-all duration-300 h-full relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-emerald-50/20 rounded-full blur-2xl group-hover:bg-emerald-50/40 transition-colors" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{t('developer.pendingContacts')}</span>
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                                        <MessageSquare size={15} />
                                    </div>
                                </div>
                                <Typography variant="h3" className="text-lg font-semibold text-slate-800">
                                    {t('developer.pendingOf', { pending: stats.devStats.contacts.pending, total: stats.devStats.contacts.total })}
                                </Typography>
                            </div>
                        </motion.div>

                        {/* 3. AI Providers Keys Counter */}
                        <motion.div
                            whileHover={{ y: -4 }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between group hover:shadow-xl hover:border-purple-200 transition-all duration-300 h-full relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-purple-50/20 rounded-full blur-2xl group-hover:bg-purple-50/40 transition-colors" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{t('developer.aiKeys')}</span>
                                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                                        <KeyRound size={15} />
                                    </div>
                                </div>
                                <Typography variant="h3" className="text-lg font-semibold text-slate-800">
                                    {t('developer.activeOf', { active: stats.devStats.aiKeys.active, total: stats.devStats.aiKeys.total })}
                                </Typography>
                            </div>
                        </motion.div>

                        {/* 4. Chat Sessions Counter */}
                        <motion.div
                            whileHover={{ y: -4 }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between group hover:shadow-xl hover:border-cyan-200 transition-all duration-300 h-full relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-cyan-50/20 rounded-full blur-2xl group-hover:bg-cyan-50/40 transition-colors" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{t('developer.chatSessions')}</span>
                                    <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-100">
                                        <MessageCircle size={15} />
                                    </div>
                                </div>
                                <Typography variant="h3" className="text-lg font-semibold text-slate-800">
                                    {t('developer.openOf', { open: stats.devStats.chats.open, total: stats.devStats.chats.total })}
                                </Typography>
                            </div>
                        </motion.div>
                    </div>

                    {/* Row 2: Diagnostics and Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* AI Gateway Reliability Rate */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between group hover:shadow-xl hover:border-amber-200 transition-all duration-500 h-full relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-amber-50/30 rounded-full blur-2xl group-hover:bg-amber-50/50 transition-colors duration-500" />
                            <div className="relative z-10 w-full">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                                        {t('developer.aiUsage')}
                                    </span>
                                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                                        <Activity size={16} />
                                    </div>
                                </div>
                                <div className="mt-2 mb-4">
                                    <div className="flex items-baseline gap-2">
                                        <Typography variant="h2" className="text-xl md:text-2xl font-bold leading-none text-slate-800">
                                            {t('developer.successRate', { rate: stats.devStats.aiUsage.successRate })}
                                        </Typography>
                                        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-md border border-red-100 uppercase">
                                            {t('developer.failedRate', { rate: stats.devStats.aiUsage.total > 0 ? 100 - stats.devStats.aiUsage.successRate : 0 })}
                                        </span>
                                    </div>
                                </div>
                                <div className="grow min-h-[160px] mt-2">
                                    {stats.aiUsageTrend && stats.aiUsageTrend.length > 0 ? (
                                        <AreaChartComponent
                                            data={stats.aiUsageTrend}
                                            xKey="name"
                                            series={[
                                                { key: 'success', name: t('developer.success') || 'Success', color: '#22c55e' },
                                                { key: 'failed', name: t('developer.failed') || 'Failed', color: '#ef4444' }
                                            ]}
                                            height={160}
                                        />
                                    ) : stats.devStats.aiUsage.total > 0 ? (
                                        <AreaChartComponent
                                            data={[{
                                                name: '',
                                                success: stats.devStats.aiUsage.success,
                                                failed: stats.devStats.aiUsage.total - stats.devStats.aiUsage.success
                                            }]}
                                            xKey="name"
                                            series={[
                                                { key: 'success', name: t('developer.success') || 'Success', color: '#22c55e' },
                                                { key: 'failed', name: t('developer.failed') || 'Failed', color: '#ef4444' }
                                            ]}
                                            height={160}
                                        />
                                    ) : (
                                        <div className="text-xs text-slate-400 italic py-6 text-center">{tc('notAvailable')}</div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 relative z-10 w-full">
                                <Link href="/ai-tokens">
                                    <Button size="sm" className="w-full justify-between bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-amber-900/10 h-9 px-4">
                                        <span>{t('developer.aiKeys')}</span>
                                        <ChevronRight size={14} className="rtl:rotate-180" />
                                    </Button>
                                </Link>
                            </div>
                        </motion.div>

                        {/* API HTTP Methods Composition */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between group hover:shadow-xl hover:border-blue-200 transition-all duration-500 h-full relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-blue-50/30 rounded-full blur-2xl group-hover:bg-blue-50/50 transition-colors duration-500" />
                            <div className="relative z-10 w-full">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                                        {t('developer.apiMethods')}
                                    </span>
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                        <Database size={16} />
                                    </div>
                                </div>
                                <Typography variant="h3" className="text-sm font-semibold text-slate-800 mb-2">
                                    {t('developer.apiMethodsSubtitle')}
                                </Typography>
                                <div className="grow min-h-[160px] mt-2">
                                    {apiMethodsData.length > 0 ? (
                                        <HorizontalBarChartComponent
                                            data={apiMethodsData}
                                            height={160}
                                        />
                                    ) : (
                                        <div className="text-xs text-slate-400 italic py-6 text-center">{tc('notAvailable')}</div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 relative z-10 w-full">
                                <Link href="/companies/apis">
                                    <Button size="sm" className="w-full justify-between bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-900/10 h-9 px-4">
                                        <span>{t('stats.apis')}</span>
                                        <ChevronRight size={14} className="rtl:rotate-180" />
                                    </Button>
                                </Link>
                            </div>
                        </motion.div>

                        {/* AI Capability Breakdown Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between group hover:shadow-xl hover:border-purple-200 transition-all duration-500 h-full relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-purple-50/30 rounded-full blur-2xl group-hover:bg-purple-50/50 transition-colors duration-500" />
                            <div className="relative z-10 w-full">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                                        {t('developer.aiFeatureUsage')}
                                    </span>
                                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                                        <Sparkles size={16} />
                                    </div>
                                </div>
                                <div className="grow min-h-[160px] mt-2">
                                    {stats?.aiFeatureUsage && stats.aiFeatureUsage.length > 0 ? (
                                        <RadialBarChartComponent
                                            data={stats.aiFeatureUsage.map((f: any) => ({
                                                name: tf.has(f.name) ? tf(f.name) : f.name,
                                                value: f.value
                                            }))}
                                            height={180}
                                            totalLabel={tc.has('total') ? tc('total') : 'Total'}
                                            hideLegend={true}
                                        />
                                    ) : (
                                        <div className="text-xs text-slate-400 italic py-6 text-center">{tc('notAvailable')}</div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 relative z-10 w-full">
                                <Link href="/ai-tokens">
                                    <Button size="sm" className="w-full justify-between bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-purple-900/10 h-9 px-4">
                                        <span>{t('developer.manageKeys')}</span>
                                        <ChevronRight size={14} className="rtl:rotate-180" />
                                    </Button>
                                </Link>
                            </div>
                        </motion.div>
                    </div>

                    {/* Row 2.5: Featured Tenants Carousel */}
                    {stats.topCompanies && stats.topCompanies.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 group hover:shadow-xl hover:border-slate-300 transition-all duration-500 relative overflow-hidden"
                        >
                            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-slate-50/30 rounded-full blur-2xl group-hover:bg-slate-50/50 transition-colors duration-500" />
                            <div className="relative z-10">
                                <CompanyCarousel 
                                    items={stats.topCompanies} 
                                    title={t('developer.topTenants') || 'Top Tenants'}
                                    usersLabel={ts.has('users') ? ts('users') : 'users'}
                                />
                            </div>
                        </motion.div>
                    )}

                    {/* Row 3: Operational Inboxes */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Pending Signups Table Card */}
                        <StatsCard
                            title={t('developer.recentSignups')}
                            subtitle={t('developer.pendingSignups')}
                            icon={<UserPlus size={14} className="sm:w-[18px] sm:h-[18px]" />}
                            iconWrapperClassName="bg-indigo-50 text-indigo-600 border-indigo-100"
                            className="w-full"
                        >
                            <div className="overflow-x-auto w-full">
                                <table className="w-full text-left rtl:text-right border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px]">
                                            <th className="py-2 px-2">{t('developer.sender')}</th>
                                            <th className="py-2 px-2">{t('developer.companyName')}</th>
                                            <th className="py-2 px-2 text-right rtl:text-left">{t('developer.logTime')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats?.recentSignups && stats.recentSignups.length > 0 ? (
                                            stats.recentSignups.map((s, i) => {
                                                const timeStr = new Date(s.created_at).toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'en-US', {
                                                    month: 'short',
                                                    day: 'numeric'
                                                });
                                                return (
                                                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                                        <td className="py-2.5 px-2">
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-slate-700">{s.fullname}</span>
                                                                <span className="text-[9px] text-slate-400 font-medium truncate max-w-[150px]">{s.email}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-2 text-slate-600 font-medium truncate max-w-[120px]">{s.company_name}</td>
                                                        <td className="py-2.5 px-2 text-right rtl:text-left text-slate-400 font-medium whitespace-nowrap">{timeStr}</td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="py-6 text-center text-slate-400 font-medium italic">
                                                    {tc('notAvailable')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <Link href="/signup-requests" className="w-full">
                                    <Button size="sm" className="w-full justify-between bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md h-9 px-4">
                                        <span>{t('developer.approveRequests')}</span>
                                        <ChevronRight size={14} className="rtl:rotate-180" />
                                    </Button>
                                </Link>
                            </div>
                        </StatsCard>

                        {/* Support Messages Table Card */}
                        <StatsCard
                            title={t('developer.recentContacts')}
                            subtitle={t('developer.pendingContacts')}
                            icon={<MessageSquare size={14} className="sm:w-[18px] sm:h-[18px]" />}
                            iconWrapperClassName="bg-emerald-50 text-emerald-600 border-emerald-100"
                            className="w-full"
                        >
                            <div className="overflow-x-auto w-full">
                                <table className="w-full text-left rtl:text-right border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px]">
                                            <th className="py-2 px-2">{t('developer.sender')}</th>
                                            <th className="py-2 px-2">{t('subject')}</th>
                                            <th className="py-2 px-2 text-right rtl:text-left">{t('developer.logTime')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats?.recentContacts && stats.recentContacts.length > 0 ? (
                                            stats.recentContacts.map((c, i) => {
                                                const timeStr = new Date(c.created_at).toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'en-US', {
                                                    month: 'short',
                                                    day: 'numeric'
                                                });
                                                return (
                                                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                                        <td className="py-2.5 px-2">
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-slate-700 truncate max-w-[150px]" title={c.sender_name || ''}>{c.sender_name || tc('visitor')}</span>
                                                                <span className="text-[9px] text-slate-400 font-medium truncate max-w-[150px]">{c.sender_email}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-2 text-slate-600 font-medium truncate max-w-[150px]" title={c.subject}>{c.subject}</td>
                                                        <td className="py-2.5 px-2 text-right rtl:text-left text-slate-400 font-medium whitespace-nowrap">{timeStr}</td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="py-6 text-center text-slate-400 font-medium italic">
                                                    {tc('notAvailable')}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <Link href="/contact-messages" className="w-full">
                                    <Button size="sm" className="w-full justify-between bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md h-9 px-4">
                                        <span>{t('developer.viewMessages')}</span>
                                        <ChevronRight size={14} className="rtl:rotate-180" />
                                    </Button>
                                </Link>
                            </div>
                        </StatsCard>
                    </div>

                    {/* Row 4: System Logs Activity & Logs Audit */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                        {/* System Activity Chart */}
                        <div className="lg:col-span-7 flex flex-col">
                            <StatsCard
                                title={t('charts.systemActivity')}
                                subtitle={t('charts.systemActivitySubtitle')}
                                icon={<Activity size={14} className="sm:w-[18px] sm:h-[18px]" />}
                                iconWrapperClassName="bg-amber-50 text-amber-600 border-amber-100"
                                className="h-full"
                                action={
                                    <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold border border-slate-200/50">
                                        {(['day', 'days', 'week', 'month', '3months', 'year', 'all'] as const).map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setSystemPeriod(p)}
                                                className={cn(
                                                    "px-2.5 py-1 rounded-md transition-all uppercase text-[9px] cursor-pointer",
                                                    systemPeriod === p
                                                        ? "bg-white text-amber-600 shadow-xs font-bold"
                                                        : "text-slate-500 hover:text-amber-600"
                                                )}
                                            >
                                                {t(`periods.${p}`)}
                                            </button>
                                        ))}
                                    </div>
                                }
                            >
                                <AreaChartComponent
                                    data={stats?.logsActivity || []}
                                    xKey="name"
                                    series={[{ key: 'activity', name: ts('logs'), color: '#f59e0b' }]}
                                    height={350}
                                />
                            </StatsCard>
                        </div>

                        {/* Recent System Logs Table */}
                        <div className="lg:col-span-5 flex flex-col">
                            <StatsCard
                                title={t('developer.recentLogs')}
                                subtitle={t('developer.sectionDesc')}
                                icon={<ScrollText size={14} className="sm:w-[18px] sm:h-[18px]" />}
                                iconWrapperClassName="bg-amber-50 text-amber-600 border-amber-100"
                                className="h-full flex flex-col justify-between"
                            >
                                <div className="overflow-x-auto w-full flex-1">
                                    <table className="w-full text-left rtl:text-right border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px]">
                                                <th className="py-2.5 px-3">{t('developer.logActor')}</th>
                                                <th className="py-2.5 px-3">{t('developer.logMessage')}</th>
                                                <th className="py-2.5 px-3">{t('developer.logCompany')}</th>
                                                <th className="py-2.5 px-3 text-right rtl:text-left">{t('developer.logTime')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats?.recentLogs && stats.recentLogs.length > 0 ? (
                                                stats.recentLogs.map((log, i) => {
                                                    const actor = log.user?.fullname || log.user?.username || tc('system');
                                                    const timeStr = new Date(log.timestamp).toLocaleString(locale === 'ar' ? 'ar-TN' : locale === 'fr' ? 'fr-FR' : 'en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    });
                                                    return (
                                                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                                            <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">{actor}</td>
                                                            <td className="py-2 px-3 text-slate-500 font-medium truncate max-w-[120px]" title={log.message}>
                                                                {log.message}
                                                            </td>
                                                            <td className="py-2 px-3">
                                                                {log.company?.name ? (
                                                                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-semibold text-[9px] h-5 rounded-md px-1.5 border-0">
                                                                        {log.company.name}
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-slate-300 italic font-medium">{tm('card.notSpecified')}</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2 px-3 text-right rtl:text-left text-slate-400 font-medium whitespace-nowrap">{timeStr}</td>
                                                        </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="py-6 text-center text-slate-400 font-medium italic">
                                                        {tc('notAvailable')}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </StatsCard>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

function ArrowRight({ className, size = 16 }: { className?: string, size?: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
    );
}
