import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMeetingActor, assertMeetingAccess, isMeetingStaff, httpErrorResponse, toPositiveInt } from '@/lib/authz';
import { PARTICIPANT_PUBLIC_SELECT, COMPANY_PUBLIC_SELECT } from '@/lib/safe-select';
import { verifyPvToken } from '@/lib/pv-link';
import { sanitizeHtml } from '@/lib/html';
import { readLocalAsset, keyFromUrl, uploadUrl } from '@/lib/storage';

const PV_TITLE_PREFIXES = ['PV Word —', 'PV IA —'];
const isPvDocument = (title: string) => PV_TITLE_PREFIXES.some((p) => title.startsWith(p));
const isHtmlPath = (filePath: string) => /\.html?$/i.test(filePath.split(/[?#]/, 1)[0]);

/** Only same-origin stored files or https URLs are handed to the browser. */
function safeDocumentUrl(filePath: string): string | null {
    const v = String(filePath || '').trim();
    const key = keyFromUrl(v); // /api/files/<key> or legacy /uploads/<key>
    if (key) {
        try { return uploadUrl(key); } catch { return null; }
    }
    if (v.startsWith('/')) return null;
    try {
        return new URL(v).protocol === 'https:' ? v : null;
    } catch {
        return null;
    }
}

/**
 * GET /api/meetings/[id]/pv?t=<pvToken> — public PV view for a participant (link sent by email).
 * 401 INVALID_LINK (bad/expired token), 403 INVALID_LINK (other meeting / participant removed),
 * 403 NOT_FINISHED (meeting not finished yet; basic meeting header included).
 */
async function getPvByLink(meetingId: number, rawToken: string) {
    const claims = verifyPvToken(rawToken);
    if (!claims) {
        return NextResponse.json({ status: false, code: 'INVALID_LINK', message: 'Invalid or expired link' }, { status: 401 });
    }
    if (claims.meetingId !== meetingId) {
        return NextResponse.json({ status: false, code: 'INVALID_LINK', message: 'Invalid link' }, { status: 403 });
    }
    const participant = await prisma.meetings_participants.findFirst({
        where: { id: claims.participantId, meeting_id: meetingId, email: claims.email },
        select: { id: true, email: true },
    });
    if (!participant) {
        return NextResponse.json({ status: false, code: 'INVALID_LINK', message: 'Invalid link' }, { status: 403 });
    }

    const meeting = await prisma.meetings.findUnique({
        where: { id: meetingId },
        select: {
            id: true, subject: true, type: true, date: true, time: true, mode: true, location: true,
            duration: true, description: true, status: true,
            company: { select: COMPANY_PUBLIC_SELECT },
        },
    });
    if (!meeting) return NextResponse.json({ status: false, code: 'INVALID_LINK', message: 'Meeting not found' }, { status: 404 });

    const header = {
        id: meeting.id, subject: meeting.subject, date: meeting.date, time: meeting.time, status: meeting.status,
        company: meeting.company ? { name: meeting.company.name, logo_url: meeting.company.logo_url } : null,
    };
    if (meeting.status !== 'FINISHED') {
        return NextResponse.json({ status: false, code: 'NOT_FINISHED', message: 'The meeting has not ended yet', meeting: header }, { status: 403 });
    }

    const [points, participants, attendances, documents] = await Promise.all([
        prisma.meetings_points.findMany({
            where: { meeting_id: meetingId },
            orderBy: { id: 'asc' },
            include: { meetings_votes: { select: { vote: true } } },
        }),
        prisma.meetings_participants.findMany({ where: { meeting_id: meetingId }, select: { id: true, email: true }, orderBy: { id: 'asc' } }),
        prisma.meetings_attendances.findMany({ where: { meeting_id: meetingId }, select: { meetings_participant_id: true, meetings_attendances_status: true } }),
        prisma.meetings_documents.findMany({ where: { meeting_id: meetingId }, orderBy: { id: 'desc' }, select: { id: true, file_title: true, file_path: true } }),
    ]);

    // Invitee view: tallies only, never who voted what.
    const meetings_points = points.map((p) => {
        const { meetings_votes, ...rest } = p;
        return {
            ...rest,
            vote_tally: {
                OUI: meetings_votes.filter((v) => v.vote === 'OUI').length,
                NON: meetings_votes.filter((v) => v.vote === 'NON').length,
                NEUTRE: meetings_votes.filter((v) => v.vote === 'NEUTRE').length,
                total: meetings_votes.length,
            },
        };
    });

    const statusByParticipant = new Map(attendances.map((a) => [a.meetings_participant_id, a.meetings_attendances_status]));
    const attendance = participants.map((p) => ({ email: p.email, status: statusByParticipant.get(p.id) ?? 'ABSENT' }));

    const pv_documents = documents
        .filter((d) => isPvDocument(d.file_title))
        .map((d, order) => ({ id: d.id, title: d.file_title, file_path: safeDocumentUrl(d.file_path), order, is_html: isHtmlPath(d.file_path) }))
        .filter((d): d is typeof d & { file_path: string } => d.file_path !== null);

    // Latest HTML PV (AI PV), re-sanitized on the way out (older files were stored unsanitized).
    let pv_html: string | null = null;
    const latestHtml = pv_documents.find((d) => d.is_html && d.file_path.startsWith('/'));
    if (latestHtml) {
        const buf = await readLocalAsset(latestHtml.file_path).catch(() => null);
        if (buf) pv_html = sanitizeHtml(buf.toString('utf8')) || null;
    }

    return NextResponse.json({
        status: true,
        data: {
            ...meeting,
            company: header.company,
            viewer: { email: participant.email },
            meetings_points,
            attendance,
            pv_documents,
            pv_html,
        },
    });
}

// GET: fetch full meeting data for PV generation
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]/pv
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]/pv`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings_participants`
 * - Model: `meetings`
 * RELATIONS INCLUDED: 
 * company: true, meetings_points: { include: { meetings_votes: { include: { meetings_participant: { select: { email: true | meetings_participant: { select: { email: true

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
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const meetingId = toPositiveInt(id);
        if (!meetingId) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        // Public PV link (?t=<pvToken>) sent by email after PV generation.
        const pvToken = new URL(req.url).searchParams.get('t');
        if (pvToken) return await getPvByLink(meetingId, pvToken);

        // Logged-in user, or invitee via ?token=&email= (or x-participant-* headers).
        const actor = await requireMeetingActor(req, meetingId);
        const scope = await assertMeetingAccess(actor, meetingId, 'read');
        const staff = isMeetingStaff(actor, scope);

        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                company: { select: COMPANY_PUBLIC_SELECT },
                meetings_points: {
                    include: {
                        meetings_votes: {
                            select: {
                                id: true,
                                point_id: true,
                                vote: true,
                                meetings_participant_id: true,
                                meetings_participant: { select: { email: true } },
                            },
                        },
                    },
                },
                meetings_documents: true,
                // Never return participant join tokens.
                meetings_participants: { select: PARTICIPANT_PUBLIC_SELECT },
                meetings_attendances: {
                    include: { meetings_participant: { select: { email: true } } },
                },
            },
        });

        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        // Staff of the meeting see who voted what; invitees and PARTICIPANT users only get the tallies per point.
        const data = {
            ...meeting,
            meetings_points: meeting.meetings_points.map((point) => {
                const { meetings_votes, ...rest } = point;
                const vote_tally = {
                    OUI: meetings_votes.filter((v) => v.vote === 'OUI').length,
                    NON: meetings_votes.filter((v) => v.vote === 'NON').length,
                    NEUTRE: meetings_votes.filter((v) => v.vote === 'NEUTRE').length,
                    total: meetings_votes.length,
                };
                return staff ? { ...rest, meetings_votes, vote_tally } : { ...rest, vote_tally };
            }),
        };

        return NextResponse.json({ status: true, data });
    } catch (error) {
        const r = httpErrorResponse(error);
        if (r) return r;
        console.error('Error fetching PV data:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
