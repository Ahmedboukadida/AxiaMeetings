import { NextRequest, NextResponse } from 'next/server';
import { isWithinDurationLimit } from '@/lib/durations';
import { prisma } from '@/lib/prisma';
import { requireUser, requireRole, httpErrorResponse } from '@/lib/authz';
import { PARTICIPANT_PUBLIC_SELECT, redactSecrets } from '@/lib/safe-select';
import type { Prisma } from '@prisma/client';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';
import { createLog } from '@/lib/logger';
import { dispatchMeetingPush } from '@/lib/push';
import crypto from 'crypto';
import { isSafeDocumentUrl } from '@/lib/safe-url';
import { MeetingType, MeetingMode, MeetingDuration, MeetingIsOnline, MeetingPointTypes } from '@/lib/enums/meetings';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings`
 * - Model: `companies`
 * RELATIONS INCLUDED: 
 * company: { select: { id: true, name: true, logo_url: true | meetings_participants: true, meetings_points: true, meetings_documents: true, company: { select: { id: true, name: true

 * AI AGENT DATA ACCESS & ROLE RULES:
 * 1. UNAUTHENTICATED: Only provide general AxiaMeetings info (total companies, users, references, guides).
 * 2. ADMIN: Restrict all answers to data where companyId matches the admin's company. They can query specific meetings, users, etc., within their company.
 * 3. PARTICIPANT (Token): Restrict all answers strictly to the single meeting associated with their token.
 * 4. DEVELOPER: Full access to all data.
 * 
 * INSTRUCTIONS FOR AI:
 * - Read `prisma/schema.prisma` first to understand the exact fields and relations available for the models listed above.
 * - Call this GET endpoint to fetch the JSON data.
 * - Parse the JSON, filter it according to the ROLE RULES above, and return the exact properties the user asked for.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await requireUser(req);
        // DEVELOPER: all; ADMIN: own company; PARTICIPANT: meetings of his company he is invited to.
        // A PARTICIPANT without an email matches nothing (an undefined email would otherwise match every meeting).
        const whereClause: Prisma.meetingsWhereInput = user.role === 'DEVELOPER' ? {}
            : user.role === 'ADMIN' ? { company_id: user.companyId ?? -1 }
            : user.email ? { company_id: user.companyId ?? -1, meetings_participants: { some: { email: user.email } } }
            : { company_id: -1 };

        const meetings = await prisma.meetings.findMany({
            where: whereClause,
            include: {
                company: { select: { id: true, name: true, logo_url: true } },
                meetings_participants: { select: { id: true, email: true } },
                meetings_points: { select: { id: true, point: true, type: true, description: true } },
                meetings_attendances: { select: { id: true, meetings_attendances_status: true } },
                meetings_documents: true,
                _count: { select: { meetings_documents: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        return NextResponse.json({ status: true, data: meetings });
    } catch (error) {
        const r = httpErrorResponse(error);
        if (r) return r;
        console.error('Error fetching meetings:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

const MEETING_TYPES = Object.values(MeetingType) as string[];
const MEETING_MODES = Object.values(MeetingMode) as string[];
const MEETING_DURATIONS = Object.values(MeetingDuration) as string[];
const MEETING_ISONLINE = Object.values(MeetingIsOnline) as string[];
const MEETING_POINT_TYPES = Object.values(MeetingPointTypes) as string[];

const badRequest = (message: string) => NextResponse.json({ status: false, message }, { status: 400 });

/** Returns an error message when `value` is set but not one of `allowed`, otherwise null. */
function invalidEnum(field: string, value: unknown, allowed: string[]): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string' && allowed.includes(value)) return null;
    return `Invalid ${field} "${String(value)}". Allowed values: ${allowed.join(', ')}.`;
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export async function POST(req: NextRequest) {
    let user;
    try {
        user = await requireRole(req, 'DEVELOPER', 'ADMIN');
    } catch (error) {
        const r = httpErrorResponse(error);
        if (r) return r;
        console.error('Error checking meeting creator:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return badRequest('Invalid JSON body.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return badRequest('Invalid request body.');
    }

    try {
        const { subject, type, date, time, mode, location, duration, description, isonline, company_id, points, participants, documents } = body;

        if (!isNonEmptyString(subject) || !isNonEmptyString(date) || !isNonEmptyString(time)) {
            return badRequest('Subject, date and time are required');
        }

        // Enum validation (would otherwise surface as a Prisma validation error -> 500)
        const enumError =
            invalidEnum('type', type, MEETING_TYPES) ||
            invalidEnum('mode', mode, MEETING_MODES) ||
            invalidEnum('duration', duration, MEETING_DURATIONS) ||
            invalidEnum('isonline', isonline, MEETING_ISONLINE);
        if (enumError) return badRequest(enumError);

        // Resolve the target company: ADMIN is pinned to their own company, DEVELOPER must pick an existing one.
        let targetCompanyId: number;
        if (user.role === 'ADMIN') {
            if (!user.companyId) {
                return NextResponse.json({ status: false, message: 'Your account is not linked to a company; you cannot create meetings.' }, { status: 403 });
            }
            targetCompanyId = user.companyId;
        } else {
            const requested = Number(company_id);
            if (!Number.isInteger(requested) || requested <= 0) {
                return badRequest('Please select a company for this meeting.');
            }
            targetCompanyId = requested;
        }

        const company = await prisma.companies.findUnique({
            where: { id: targetCompanyId },
            select: { id: true, meeting_time_limit: true }
        });
        if (!company) {
            return user.role === 'ADMIN'
                ? NextResponse.json({ status: false, message: 'Your company no longer exists.' }, { status: 403 })
                : badRequest('Please select a company for this meeting.');
        }

        // Points: array of { point: non-empty string, type?, description? }; empty points are skipped.
        if (points !== undefined && points !== null && !Array.isArray(points)) {
            return badRequest('points must be an array.');
        }
        const cleanPoints: { point: string; description: string | null; type: 'SIMPLE' | 'VOTE' }[] = [];
        for (const p of (points ?? []) as any[]) {
            if (!p || typeof p !== 'object' || (p.point !== undefined && p.point !== null && typeof p.point !== 'string')) {
                return badRequest('Each agenda point must be an object with a "point" text.');
            }
            if (!isNonEmptyString(p.point)) continue;
            const isVoteTag = /^\[VOTE\]/i.test(p.point);
            const pointType: string = isVoteTag ? 'VOTE' : (p.type || 'SIMPLE');
            const pointTypeError = invalidEnum('point type', pointType, MEETING_POINT_TYPES);
            if (pointTypeError) return badRequest(pointTypeError);
            const text = p.point.replace(/^\[VOTE\]\s*/i, '').trim();
            if (!text) continue;
            cleanPoints.push({
                point: text,
                description: typeof p.description === 'string' && p.description ? p.description : null,
                type: pointType as 'SIMPLE' | 'VOTE',
            });
        }

        // Participants: array of non-empty email strings.
        if (participants !== undefined && participants !== null && !Array.isArray(participants)) {
            return badRequest('participants must be an array of emails.');
        }
        const cleanParticipants: string[] = [];
        for (const e of (participants ?? []) as any[]) {
            if (typeof e !== 'string') return badRequest('participants must be an array of emails.');
            if (e.trim()) cleanParticipants.push(e.trim());
        }

        // Documents: array of { file_title, file_path } non-empty strings.
        if (documents !== undefined && documents !== null && !Array.isArray(documents)) {
            return badRequest('documents must be an array.');
        }
        const cleanDocuments: { file_title: string; file_path: string }[] = [];
        for (const d of (documents ?? []) as any[]) {
            if (!d || typeof d !== 'object' || !isNonEmptyString(d.file_title) || !isNonEmptyString(d.file_path)) {
                return badRequest('Each document must have a non-empty file_title and file_path.');
            }
            if (!isSafeDocumentUrl(d.file_path)) {
                return badRequest(`Document "${d.file_title.trim()}" must be an uploaded file or an https:// link.`);
            }
            cleanDocuments.push({ file_title: d.file_title, file_path: d.file_path.trim() });
        }

        // Enforce meeting date is not in the past
        const meetingDateTime = new Date(`${date}T${time}`);
        if (Number.isNaN(meetingDateTime.getTime())) {
            return badRequest('Invalid date or time format.');
        }
        if (meetingDateTime < new Date()) {
            return NextResponse.json({ status: false, message: 'La date et l\'heure de la réunion ne peuvent pas être dans le passé.' }, { status: 400 });
        }

        // Enforce meeting time limit
        if (duration && company.meeting_time_limit) {
            if (!isWithinDurationLimit(duration, company.meeting_time_limit)) {
                return NextResponse.json({
                    status: false,
                    message: `Meeting duration exceeds your company limit (${company.meeting_time_limit.replace('_', ' ')}).`
                }, { status: 403 });
            }
        }

        let meeting;
        try {
            meeting = await prisma.meetings.create({
                data: {
                    subject, type: type || 'ORDINAIRE', date, time,
                    mode: mode || 'IN_PERSON', location: location || '', duration: duration || 'ONE_HOUR',
                    description: description || '', isonline: isonline || 'FALSE',
                    status: 'SCHEDULED', creator_id: user.userId, editor_id: user.userId,
                    company_id: targetCompanyId,
                    meetings_points: cleanPoints.length ? { create: cleanPoints } : undefined,
                    meetings_participants: cleanParticipants.length ? {
                        create: cleanParticipants.map((email) => ({
                            email, token: crypto.randomUUID(),
                        })),
                    } : undefined,
                    meetings_documents: cleanDocuments.length ? { create: cleanDocuments } : undefined,
                },
                include: {
                    // Never return participant join tokens.
                    meetings_participants: { select: PARTICIPANT_PUBLIC_SELECT },
                    meetings_points: true,
                    meetings_documents: true,
                    company: { select: { id: true, name: true } },
                },
            });
        } catch (error: any) {
            const code: string | undefined = typeof error?.code === 'string' ? error.code : undefined;
            if (code === 'P2003') {
                console.warn('[meetings.POST] FK violation (P2003):', error?.meta);
                return badRequest('The selected company or user does not exist. Please select a valid company.');
            }
            if (code === 'P2002') {
                console.warn('[meetings.POST] Unique constraint violation (P2002):', error?.meta);
                return badRequest('A meeting with these details already exists.');
            }
            throw error;
        }

        // Dispatch push notifications to external apps & emails (not awaited; never let it become an unhandled rejection)
        const adminLocale = req.cookies.get('NEXT_LOCALE')?.value || 'fr';
        dispatchMeetingPush({
            companyId: targetCompanyId,
            meetingId: meeting.id,
            action: 'CREATE',
            adminLocale
        }).catch((err) => console.error('[meetings.POST] dispatchMeetingPush failed:', err));

        await createLog({
            message: `Meeting created: ${meeting.subject}`,
            userId: user.userId,
            companyId: targetCompanyId,
            payload: redactSecrets(body),
            response: meeting
        });

        return NextResponse.json({ status: true, data: meeting }, { status: 201 });
    } catch (error: any) {
        console.error(`Error creating meeting (prisma code: ${error?.code ?? 'n/a'}):`, error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
