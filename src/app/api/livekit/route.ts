import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { prisma } from '@/lib/prisma';
import {
    assertMeetingAccess,
    httpErrorResponse,
    isMeetingStaff,
    requireMeetingActor,
    toPositiveInt,
} from '@/lib/authz';

/**
 * GET /api/livekit?meetingId=<id>
 * Invitees add `token` + `email` (query) or `x-participant-token` / `x-participant-email` headers.
 *
 * Returns `{ status: true, data: { token, room, identity, name }, token }` (top-level
 * `token` kept for older callers).
 *
 * Room, identity and grants are derived server-side (C6):
 * - room     = `meeting-<id>`
 * - identity = `user-<userId>` (logged-in) or `p-<participantId>` (invitee) — unique per person
 * - name     = display name (fullname/username/email) shown on video tiles
 * - refused for FINISHED / CANCELLED meetings; invitees must have accepted the invitation
 * - canPublish stays true for everyone (camera turns on when a participant is given
 *   the floor; floor control is app-level), canPublishData true, ttl 4h
 */
export async function GET(req: NextRequest) {
    try {
        const meetingId = toPositiveInt(new URL(req.url).searchParams.get('meetingId'));
        if (!meetingId) {
            return NextResponse.json({ status: false, message: 'meetingId is required' }, { status: 400 });
        }

        const actor = await requireMeetingActor(req, meetingId, { requireAccepted: true });
        const meeting = await assertMeetingAccess(actor, meetingId, 'read');
        if (meeting.status === 'FINISHED' || meeting.status === 'CANCELLED') {
            return NextResponse.json({ status: false, message: 'This meeting is not live.' }, { status: 409 });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        if (!apiKey || !apiSecret) {
            return NextResponse.json({
                status: false,
                message: 'LiveKit is not configured. Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL to your .env file.',
                configured: false,
            }, { status: 503 });
        }

        let identity: string;
        let name: string;
        let metadata: Record<string, unknown>;
        if (actor.kind === 'staff') {
            const u = await prisma.users.findUnique({
                where: { id: actor.userId },
                select: { fullname: true, username: true, email: true },
            });
            identity = `user-${actor.userId}`;
            name = u?.fullname || u?.username || u?.email || 'Admin';
            metadata = { kind: 'staff', userId: actor.userId, staff: isMeetingStaff(actor, meeting) };
        } else {
            identity = `p-${actor.participantId}`;
            name = actor.email;
            metadata = { kind: 'invitee', participantId: actor.participantId };
        }

        const room = `meeting-${meetingId}`;
        const at = new AccessToken(apiKey, apiSecret, {
            identity,
            name,
            metadata: JSON.stringify(metadata),
            ttl: '4h',
        });
        at.addGrant({
            roomJoin: true,
            room,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            canUpdateOwnMetadata: false,
        });

        const token = await at.toJwt();
        return NextResponse.json({ status: true, message: 'OK', data: { token, room, identity, name }, token });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        console.error('LiveKit token error:', error);
        return NextResponse.json({ status: false, message: 'Failed to generate token' }, { status: 500 });
    }
}
