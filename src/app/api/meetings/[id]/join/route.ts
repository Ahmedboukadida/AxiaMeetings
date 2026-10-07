import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createLog } from '@/lib/logger';

// GET: fetch invitation status for a participant by token+email
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]/join
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]/join`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings_participants`
 * - Model: `meetings_invitations`
 * - Model: `meetings_attendances`
 * RELATIONS INCLUDED: 
 * meeting: { select: { id: true, subject: true, date: true, time: true, location: true, mode: true, status: true | meeting: true

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
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
        return NextResponse.json({ status: false, message: 'Token and email are required' }, { status: 400 });
    }

    try {
        const participant = await prisma.meetings_participants.findFirst({
            where: { meeting_id: Number(id), token, email },
            include: {
                meeting: { select: { id: true, subject: true, date: true, time: true, location: true, mode: true, status: true } },
                meetings_invitations: { select: { id: true, status: true } },
            },
        });

        if (!participant) {
            return NextResponse.json({ status: false, message: 'Invalid token or email' }, { status: 404 });
        }

        return NextResponse.json({ status: true, data: participant });
    } catch (error) {
        console.error('Error fetching join info:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// POST: participant accepts or rejects the invitation
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const { token, email, response } = await req.json();
        if (!token || !email || !response) {
            return NextResponse.json({ status: false, message: 'Token, email and response are required' }, { status: 400 });
        }
        if (!['ACCEPTED', 'REJECTED'].includes(response)) {
            return NextResponse.json({ status: false, message: 'Response must be ACCEPTED or REJECTED' }, { status: 400 });
        }

        const participant = await prisma.meetings_participants.findFirst({
            where: { meeting_id: Number(id), token, email },
            include: { meeting: true }
        });

        if (!participant) {
            return NextResponse.json({ status: false, message: 'Invalid token or email' }, { status: 404 });
        }

        // Upsert invitation record
        const existingInvitation = await prisma.meetings_invitations.findFirst({
            where: { meeting_id: Number(id), meetings_participant_id: participant.id },
        });

        if (existingInvitation) {
            await prisma.meetings_invitations.update({
                where: { id: existingInvitation.id },
                data: { status: response },
            });
        } else {
            await prisma.meetings_invitations.create({
                data: { meeting_id: Number(id), meetings_participant_id: participant.id, status: response },
            });
        }

        // If accepted, create attendance record
        if (response === 'ACCEPTED') {
            const existingAttendance = await prisma.meetings_attendances.findFirst({
                where: { meeting_id: Number(id), meetings_participant_id: participant.id },
            });
            if (!existingAttendance) {
                await prisma.meetings_attendances.create({
                    data: { meeting_id: Number(id), meetings_participant_id: participant.id, meetings_attendances_status: 'PRESENT' },
                });
            }
        }

        await createLog({
            message: `Participant ${email} ${response.toLowerCase()} invitation for meeting: ${participant.meeting.subject}`,
            companyId: participant.meeting.company_id as any,
            payload: { email, response, meetingId: id },
            response: { success: true }
        });

        return NextResponse.json({ status: true, message: `Invitation ${response.toLowerCase()}` });
    } catch (error) {
        console.error('Error responding to invitation:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
