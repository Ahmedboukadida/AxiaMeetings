import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStaffActor } from '@/lib/authz';
import { getOrSetCache } from '@/lib/redis';

// Helper function to aggregate meetings count by period
function aggregateMeetings(
    period: 'day' | 'days' | 'week' | 'month' | '3months' | 'year' | 'all',
    meetings: any[],
    today: Date
): { name: string; meetings: number }[] {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const todayStr = today.toISOString().split('T')[0];
    
    if (period === 'day') {
        const hourlyMap = new Map<string, number>();
        for (let h = 0; h < 24; h++) {
            const label = `${String(h).padStart(2, '0')}:00`;
            hourlyMap.set(label, 0);
        }
        meetings.forEach(m => {
            if (m.date === todayStr && m.time) {
                const hour = m.time.split(':')[0] || '00';
                const label = `${String(parseInt(hour)).padStart(2, '0')}:00`;
                if (hourlyMap.has(label)) {
                    hourlyMap.set(label, hourlyMap.get(label)! + 1);
                }
            }
        });
        return Array.from(hourlyMap.entries()).map(([name, val]) => ({ name, meetings: val }));
    }
    
    if (period === 'days') {
        const daysMap = new Map<string, { name: string; meetings: number }>();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            daysMap.set(dateStr, { name: label, meetings: 0 });
        }
        meetings.forEach(m => {
            if (m.date && daysMap.has(m.date)) {
                daysMap.get(m.date)!.meetings++;
            }
        });
        return Array.from(daysMap.values());
    }
    
    if (period === 'week') {
        const weeklyData = [];
        for (let w = 3; w >= 0; w--) {
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7) - 6);
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7));
            
            const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const label = `${startLabel} - ${endLabel}`;
            
            let count = 0;
            meetings.forEach(m => {
                if (m.date) {
                    const [y, mm, dd] = m.date.split('-');
                    const mDate = new Date(parseInt(y), parseInt(mm) - 1, parseInt(dd), 0, 0, 0, 0);
                    start.setHours(0, 0, 0, 0);
                    end.setHours(23, 59, 59, 999);
                    if (mDate >= start && mDate <= end) {
                        count++;
                    }
                }
            });
            weeklyData.push({ name: label, meetings: count });
        }
        return weeklyData;
    }
    
    if (period === 'month') {
        const daysMap = new Map<string, { name: string; meetings: number }>();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            daysMap.set(dateStr, { name: label, meetings: 0 });
        }
        meetings.forEach(m => {
            if (m.date && daysMap.has(m.date)) {
                daysMap.get(m.date)!.meetings++;
            }
        });
        return Array.from(daysMap.values());
    }
    
    if (period === '3months') {
        const weeklyData = [];
        for (let w = 11; w >= 0; w--) {
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7) - 6);
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7));
            
            const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const label = `${startLabel} - ${endLabel}`;
            
            let count = 0;
            meetings.forEach(m => {
                if (m.date) {
                    const [y, mm, dd] = m.date.split('-');
                    const mDate = new Date(parseInt(y), parseInt(mm) - 1, parseInt(dd), 0, 0, 0, 0);
                    start.setHours(0, 0, 0, 0);
                    end.setHours(23, 59, 59, 999);
                    if (mDate >= start && mDate <= end) {
                        count++;
                    }
                }
            });
            weeklyData.push({ name: label, meetings: count });
        }
        return weeklyData;
    }
    
    if (period === 'year') {
        const monthlyData = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const yr = d.getFullYear();
            const mon = d.getMonth();
            const label = `${months[mon]} ${yr}`;
            
            let count = 0;
            meetings.forEach(m => {
                if (m.date) {
                    const [my, mm] = m.date.split('-');
                    if (parseInt(my) === yr && parseInt(mm) - 1 === mon) {
                        count++;
                    }
                }
            });
            monthlyData.push({ name: label, meetings: count });
        }
        return monthlyData;
    }
    
    if (period === 'all') {
        const yearsMap = new Map<string, number>();
        let minYear = today.getFullYear() - 4;
        
        meetings.forEach(m => {
            if (m.date) {
                const yr = m.date.split('-')[0];
                if (yr) {
                    const y = parseInt(yr);
                    if (y < minYear) minYear = y;
                }
            }
        });
        
        for (let y = minYear; y <= today.getFullYear(); y++) {
            yearsMap.set(String(y), 0);
        }
        
        meetings.forEach(m => {
            if (m.date) {
                const yr = m.date.split('-')[0];
                if (yr && yearsMap.has(yr)) {
                    yearsMap.set(yr, yearsMap.get(yr)! + 1);
                }
            }
        });
        return Array.from(yearsMap.entries()).map(([name, val]) => ({ name, meetings: val }));
    }
    
    return [];
}

