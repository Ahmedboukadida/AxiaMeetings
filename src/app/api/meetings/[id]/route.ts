import { NextRequest, NextResponse } from 'next/server';
import { isWithinDurationLimit } from '@/lib/durations';
import { prisma } from '@/lib/prisma';
import { requireUser, assertMeetingAccess, isMeetingStaff, httpErrorResponse, toPositiveInt, HttpError } from '@/lib/authz';
import { PARTICIPANT_PUBLIC_SELECT, COMPANY_PUBLIC_SELECT, redactSecrets } from '@/lib/safe-select';
import { createLog } from '@/lib/logger';
import { dispatchMeetingPush } from '@/lib/push';
import { isSafeDocumentUrl } from '@/lib/safe-url';
import { sanitizeHtml } from '@/lib/html';

type CleanPoint = { point: string; description: string | null; type: 'SIMPLE' | 'VOTE' };
type CleanDocument = { file_title: string; file_path: string };

/** PUT agenda points: array of { point, description?, type? }; empty points skipped; type SIMPLE|VOTE. */
function parsePoints(value: unknown): CleanPoint[] | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) throw new HttpError(400, 'points must be an array.');
    const out: CleanPoint[] = [];
    for (const p of value) {
        if (!p || typeof p !== 'object') throw new HttpError(400, 'Each agenda point must be an object with a "point" text.');
        const { point, description, type } = p as Record<string, unknown>;
        if (point !== undefined && point !== null && typeof point !== 'string') {
            throw new HttpError(400, 'Each agenda point must be an object with a "point" text.');
        }
        if (typeof point !== 'string' || !point.trim()) continue;
        const pointType = type === undefined || type === null || type === '' ? 'SIMPLE' : type;
        if (pointType !== 'SIMPLE' && pointType !== 'VOTE') throw new HttpError(400, 'point type must be SIMPLE or VOTE.');
        out.push({
            point: point.trim(),
            description: typeof description === 'string' && description ? description : null,
            type: pointType,
        });
    }
    return out;
}

/**
 * PUT documents: array of { file_title, file_path }; a NEW file_path must be a storage URL or https (N36).
 * Paths already stored on this meeting are accepted as-is so editing an older meeting never fails
 * because of a legacy link (they are still guarded at render time).
 */
function parseDocuments(value: unknown, existingPaths: Set<string> = new Set()): CleanDocument[] | undefined {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) throw new HttpError(400, 'documents must be an array.');
    return value.map((d) => {
        const { file_title, file_path } = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
        if (typeof file_title !== 'string' || !file_title.trim() || typeof file_path !== 'string' || !file_path.trim()) {
            throw new HttpError(400, 'Each document must have a non-empty file_title and file_path.');
        }
        if (!existingPaths.has(file_path.trim()) && !isSafeDocumentUrl(file_path)) {
            throw new HttpError(400, `Document "${file_title.trim()}" must be an uploaded file or an https:// link.`);
        }
        return { file_title: file_title.trim(), file_path: file_path.trim() };
    });
}

