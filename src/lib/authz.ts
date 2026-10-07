/**
 * Central authorization helpers (Phase 0 / security waves).
 *
 * Every route resolves an actor first, then checks the resource:
 *   const actor = await requireUser(req);                 // 401 if not logged in
 *   const meeting = await assertMeetingAccess(actor, id, 'manage'); // 403/404
 *
 * Default deny: anything not explicitly allowed throws HttpError.
 * Identity and scope always come from the JWT (re-checked against the DB)
 * or from the invitee token — never from the request body.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getJwtPayload, tokenVersionMatches, readTokenVersion, TOKEN_VERSION_SELECT } from '@/lib/auth';

export type Role = 'DEVELOPER' | 'ADMIN' | 'PARTICIPANT';

export interface StaffActor {
    kind: 'staff';
    userId: number;
    role: Role;
    companyId: number | null;
    email: string | null;
}

export interface InviteeActor {
    kind: 'invitee';
    participantId: number;
    meetingId: number;
    email: string;
    accepted: boolean;
}

export type Actor = StaffActor | InviteeActor;

export class HttpError extends Error {
    constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
        super(message);
    }
}

/** Turn a thrown HttpError into the usual `{ status:false, message }` response; rethrow anything else. */
export function httpErrorResponse(err: unknown): NextResponse | null {
    if (err instanceof HttpError) {
        return NextResponse.json({ status: false, message: err.message, ...(err.extra ?? {}) }, { status: err.status });
    }
    return null;
}

export function toPositiveInt(value: unknown): number | null {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

const ROLES: Role[] = ['DEVELOPER', 'ADMIN', 'PARTICIPANT'];

/**
 * Logged-in user, re-loaded from the DB so a deleted user, a role change or a
 * company change takes effect immediately (the JWT alone is not trusted).
 * The token's `tv` claim must equal users.token_version: bumping it (password
 * reset/change, role or company change) revokes every older token.
 * Returns null when there is no valid session.
 */
export async function getStaffActor(req: NextRequest): Promise<StaffActor | null> {
    const payload = getJwtPayload(req);
    const userId = toPositiveInt(payload?.userId);
    if (!payload || !userId) return null;
    const row = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true, role: true, company_id: true, email: true, ...TOKEN_VERSION_SELECT },
    });
    if (!row || !row.role || !ROLES.includes(row.role as Role)) return null;
    if (!tokenVersionMatches(payload.tv, readTokenVersion(row))) return null;
    const role = row.role as Role;
    // An ADMIN or PARTICIPANT without a company has no scope at all: treat as not logged in.
    if (role !== 'DEVELOPER' && row.company_id == null) return null;
    return { kind: 'staff', userId: row.id, role, companyId: row.company_id, email: row.email };
}

export async function requireUser(req: NextRequest): Promise<StaffActor> {
    const actor = await getStaffActor(req);
    if (!actor) throw new HttpError(401, 'Unauthorized');
    return actor;
}

export async function requireRole(req: NextRequest, ...roles: Role[]): Promise<StaffActor> {
    const actor = await requireUser(req);
    if (!roles.includes(actor.role)) throw new HttpError(403, 'Forbidden');
    return actor;
}

/** Meeting statuses after which invite links (join tokens) stop working (N47, owner decision). */
export const INVITE_CLOSED_STATUSES = ['FINISHED', 'CANCELLED'] as const;

/** Invitee lookup that also tells whether the pair matched a meeting that is over. */
async function resolveInvitee(
    meetingId: number,
    token: string | null | undefined,
    email: string | null | undefined,
): Promise<{ invitee: InviteeActor | null; ended: boolean }> {
    if (!token || !email || typeof token !== 'string' || typeof email !== 'string') return { invitee: null, ended: false };
    const participant = await prisma.meetings_participants.findFirst({
        where: { meeting_id: meetingId, token, email },
        select: {
            id: true,
            email: true,
            meeting: { select: { status: true } },
            meetings_invitations: { where: { meeting_id: meetingId }, select: { status: true }, take: 1 },
        },
    });
    if (!participant) return { invitee: null, ended: false };
    const status = participant.meeting?.status as string | undefined;
    if (!status || (INVITE_CLOSED_STATUSES as readonly string[]).includes(status)) return { invitee: null, ended: true };
    return {
        invitee: {
            kind: 'invitee',
            participantId: participant.id,
            meetingId,
            email: participant.email,
            accepted: participant.meetings_invitations[0]?.status === 'ACCEPTED',
        },
        ended: false,
    };
}

/**
 * Invitee identified by token + email for one meeting. Null when the pair does not match,
 * or when the meeting is FINISHED or CANCELLED (join tokens expire at meeting end; the PV
 * has its own signed link, src/lib/pv-link.ts).
 */