// Helper function to aggregate system activity logs by period
function aggregateLogs(
    period: 'day' | 'days' | 'week' | 'month' | '3months' | 'year' | 'all',
    logs: any[],
    today: Date
): { name: string; activity: number }[] {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const todayStr = today.toISOString().split('T')[0];
    
    if (period === 'day') {
        const hourlyMap = new Map<string, number>();
        for (let h = 0; h < 24; h++) {
            const label = `${String(h).padStart(2, '0')}:00`;
            hourlyMap.set(label, 0);
        }
        logs.forEach(l => {
            const d = new Date(l.timestamp);
            const dStr = d.toISOString().split('T')[0];
            if (dStr === todayStr) {
                const label = `${String(d.getHours()).padStart(2, '0')}:00`;
                if (hourlyMap.has(label)) {
                    hourlyMap.set(label, hourlyMap.get(label)! + 1);
                }
            }
        });
        return Array.from(hourlyMap.entries()).map(([name, val]) => ({ name, activity: val }));
    }
    
    if (period === 'days') {
        const daysMap = new Map<string, { name: string; activity: number }>();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            daysMap.set(dateStr, { name: label, activity: 0 });
        }
        logs.forEach(l => {
            const dateStr = new Date(l.timestamp).toISOString().split('T')[0];
            if (daysMap.has(dateStr)) {
                daysMap.get(dateStr)!.activity++;
            }
        });
        return Array.from(daysMap.values());
    }
    
    if (period === 'week') {
        const weeklyData = [];
        for (let w = 3; w >= 0; w--) {
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7) - 6);
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7));
            
            const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const label = `${startLabel} - ${endLabel}`;
            
            let count = 0;
            logs.forEach(l => {
                const lDate = new Date(l.timestamp);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                if (lDate >= start && lDate <= end) {
                    count++;
                }
            });
            weeklyData.push({ name: label, activity: count });
        }
        return weeklyData;
    }
    
    if (period === 'month') {
        const daysMap = new Map<string, { name: string; activity: number }>();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            daysMap.set(dateStr, { name: label, activity: 0 });
        }
        logs.forEach(l => {
            const dateStr = new Date(l.timestamp).toISOString().split('T')[0];
            if (daysMap.has(dateStr)) {
                daysMap.get(dateStr)!.activity++;
            }
        });
        return Array.from(daysMap.values());
    }
    
    if (period === '3months') {
        const weeklyData = [];
        for (let w = 11; w >= 0; w--) {
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7) - 6);
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7));
            
            const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const label = `${startLabel} - ${endLabel}`;
            
            let count = 0;
            logs.forEach(l => {
                const lDate = new Date(l.timestamp);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                if (lDate >= start && lDate <= end) {
                    count++;
                }
            });
            weeklyData.push({ name: label, activity: count });
        }
        return weeklyData;
    }
    
    if (period === 'year') {
        const monthlyData = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const yr = d.getFullYear();
            const mon = d.getMonth();
            const label = `${months[mon]} ${yr}`;
            
            let count = 0;
            logs.forEach(l => {
                const lDate = new Date(l.timestamp);
                if (lDate.getFullYear() === yr && lDate.getMonth() === mon) {
                    count++;
                }
            });
            monthlyData.push({ name: label, activity: count });
        }
        return monthlyData;
    }
    
    if (period === 'all') {
        const yearsMap = new Map<string, number>();
        let minYear = today.getFullYear() - 4;
        
        logs.forEach(l => {
            const yr = new Date(l.timestamp).getFullYear();
            if (yr < minYear) minYear = yr;
        });
        
        for (let y = minYear; y <= today.getFullYear(); y++) {
            yearsMap.set(String(y), 0);
        }
        
        logs.forEach(l => {
            const yr = String(new Date(l.timestamp).getFullYear());
            if (yearsMap.has(yr)) {
                yearsMap.set(yr, yearsMap.get(yr)! + 1);
            }
        });
        return Array.from(yearsMap.entries()).map(([name, val]) => ({ name, activity: val }));
    }
    
    return [];
}

