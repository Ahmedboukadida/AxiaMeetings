import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    requireMeetingActor,
    requireRole,
    assertMeetingAccess,
    isMeetingStaff,
    httpErrorResponse,
    toPositiveInt,
    HttpError,
} from '@/lib/authz';
import { createLog } from '@/lib/logger';

const POINT_TYPES = ['SIMPLE', 'VOTE'] as const;
type PointType = (typeof POINT_TYPES)[number];

function parseMeetingId(id: string): number {
    const meetingId = toPositiveInt(id);
    if (!meetingId) throw new HttpError(400, 'Invalid meeting id');
    return meetingId;
}

function parsePointType(value: unknown): PointType {
    if (value === undefined || value === null || value === '') return 'SIMPLE';
    if (typeof value === 'string' && (POINT_TYPES as readonly string[]).includes(value)) return value as PointType;
    throw new HttpError(400, 'type must be SIMPLE or VOTE');
}

function parseText(value: unknown, field: string, required: boolean): string | null {
    if (value === undefined || value === null || value === '') {
        if (required) throw new HttpError(400, `${field} is required`);
        return null;
    }
    if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
    return value;
}

/** The point must belong to the meeting in the URL — never trust a bare point_id from the body. */
async function findPointInMeeting(pointIdRaw: unknown, meetingId: number) {
    const pointId = toPositiveInt(pointIdRaw);
    if (!pointId) throw new HttpError(400, 'point_id is required');
    const point = await prisma.meetings_points.findFirst({ where: { id: pointId, meeting_id: meetingId } });
    if (!point) throw new HttpError(404, 'Point not found in this meeting');
    return point;
}

// GET all points for a meeting
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]/points
 * Method: GET
 *
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]/points`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 *
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings_points`
 * - Model: `meetings`
 * - Model: `meetings_votes`
 * RELATIONS INCLUDED:
 * meetings_votes: true, meetings_points: true
 *
 * AI AGENT DATA ACCESS & ROLE RULES:
 * 1. UNAUTHENTICATED: Only provide general AxiaMeetings info (total companies, users, references, guides).
 * 2. ADMIN: Restrict all answers to data where companyId matches the admin's company. They can query specific meetings, users, etc., within their company.
 * 3. PARTICIPANT (Token): Restrict all answers strictly to the single meeting associated with their token.
 * 4. DEVELOPER: Full access to all data.
 *
 * ACCESS (enforced): read access to the meeting (staff of its company, invited participant user, or invitee token).
 * Non-staff viewers get vote values without `meetings_participant_id` (who voted what stays with the organisers).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const meetingId = parseMeetingId(id);
        const actor = await requireMeetingActor(req, meetingId);
        const meeting = await assertMeetingAccess(actor, meetingId, 'read');
        const staff = isMeetingStaff(actor, meeting);

        const points = await prisma.meetings_points.findMany({
            where: { meeting_id: meetingId, parent_id: null },
            include: {
                meetings_votes: staff ? true : { select: { id: true, point_id: true, vote: true } },
                meetings_points: true,
            },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: points });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// POST add a point
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { id } = await params;
        const meetingId = parseMeetingId(id);
        await assertMeetingAccess(user, meetingId, 'manage');

        const body = await req.json().catch(() => ({}));
        const point = parseText(body?.point, 'Point text', true) as string;
        const description = parseText(body?.description, 'description', false);
        const type = parsePointType(body?.type);

        const created = await prisma.meetings_points.create({
            data: { point, description, type, meeting_id: meetingId },
        });
        const meeting = await prisma.meetings.findUnique({ where: { id: meetingId }, select: { subject: true } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Added point to meeting "${meeting?.subject}": ${point}`,
            payload: { point, description, type, meeting_id: meetingId },
            response: created,
        });

        return NextResponse.json({ status: true, data: created }, { status: 201 });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        console.error('Error creating point:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// PUT update a point
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { id } = await params;
        const meetingId = parseMeetingId(id);
        await assertMeetingAccess(user, meetingId, 'manage');

        const body = await req.json().catch(() => ({}));
        const existing = await findPointInMeeting(body?.point_id, meetingId);
        const point = parseText(body?.point, 'Point text', true) as string;
        const description = parseText(body?.description, 'description', false);
        const type = parsePointType(body?.type);

        const updated = await prisma.meetings_points.update({
            where: { id: existing.id },
            data: { point, description, type },
        });
        const meeting = await prisma.meetings.findUnique({ where: { id: meetingId }, select: { subject: true } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated point in meeting "${meeting?.subject}": ${point}`,
            payload: { point_id: existing.id, point, description, type },
            response: updated,
        });

        return NextResponse.json({ status: true, data: updated });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// DELETE a point
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { id } = await params;
        const meetingId = parseMeetingId(id);
        await assertMeetingAccess(user, meetingId, 'manage');

        const body = await req.json().catch(() => ({}));
        const existingPoint = await findPointInMeeting(body?.point_id, meetingId);
        const meeting = await prisma.meetings.findUnique({ where: { id: meetingId }, select: { subject: true } });

        // Delete votes first (scoped to the verified point).
        await prisma.meetings_votes.deleteMany({ where: { point_id: existingPoint.id } });
        await prisma.meetings_points.delete({ where: { id: existingPoint.id } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted point from meeting "${meeting?.subject}": ${existingPoint.point}`,
            payload: { point_id: existingPoint.id, meeting_id: meetingId },
        });

        return NextResponse.json({ status: true, message: 'Point deleted' });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