export async function getInviteeActor(
    meetingId: number,
    token: string | null | undefined,
    email: string | null | undefined,
): Promise<InviteeActor | null> {
    return (await resolveInvitee(meetingId, token, email)).invitee;
}

/** Invitee credentials from the query string (`token`, `email`) or headers (`x-participant-token`, `x-participant-email`). */
export function readInviteeCredentials(req: NextRequest): { token: string | null; email: string | null } {
    const { searchParams } = new URL(req.url);
    return {
        token: req.headers.get('x-participant-token') || searchParams.get('token'),
        email: req.headers.get('x-participant-email') || searchParams.get('email'),
    };
}

/**
 * Valid invitee credentials for this meeting first, else the logged-in user.
 * Throws 401 when neither is present/valid, 403 { meetingEnded } when the invite link
 * is valid but the meeting is FINISHED or CANCELLED (and no session is present).
 */
export async function requireMeetingActor(
    req: NextRequest,
    meetingId: number,
    opts: { requireAccepted?: boolean; token?: string | null; email?: string | null } = {},
): Promise<Actor> {
    // Valid invitee credentials for THIS meeting win over a browser session: someone opening
    // his invite link while logged in as another account must still join as the invitee.
    const creds = readInviteeCredentials(req);
    const token = opts.token ?? creds.token;
    const email = opts.email ?? creds.email;
    const { invitee, ended } = token && email ? await resolveInvitee(meetingId, token, email) : { invitee: null, ended: false };
    if (!invitee) {
        const staff = await getStaffActor(req);
        if (staff) return staff;
        // A real invite link for a meeting that is over: say so instead of a bare 401.
        if (ended) throw new HttpError(403, 'This meeting has ended.', { meetingEnded: true });
        throw new HttpError(401, 'Unauthorized');
    }
    if (opts.requireAccepted && !invitee.accepted) {
        throw new HttpError(403, 'You must accept the invitation before joining the live room', { requireAcceptance: true });
    }
    return invitee;
}

export interface MeetingScope {
    id: number;
    company_id: number;
    status: string;
}

/**
 * Check the actor may read or manage a meeting. Returns the meeting scope.
 * - DEVELOPER: everything.
 * - ADMIN: meetings of his own company (read + manage).
 * - PARTICIPANT user: read only, and only when his email is invited to that meeting.
 * - Invitee: read only, only his own meeting.
 * 404 when the meeting does not exist; 403 otherwise.
 */
export async function assertMeetingAccess(actor: Actor, meetingId: number, mode: 'read' | 'manage'): Promise<MeetingScope> {
    const meeting = await prisma.meetings.findUnique({
        where: { id: meetingId },
        select: { id: true, company_id: true, status: true },
    });
    if (!meeting) throw new HttpError(404, 'Meeting not found');

    if (actor.kind === 'invitee') {
        if (mode === 'read' && actor.meetingId === meeting.id) return meeting;
        throw new HttpError(403, 'Forbidden');
    }
    if (actor.role === 'DEVELOPER') return meeting;
    if (actor.role === 'ADMIN') {
        if (actor.companyId != null && actor.companyId === meeting.company_id) return meeting;
        throw new HttpError(403, 'Forbidden');
    }
    // PARTICIPANT user
    if (mode === 'read' && actor.email && actor.companyId === meeting.company_id) {
        const invited = await prisma.meetings_participants.findFirst({
            where: { meeting_id: meeting.id, email: actor.email },
            select: { id: true },
        });
        if (invited) return meeting;
    }
    throw new HttpError(403, 'Forbidden');
}

/** True for DEVELOPER, or ADMIN of the meeting's company. */
export function isMeetingStaff(actor: Actor, meeting: { company_id: number }): boolean {
    if (actor.kind !== 'staff') return false;
    if (actor.role === 'DEVELOPER') return true;
    return actor.role === 'ADMIN' && actor.companyId != null && actor.companyId === meeting.company_id;
}

/**
 * Role ladder for user management.
 * - DEVELOPER may manage anyone.
 * - ADMIN may manage only PARTICIPANT users of his own company (and himself, without changing role/company).
 * - PARTICIPANT may manage nobody (except himself, without changing role/company).
 */
export function canManageUser(
    actor: StaffActor,
    target: { id: number; role: string | null; company_id: number | null },
): boolean {
    if (actor.role === 'DEVELOPER') return true;
    if (target.id === actor.userId) return true;
    if (actor.role === 'ADMIN') {
        return target.role === 'PARTICIPANT' && actor.companyId != null && target.company_id === actor.companyId;
    }
    return false;
}

/** Roles an actor is allowed to assign. Only DEVELOPER may create ADMIN or DEVELOPER (owner decision). */
export function assignableRoles(actor: StaffActor): Role[] {
    if (actor.role === 'DEVELOPER') return ['DEVELOPER', 'ADMIN', 'PARTICIPANT'];
    if (actor.role === 'ADMIN') return ['PARTICIPANT'];
    return [];
}