// Helper function to aggregate AI success and failed requests by period
function aggregateAiUsage(
    period: 'day' | 'days' | 'week' | 'month' | '3months' | 'year' | 'all',
    usage: any[],
    today: Date
): { name: string; success: number; failed: number }[] {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const todayStr = today.toISOString().split('T')[0];
    
    if (period === 'day') {
        const hourlyMap = new Map<string, { success: number; failed: number }>();
        for (let h = 0; h < 24; h++) {
            const label = `${String(h).padStart(2, '0')}:00`;
            hourlyMap.set(label, { success: 0, failed: 0 });
        }
        usage.forEach(u => {
            const d = new Date(u.used_at);
            const dStr = d.toISOString().split('T')[0];
            if (dStr === todayStr) {
                const label = `${String(d.getHours()).padStart(2, '0')}:00`;
                if (hourlyMap.has(label)) {
                    const item = hourlyMap.get(label)!;
                    if (u.success) item.success++;
                    else item.failed++;
                }
            }
        });
        return Array.from(hourlyMap.entries()).map(([name, val]) => ({ name, ...val }));
    }
    
    if (period === 'days') {
        const daysMap = new Map<string, { name: string; success: number; failed: number }>();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            daysMap.set(dateStr, { name: label, success: 0, failed: 0 });
        }
        usage.forEach(u => {
            const dateStr = new Date(u.used_at).toISOString().split('T')[0];
            if (daysMap.has(dateStr)) {
                const item = daysMap.get(dateStr)!;
                if (u.success) item.success++;
                else item.failed++;
            }
        });
        return Array.from(daysMap.values());
    }
    
    if (period === 'week') {
        const weeklyData = [];
        for (let w = 3; w >= 0; w--) {
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7) - 6);
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7));
            
            const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const label = `${startLabel} - ${endLabel}`;
            
            let success = 0;
            let failed = 0;
            usage.forEach(u => {
                const uDate = new Date(u.used_at);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                if (uDate >= start && uDate <= end) {
                    if (u.success) success++;
                    else failed++;
                }
            });
            weeklyData.push({ name: label, success, failed });
        }
        return weeklyData;
    }
    
    if (period === 'month') {
        const daysMap = new Map<string, { name: string; success: number; failed: number }>();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            daysMap.set(dateStr, { name: label, success: 0, failed: 0 });
        }
        usage.forEach(u => {
            const dateStr = new Date(u.used_at).toISOString().split('T')[0];
            if (daysMap.has(dateStr)) {
                const item = daysMap.get(dateStr)!;
                if (u.success) item.success++;
                else item.failed++;
            }
        });
        return Array.from(daysMap.values());
    }
    
    if (period === '3months') {
        const weeklyData = [];
        for (let w = 11; w >= 0; w--) {
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7) - 6);
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (w * 7));
            
            const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const label = `${startLabel} - ${endLabel}`;
            
            let success = 0;
            let failed = 0;
            usage.forEach(u => {
                const uDate = new Date(u.used_at);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                if (uDate >= start && uDate <= end) {
                    if (u.success) success++;
                    else failed++;
                }
            });
            weeklyData.push({ name: label, success, failed });
        }
        return weeklyData;
    }
    
    if (period === 'year') {
        const monthlyData = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const yr = d.getFullYear();
            const mon = d.getMonth();
            const label = `${months[mon]} ${yr}`;
            
            let success = 0;
            let failed = 0;
            usage.forEach(u => {
                const uDate = new Date(u.used_at);
                if (uDate.getFullYear() === yr && uDate.getMonth() === mon) {
                    if (u.success) success++;
                    else failed++;
                }
            });
            monthlyData.push({ name: label, success, failed });
        }
        return monthlyData;
    }
    
    if (period === 'all') {
        const yearsMap = new Map<string, { success: number; failed: number }>();
        let minYear = today.getFullYear() - 4;
        
        usage.forEach(u => {
            const yr = new Date(u.used_at).getFullYear();
            if (yr < minYear) minYear = yr;
        });
        
        for (let y = minYear; y <= today.getFullYear(); y++) {
            yearsMap.set(String(y), { success: 0, failed: 0 });
        }
        
        usage.forEach(u => {
            const yr = String(new Date(u.used_at).getFullYear());
            if (yearsMap.has(yr)) {
                const item = yearsMap.get(yr)!;
                if (u.success) item.success++;
                else item.failed++;
            }
        });
        return Array.from(yearsMap.entries()).map(([name, val]) => ({ name, ...val }));
    }
    
    return [];
}