function errorResponse(label: string, error: unknown) {
    const r = httpErrorResponse(error);
    if (r) return r;
    console.error(label, error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
}

async function resolveMeetingId(params: Promise<{ id: string }>): Promise<number> {
    const { id } = await params;
    const meetingId = toPositiveInt(id);
    if (!meetingId) throw new HttpError(404, 'Meeting not found');
    return meetingId;
}
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings`
 * - Model: `companies`
 * - Model: `meetings_participants`
 * - Model: `meetings_points`
 * - Model: `meetings_votes`
 * - Model: `meetings_documents`
 * - Model: `meetings_turn_requests`
 * - Model: `meetings_attendances`
 * - Model: `meetings_invitations`
 * RELATIONS INCLUDED: 
 * company: true, meetings_points: { include: { meetings_votes: true, meetings_points: true | meetings_participants: true, company: { select: { id: true, name: true

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
        const actor = await requireUser(req);
        const meetingId = await resolveMeetingId(params);
        const scope = await assertMeetingAccess(actor, meetingId, 'read');
        // Staff of the meeting see who voted what; an invited PARTICIPANT user only sees the tallies.
        const staff = isMeetingStaff(actor, scope);
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                company: { select: COMPANY_PUBLIC_SELECT },
                meetings_points: {
                    include: {
                        meetings_votes: staff ? true : { select: { id: true, point_id: true, vote: true } },
                        meetings_points: true,
                    },
                    orderBy: { id: 'asc' },
                },
                meetings_documents: true,
                // Never send participant join tokens to the browser.
                meetings_participants: { select: PARTICIPANT_PUBLIC_SELECT },
                meetings_invitations: { select: { id: true, meeting_id: true, meetings_participant_id: true, meetings_invitation_date: true, status: true } },
                meetings_attendances: { select: { id: true, meeting_id: true, meetings_participant_id: true, meetings_attendances_status: true } },
            },
        });
        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        return NextResponse.json({ status: true, data: meeting });
    } catch (error) {
        return errorResponse('Error fetching meeting:', error);
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireUser(req);
        const id = await resolveMeetingId(params);
        await assertMeetingAccess(user, id, 'manage');
        const body = await req.json();
        const { sendRescheduleNotification, ...rest } = body;
        // Validate nested collections before any write (nothing is deleted on a bad payload).
        const cleanPoints = parsePoints(rest.points);
        const existingDocs = await prisma.meetings_documents.findMany({ where: { meeting_id: id }, select: { file_path: true } });
        const cleanDocuments = parseDocuments(rest.documents, new Set(existingDocs.map((d) => d.file_path.trim())));

        // Enforce meeting time limit
        if (rest.duration) {
            const existing = await prisma.meetings.findUnique({ where: { id: id }, select: { company_id: true } });
            if (existing) {
                const company = await prisma.companies.findUnique({
                    where: { id: existing.company_id },
                    select: { meeting_time_limit: true }
                });
                if (company && company.meeting_time_limit) {
                    if (!isWithinDurationLimit(rest.duration, company.meeting_time_limit)) {
                        return NextResponse.json({
                            status: false,
                            message: `Meeting duration exceeds your company limit (${company.meeting_time_limit.replace('_', ' ')}).`
                        }, { status: 403 });
                    }
                }
            }
        }

        // Fetch existing to compare status and validate date
        const existingMeeting = await prisma.meetings.findUnique({
            where: { id: id },
            select: { status: true, company_id: true, date: true, time: true }
        });

        if (!existingMeeting) {
            return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        }

        // Validate date/time not in past
        if (rest.date !== undefined || rest.time !== undefined) {
            const updatedDate = rest.date !== undefined ? rest.date : existingMeeting.date;
            const updatedTime = rest.time !== undefined ? rest.time : existingMeeting.time;
            const meetingDateTime = new Date(`${updatedDate}T${updatedTime}`);
            if (meetingDateTime < new Date()) {
                return NextResponse.json({ status: false, message: 'La date et l\'heure de la réunion ne peuvent pas être dans le passé.' }, { status: 400 });
            }
        }

        // Only include defined fields
        const updateData: Record<string, any> = { editor_id: user.userId, updated_at: new Date() };
        if (rest.subject !== undefined) updateData.subject = rest.subject;
        if (rest.date !== undefined) updateData.date = rest.date;
        if (rest.time !== undefined) updateData.time = rest.time;
        if (rest.location !== undefined) updateData.location = rest.location;
        if (rest.description !== undefined) updateData.description = rest.description;
        // Rendered as HTML on the meeting page: same sanitizer as the AI summary route.
        if (rest.summary !== undefined) updateData.summary = rest.summary === null ? null : sanitizeHtml(String(rest.summary));
        if (rest.type) updateData.type = rest.type;
        if (rest.mode) updateData.mode = rest.mode;
        if (rest.duration) updateData.duration = rest.duration;
        if (rest.isonline) updateData.isonline = rest.isonline;
        if (rest.status) updateData.status = rest.status;

        // Handle participants update separately
        if (rest.participants && Array.isArray(rest.participants)) {
            const existingParticipants = await prisma.meetings_participants.findMany({
                where: { meeting_id: id }
            });
            const existingEmails = new Set(existingParticipants.map((p: any) => p.email));
            const newEmails = rest.participants.filter((email: string) => !existingEmails.has(email));
            const removedIds = existingParticipants
                .filter((p: any) => !rest.participants.includes(p.email))
                .map((p: any) => p.id);

            if (removedIds.length > 0) {
                await prisma.meetings_participants.deleteMany({ where: { id: { in: removedIds } } });
            }
            if (newEmails.length > 0) {
                await prisma.meetings_participants.createMany({
                    data: newEmails.map((email: string) => ({
                        email,
                        token: crypto.randomUUID(),
                        meeting_id: id,
                    })),
                });
            }
        }

        // Handle agenda points update separately
        if (cleanPoints) {
            const existingPoints = await prisma.meetings_points.findMany({
                where: { meeting_id: id },
                select: { id: true },
            });
            const pointIds = existingPoints.map((p: any) => p.id);
            if (pointIds.length > 0) {
                await prisma.meetings_votes.deleteMany({ where: { point_id: { in: pointIds } } });
            }
            await prisma.meetings_points.deleteMany({ where: { meeting_id: id } });
            if (cleanPoints.length > 0) {
                await prisma.meetings_points.createMany({
                    data: cleanPoints.map((p) => ({ ...p, meeting_id: id })),
                });
            }
        }

        // Handle documents update
        if (cleanDocuments) {
            await prisma.meetings_documents.deleteMany({ where: { meeting_id: id } });
            if (cleanDocuments.length > 0) {
                await prisma.meetings_documents.createMany({
                    data: cleanDocuments.map((d) => ({ ...d, meeting_id: id })),
                });
            }
        }

        const meeting = await prisma.meetings.update({
            where: { id: id },
            data: updateData,
            include: {
                meetings_participants: { select: PARTICIPANT_PUBLIC_SELECT },
                company: { select: { id: true, name: true } },
            },
        });

        const adminLocale = req.cookies.get('NEXT_LOCALE')?.value || 'fr';

        if (sendRescheduleNotification && meeting.meetings_participants.length > 0) {
            dispatchMeetingPush({
                companyId: meeting.company_id,
                meetingId: meeting.id,
                action: 'RESCHEDULE',
                adminLocale
            });
        }

        const statusChanged = body.status && existingMeeting && body.status !== existingMeeting.status;
        if (statusChanged && meeting.meetings_participants.length > 0) {
            let action: any = 'UPDATE';
            if (body.status === 'STARTED') action = 'START';
            if (body.status === 'CANCELLED') action = 'CANCEL';
            if (body.status === 'FINISHED') action = 'FINISHED';

            dispatchMeetingPush({
                companyId: meeting.company_id,
                meetingId: meeting.id,
                action,
                adminLocale
            });
        }
        await createLog({
            message: statusChanged
                ? `Meeting status changed to ${body.status}: ${meeting.subject}`
                : `Meeting updated: ${meeting.subject}`,
            userId: user.userId,
            companyId: meeting.company_id,
            payload: redactSecrets(body),
            response: meeting
        });

        return NextResponse.json({ status: true, data: meeting });
    } catch (error: any) {
        return errorResponse('Error updating meeting:', error);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireUser(req);
        const meetingId = await resolveMeetingId(params);
        await assertMeetingAccess(user, meetingId, 'manage');

        const meeting = await prisma.meetings.findUnique({ where: { id: meetingId } });
        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        await prisma.meetings_turn_requests.deleteMany({ where: { meeting_id: meetingId } });
        const points = await prisma.meetings_points.findMany({ where: { meeting_id: meetingId }, select: { id: true } });
        if (points.length > 0) {
            await prisma.meetings_votes.deleteMany({ where: { point_id: { in: points.map(p => p.id) } } });
        }
        await prisma.meetings_attendances.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_invitations.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_participants.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_points.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings_documents.deleteMany({ where: { meeting_id: meetingId } });
        await prisma.meetings.delete({ where: { id: meetingId } });

        // Send push notification for deletion
        const adminLocale = req.cookies.get('NEXT_LOCALE')?.value || 'fr';
        dispatchMeetingPush({
            companyId: meeting.company_id,
            meetingId: meeting.id,
            action: 'CANCEL',
            adminLocale
        });

        await createLog({
            message: `Meeting deleted: ${meeting.subject}`,
            userId: user.userId,
            companyId: meeting.company_id,
            payload: { id: meetingId },
            response: { success: true }
        });

        return NextResponse.json({ status: true, message: 'Meeting deleted' });
    } catch (error) {
        return errorResponse('Error deleting meeting:', error);
    }
}
