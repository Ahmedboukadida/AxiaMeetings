import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, assertMeetingAccess, httpErrorResponse, toPositiveInt, HttpError } from '@/lib/authz';
import { PARTICIPANT_PUBLIC_SELECT } from '@/lib/safe-select';
import { createLog } from '@/lib/logger';
import { notifyParticipants } from '@/lib/notifier';

const STATUSES = ['SCHEDULED', 'STARTED', 'FINISHED', 'CANCELLED'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { id } = await params;
        const meetingId = toPositiveInt(id);
        if (!meetingId) throw new HttpError(400, 'Invalid meeting id');
        await assertMeetingAccess(user, meetingId, 'manage');
        const { status } = await req.json();

        if (!status || !STATUSES.includes(status)) {
            return NextResponse.json({ status: false, message: 'Status must be one of SCHEDULED, STARTED, FINISHED, CANCELLED' }, { status: 400 });
        }

        const existing = await prisma.meetings.findUnique({
            where: { id: meetingId },
            select: { id: true, status: true, company_id: true }
        });

        if (!existing) {
            return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        }

        const updatedMeeting = await prisma.meetings.update({
            where: { id: meetingId },
            data: { status, updated_at: new Date() },
            include: { 
                meetings_participants: true,
                company: { select: { id: true, name: true } }
            }
        });

        // Notifications
        if (existing.status !== status && updatedMeeting.meetings_participants.length > 0) {
            const statusMap: any = {
                'STARTED': 'a commencé',
                'FINISHED': 'est terminée',
                'CANCELLED': 'est annulée',
                'SCHEDULED': 'est planifiée'
            };
            const statusText = statusMap[status] || status;
            
            await notifyParticipants({
                companyId: updatedMeeting.company_id,
                meeting: updatedMeeting,
                type: status === 'STARTED' ? 'START' : status === 'CANCELLED' ? 'CANCEL' : status === 'FINISHED' ? 'FINISHED' : 'UPDATE',
                subject: status === 'STARTED' ? 'En direct' : status === 'FINISHED' ? 'Terminée' : status === 'CANCELLED' ? 'Annulée' : 'Planifiée',
                body: `${updatedMeeting.subject}`,
                participants: updatedMeeting.meetings_participants
            }).catch((err: any) => {
                console.error('Status notification failed:', err);
            });
        }

        // Participant join tokens are needed by notifyParticipants (links) but never leave the server.
        const safeMeeting = {
            ...updatedMeeting,
            meetings_participants: updatedMeeting.meetings_participants.map(
                (p) => Object.fromEntries(Object.keys(PARTICIPANT_PUBLIC_SELECT).map((k) => [k, p[k as keyof typeof p]])),
            ),
        };

        await createLog({
            message: `Meeting status changed to ${status}: ${updatedMeeting.subject}`,
            userId: user.userId,
            companyId: updatedMeeting.company_id,
            payload: { status },
            response: safeMeeting
        });

        return NextResponse.json({ status: true, data: safeMeeting });
    } catch (error) {
        const denied = httpErrorResponse(error);
        if (denied) return denied;
        console.error('Error updating meeting status:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