export async function GET(req: NextRequest) {
    // Role and company re-loaded from the DB (a demoted or moved user loses scope immediately).
    // ADMIN/PARTICIPANT without a company resolve to null here -> 401.
    const user = await getStaffActor(req);
    if (!user) {
        return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { searchParams } = new URL(req.url);
        
        type PeriodType = 'day' | 'days' | 'week' | 'month' | '3months' | 'year' | 'all';
        const volumePeriod = (searchParams.get('volumePeriod') || 'month') as PeriodType;
        const systemPeriod = (searchParams.get('systemPeriod') || 'days') as PeriodType;

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const today = new Date();
        
        let logsLimitDate: Date | undefined = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0, 0); // default days (last 7 days)
        if (systemPeriod === 'day') {
            logsLimitDate = startOfToday;
        } else if (systemPeriod === 'days') {
            logsLimitDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0, 0);
        } else if (systemPeriod === 'week') {
            logsLimitDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27, 0, 0, 0, 0);
        } else if (systemPeriod === 'month') {
            logsLimitDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29, 0, 0, 0, 0);
        } else if (systemPeriod === '3months') {
            logsLimitDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89, 0, 0, 0, 0);
        } else if (systemPeriod === 'year') {
            logsLimitDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate(), 0, 0, 0, 0);
        } else if (systemPeriod === 'all') {
            logsLimitDate = undefined;
        }

        if (user.role === 'DEVELOPER') {
            const whereClause: any = {};

            // All queries are independent: run them in ONE wave (they used to run
            // in six sequential waves). The pg pool caps real concurrency.
            const [
                [companies, meetings, users, apis, admins, logs],
                meetingsRows,
                [usersData, apiData, logsData],
                recentMeetings,
                [
                    companiesWithUsers,
                    totalSignups, pendingSignups,
                    totalContacts, pendingContacts,
                    totalKeys, activeKeys,
                    totalAIUsage, successAIUsage,
                    totalChats, openChats,
                    fetchedRecentLogs,
                    fetchedRecentSignups,
                    fetchedRecentContacts,
                    tokenUsageGrouped,
                    aiWorkersCount,
                    aiUsageData
                ]
            ] = await Promise.all([
                Promise.all([
                    prisma.companies.count(),
                    prisma.meetings.count(),
                    prisma.users.count(),
                    prisma.companies_apis.count(),
                    prisma.users.count({ where: { role: 'ADMIN' } }),
                    prisma.logs.count(),
                ]),
                // One scan of meetings feeds the stats, the trend AND the calendar
                // (the calendar used to re-read the whole table).
                prisma.meetings.findMany({
                    where: whereClause,
                    select: {
                        id: true, subject: true, status: true, type: true, date: true, time: true, mode: true,
                        company: { select: { name: true } }
                    }
                }),
                Promise.all([
                    prisma.users.findMany({
                        where: whereClause,
                        select: { role: true }
                    }),
                    prisma.companies_apis.findMany({
                        where: {},
                        select: { method: true }
                    }),
                    prisma.logs.findMany({
                        where: {
                            ...whereClause,
                            timestamp: logsLimitDate ? { gte: logsLimitDate } : undefined
                        },
                        select: { timestamp: true }
                    })
                ]),
                // Fetch recent meetings for all roles (scoped accordingly)
                prisma.meetings.findMany({
                    where: whereClause,
                    orderBy: [
                        { date: 'desc' },
                        { time: 'desc' }
                    ],
                    take: 5,
                    select: {
                        id: true,
                        subject: true,
                        date: true,
                        time: true,
                        type: true,
                        status: true,
                        company: { select: { name: true } }
                    }
                }),
                Promise.all([
                    prisma.companies.findMany({
                        include: { _count: { select: { users: true } } },
                        orderBy: { users: { _count: 'desc' } }
                    }),
                    prisma.signup_requests.count(),
                    prisma.signup_requests.count({ where: { status: 'PENDING' } }),
                    prisma.contact_messages.count(),
                    prisma.contact_messages.count({ where: { reply_content: null } }),
                    prisma.ia_tokens_keys.count(),
                    prisma.ia_tokens_keys.count({ where: { is_active: true } }),
                    prisma.ia_token_usage.count(),
                    prisma.ia_token_usage.count({ where: { success: true } }),
                    prisma.chat_sessions.count(),
                    prisma.chat_sessions.count({ where: { is_closed: false } }),
                    prisma.logs.findMany({
                        orderBy: { timestamp: 'desc' },
                        take: 5,
                        include: {
                            user: { select: { fullname: true, username: true } },
                            company: { select: { name: true } }
                        }
                    }),
                    prisma.signup_requests.findMany({
                        where: { status: 'PENDING' },
                        orderBy: { created_at: 'desc' },
                        take: 3,
                        select: { id: true, fullname: true, email: true, company_name: true, pack_id: true, created_at: true }
                    }),
                    prisma.contact_messages.findMany({
                        where: { reply_content: null },
                        orderBy: { created_at: 'desc' },
                        take: 3,
                        select: { id: true, sender_name: true, sender_email: true, subject: true, created_at: true }
                    }),
                    prisma.ia_token_usage.groupBy({
                        by: ['feature'],
                        _count: { id: true }
                    }),
                    prisma.ia_tokens_keys.count({
                        where: {
                            usage: {
                                some: {
                                    used_at: {
                                        gte: startOfToday
                                    }
                                }
                            }
                        }
                    }),
                    prisma.ia_token_usage.findMany({
                        where: {
                            used_at: logsLimitDate ? { gte: logsLimitDate } : undefined
                        },
                        select: { used_at: true, success: true }
                    })
                ])
            ]);

            const meetingsData = meetingsRows.map(m => ({ status: m.status, type: m.type, date: m.date, time: m.time, mode: m.mode }));
            const calendarMeetings = meetingsRows.map(m => ({
                id: m.id, subject: m.subject, date: m.date, time: m.time, status: m.status, company: m.company
            }));

            const meetingsByStatus: Record<string, number> = { SCHEDULED: 0, STARTED: 0, FINISHED: 0, CANCELLED: 0 };
            const meetingsByType: Record<string, number> = { ORDINAIRE: 0, EXTRAORDINAIRE: 0, COMPLEMENTAIRE: 0, DELEGUES: 0 };

            meetingsData.forEach((m: any) => {
                if (meetingsByStatus[m.status] !== undefined) meetingsByStatus[m.status]++;
                if (meetingsByType[m.type] !== undefined) meetingsByType[m.type]++;
            });

            // Dynamic Trend Data (Volume Analysis)
            const trendData = aggregateMeetings(volumePeriod, meetingsData, today);

            // Group Users by Role
            const usersByRole: Record<string, number> = { ADMIN: 0, PARTICIPANT: 0, DEVELOPER: 0 };
            usersData.forEach(u => {
                const role = u.role || 'PARTICIPANT';
                if (usersByRole[role] !== undefined) usersByRole[role]++;
            });

            // Group APIs by Method
            const apisByMethod: Record<string, number> = { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 };
            apiData.forEach(a => {
                const method = a.method?.toUpperCase() || 'GET';
                if (apisByMethod[method] !== undefined) apisByMethod[method]++;
                else apisByMethod[method] = 1;
            });

            // Dynamic Logs Activity (System Activity)
            const logsActivity = aggregateLogs(systemPeriod, logsData, today);

            // For Developers: Top Companies by Users & diagnostics
            let topCompanies: any[] = [];
            let devStats: any = null;
            let recentLogs: any[] = [];
            let recentSignups: any[] = [];
            let recentContacts: any[] = [];
            let aiFeatureUsage: any[] = [];

            topCompanies = companiesWithUsers.map(c => ({
                id: c.id,
                name: c.name,
                logo_url: c.logo_url,
                url: c.url,
                users: c._count.users
            }));

            devStats = {
                signups: { total: totalSignups, pending: pendingSignups },
                contacts: { total: totalContacts, pending: pendingContacts },
                aiKeys: { total: totalKeys, active: activeKeys },
                aiUsage: { total: totalAIUsage, success: successAIUsage, successRate: totalAIUsage > 0 ? Math.round((successAIUsage / totalAIUsage) * 100) : 100 },
                chats: { total: totalChats, open: openChats }
            };

            recentLogs = fetchedRecentLogs;
            recentSignups = fetchedRecentSignups;
            recentContacts = fetchedRecentContacts;
            aiFeatureUsage = tokenUsageGrouped.map((g: any) => ({
                name: g.feature,
                value: g._count.id
            }));

            const aiUsageTrend = aggregateAiUsage(systemPeriod, aiUsageData, today);
            const meetingDates = meetingsData.map((m: any) => m.date).filter(Boolean);

            return NextResponse.json({ 
                status: true, 
                data: { 
                    companies, meetings, users, apis, admins, logs,
                    aiWorkers: aiWorkersCount,
                    meetingsByStatus, meetingsByType, trendData,
                    usersByRole, apisByMethod, logsActivity, topCompanies,
                    meetingDates,
                    devStats,
                    recentMeetings,
                    calendarMeetings,
                    recentLogs,
                    recentSignups,
                    recentContacts,
                    aiFeatureUsage,
                    aiUsageTrend
                } 
            });
        } else {
            if (!user.companyId) {
                return NextResponse.json({ status: false, message: 'No company assigned' }, { status: 400 });
            }
            const companyId = user.companyId;
            // ADMIN: whole company. PARTICIPANT: only the meetings of his company he is invited to,
            // and no company-wide user/API/log figures.
            const isAdmin = user.role === 'ADMIN';
            const participantEmail = user.email;
            if (!isAdmin && !participantEmail) {
                return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
            }
            const cacheKey = isAdmin
                ? `overview:company:${companyId}:vp:${volumePeriod}:sp:${systemPeriod}`
                : `overview:participant:${user.userId}:vp:${volumePeriod}:sp:${systemPeriod}`;
            
            const cachedData = await getOrSetCache(cacheKey, 60, async () => {
                const whereClause = { company_id: companyId };
                const meetingsWhere = isAdmin
                    ? whereClause
                    : { company_id: companyId, meetings_participants: { some: { email: participantEmail as string } } };
                const zero = Promise.resolve(0);
                
                const [
                    [meetings, users, apis, admins, logs],
                    meetingsRows,
                    [usersData, apiData, logsData],
                    recentMeetings,
                    aiWorkersCount
                ] = await Promise.all([
                    Promise.all([
                        prisma.meetings.count({ where: meetingsWhere }),
                        isAdmin ? prisma.users.count({ where: whereClause }) : zero,
                        isAdmin ? prisma.companies_apis.count({ where: whereClause }) : zero,
                        isAdmin ? prisma.users.count({ where: { ...whereClause, role: 'ADMIN' } }) : zero,
                        isAdmin ? prisma.logs.count({ where: whereClause }) : zero,
                    ]),
                    // One scan feeds the stats, the trend AND the calendar.
                    prisma.meetings.findMany({
                        where: meetingsWhere,
                        select: {
                            id: true, subject: true, status: true, type: true, date: true, time: true, mode: true,
                            company: { select: { name: true } }
                        }
                    }),
                    Promise.all([
                        isAdmin
                            ? prisma.users.findMany({ where: whereClause, select: { role: true } })
                            : Promise.resolve([] as { role: string | null }[]),
                        isAdmin
                            ? prisma.companies_apis.findMany({ where: { company_id: companyId }, select: { method: true } })
                            : Promise.resolve([] as { method: string | null }[]),
                        isAdmin
                            ? prisma.logs.findMany({
                                where: {
                                    ...whereClause,
                                    timestamp: logsLimitDate ? { gte: logsLimitDate } : undefined
                                },
                                select: { timestamp: true }
                            })
                            : Promise.resolve([] as { timestamp: Date }[]),
                    ]),
                    prisma.meetings.findMany({
                        where: meetingsWhere,
                        orderBy: [
                            { date: 'desc' },
                            { time: 'desc' }
                        ],
                        take: 5,
                        select: {
                            id: true,
                            subject: true,
                            date: true,
                            time: true,
                            type: true,
                            status: true,
                            company: { select: { name: true } }
                        }
                    }),
                    prisma.ia_tokens_keys.count({
                        where: {
                            usage: {
                                some: {
                                    used_at: {
                                        gte: startOfToday
                                    }
                                }
                            }
                        }
                    })
                ]);

                const companies = 1;

                const meetingsData = meetingsRows.map(m => ({ status: m.status, type: m.type, date: m.date, time: m.time, mode: m.mode }));
                const calendarMeetings = meetingsRows.map(m => ({
                    id: m.id, subject: m.subject, date: m.date, time: m.time, status: m.status, company: m.company
                }));

                const meetingsByStatus: Record<string, number> = { SCHEDULED: 0, STARTED: 0, FINISHED: 0, CANCELLED: 0 };
                const meetingsByType: Record<string, number> = { ORDINAIRE: 0, EXTRAORDINAIRE: 0, COMPLEMENTAIRE: 0, DELEGUES: 0 };

                meetingsData.forEach((m: any) => {
                    if (meetingsByStatus[m.status] !== undefined) meetingsByStatus[m.status]++;
                    if (meetingsByType[m.type] !== undefined) meetingsByType[m.type]++;
                });

                // Dynamic Trend Data (Volume Analysis)
                const trendData = aggregateMeetings(volumePeriod, meetingsData, today);

                const usersByRole: Record<string, number> = { ADMIN: 0, PARTICIPANT: 0, DEVELOPER: 0 };
                usersData.forEach(u => {
                    const role = u.role || 'PARTICIPANT';
                    if (usersByRole[role] !== undefined) usersByRole[role]++;
                });

                const apisByMethod: Record<string, number> = { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 };
                apiData.forEach(a => {
                    const method = a.method?.toUpperCase() || 'GET';
                    if (apisByMethod[method] !== undefined) apisByMethod[method]++;
                    else apisByMethod[method] = 1;
                });

                // Dynamic Logs Activity (System Activity)
                const logsActivity = aggregateLogs(systemPeriod, logsData, today);
                const meetingDates = meetingsData.map((m: any) => m.date).filter(Boolean);

                return {
                    companies, meetings, users, apis, admins, logs,
                    aiWorkers: aiWorkersCount,
                    meetingsByStatus, meetingsByType, trendData,
                    usersByRole, apisByMethod, logsActivity, topCompanies: [],
                    meetingDates,
                    devStats: null,
                    recentMeetings,
                    calendarMeetings,
                    recentLogs: [],
                    recentSignups: [],
                    recentContacts: [],
                    aiFeatureUsage: [],
                    aiUsageTrend: []
                };
            });

            return NextResponse.json({
                status: true,
                data: cachedData
            });
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
