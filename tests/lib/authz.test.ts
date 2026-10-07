import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

/* ------------------------------------------------------------------ */
/* 3-tenant fixture: companies 1, 2, 3                                 */
/* ------------------------------------------------------------------ */

interface UserRow { id: number; role: string | null; company_id: number | null; email: string | null; token_version?: number }
interface MeetingRow { id: number; company_id: number; status: string }
interface ParticipantRow { id: number; meeting_id: number; email: string; token: string; invitation: string | null }

const db = vi.hoisted(() => ({
    users: [] as UserRow[],
    meetings: [] as MeetingRow[],
    participants: [] as ParticipantRow[],
}));

vi.mock('@/lib/prisma', () => {
    const pick = (row: Record<string, unknown>, select?: Record<string, unknown>) => {
        if (!select) return row;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(select)) if (k in row) out[k] = row[k];
        return out;
    };
    return {
        prisma: {
            users: {
                findUnique: vi.fn(async ({ where, select }: { where: { id: number }; select?: Record<string, unknown> }) => {
                    const row = db.users.find((u) => u.id === where.id);
                    return row ? pick({ ...row }, select) : null;
                }),
            },
            meetings: {
                findUnique: vi.fn(async ({ where, select }: { where: { id: number }; select?: Record<string, unknown> }) => {
                    const row = db.meetings.find((m) => m.id === where.id);
                    return row ? pick({ ...row }, select) : null;
                }),
            },
            meetings_participants: {
                findFirst: vi.fn(
                    async ({ where, select }: {
                        where: { meeting_id: number; email?: string; token?: string };
                        select?: Record<string, unknown>;
                    }) => {
                        const row = db.participants.find(
                            (p) =>
                                p.meeting_id === where.meeting_id &&
                                (where.email === undefined || p.email === where.email) &&
                                (where.token === undefined || p.token === where.token),
                        );
                        if (!row) return null;
                        const full = {
                            id: row.id,
                            email: row.email,
                            meeting_id: row.meeting_id,
                            token: row.token,
                            meeting: { status: db.meetings.find((m) => m.id === row.meeting_id)?.status ?? 'SCHEDULED' },
                            meetings_invitations: row.invitation ? [{ status: row.invitation }] : [],
                        };
                        return pick(full, select);
                    },
                ),
            },
        },
    };
});

import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import {
    HttpError,
    assertMeetingAccess,
    assignableRoles,
    canManageUser,
    getInviteeActor,
    getStaffActor,
    httpErrorResponse,
    isMeetingStaff,
    readInviteeCredentials,
    requireMeetingActor,
    requireRole,
    requireUser,
    toPositiveInt,
    type Actor,
    type InviteeActor,
    type StaffActor,
} from '@/lib/authz';

const U = {
    DEV: 1,
    ADMIN_C1: 2,
    ADMIN_C2: 3,
    ADMIN_NOCO: 4,
    PART_C1_INVITED: 5,
    PART_C1_NOT_INVITED: 6,
    PART_C2_EMAIL_INVITED: 7, // email is on meeting 10's list, but belongs to company 2
    ADMIN_C3: 8,
    WEIRD_ROLE: 9,
} as const;

const M = { C1: 10, C2: 20, C3: 30, MISSING: 999 } as const;

function seed() {
    db.users = [
        { id: U.DEV, role: 'DEVELOPER', company_id: null, email: 'dev@axia.test' },
        { id: U.ADMIN_C1, role: 'ADMIN', company_id: 1, email: 'admin@c1.test' },
        { id: U.ADMIN_C2, role: 'ADMIN', company_id: 2, email: 'admin@c2.test' },
        { id: U.ADMIN_NOCO, role: 'ADMIN', company_id: null, email: 'admin@none.test' },
        { id: U.PART_C1_INVITED, role: 'PARTICIPANT', company_id: 1, email: 'p.invited@c1.test' },
        { id: U.PART_C1_NOT_INVITED, role: 'PARTICIPANT', company_id: 1, email: 'p.other@c1.test' },
        { id: U.PART_C2_EMAIL_INVITED, role: 'PARTICIPANT', company_id: 2, email: 'p.cross@c2.test' },
        { id: U.ADMIN_C3, role: 'ADMIN', company_id: 3, email: 'admin@c3.test' },
        { id: U.WEIRD_ROLE, role: 'SUPERUSER', company_id: 1, email: 'weird@c1.test' },
    ];
    db.meetings = [
        { id: M.C1, company_id: 1, status: 'SCHEDULED' },
        { id: M.C2, company_id: 2, status: 'SCHEDULED' },
        { id: M.C3, company_id: 3, status: 'DRAFT' },
    ];
    db.participants = [
        { id: 100, meeting_id: M.C1, email: 'p.invited@c1.test', token: 'tok-p-invited', invitation: 'ACCEPTED' },
        { id: 101, meeting_id: M.C1, email: 'p.cross@c2.test', token: 'tok-p-cross', invitation: 'ACCEPTED' },
        { id: 102, meeting_id: M.C1, email: 'guest.ok@ext.test', token: 'tok-accepted', invitation: 'ACCEPTED' },
        { id: 103, meeting_id: M.C1, email: 'guest.wait@ext.test', token: 'tok-pending', invitation: 'PENDING' },
        { id: 104, meeting_id: M.C1, email: 'guest.none@ext.test', token: 'tok-noinv', invitation: null },
        { id: 200, meeting_id: M.C2, email: 'guest20@ext.test', token: 'tok-20', invitation: 'ACCEPTED' },
    ];
}

beforeEach(() => {
    seed();
    vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function tokenFor(userId: number, overrides: Record<string, unknown> = {}): string {
    const u = db.users.find((x) => x.id === userId);
    // Raw jwt.sign so tests can forge any claim shape (signJwt is typed).
    return jwt.sign(
        { userId, email: u?.email, role: u?.role, companyId: u?.company_id ?? null, tv: u?.token_version ?? 0, ...overrides },
        'test-secret',
        { algorithm: 'HS256', expiresIn: '8h' },
    );
}

function req(opts: { token?: string; query?: Record<string, string>; headers?: Record<string, string> } = {}): NextRequest {
    const url = new URL('http://localhost/api/test');
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const headers = new Headers(opts.headers);
    if (opts.token) headers.set('cookie', `axia_meetings_token=${opts.token}`);
    return new NextRequest(url, { headers });
}

const reqAs = (userId: number) => req({ token: tokenFor(userId) });

async function staff(userId: number): Promise<StaffActor> {
    const a = await getStaffActor(reqAs(userId));
    if (!a) throw new Error(`fixture user ${userId} did not resolve`);
    return a;
}

async function invitee(meetingId: number, token: string, email: string): Promise<InviteeActor> {
    const a = await getInviteeActor(meetingId, token, email);
    if (!a) throw new Error('fixture invitee did not resolve');
    return a;
}

async function expectHttp(p: Promise<unknown>, status: number) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err, `expected HttpError ${status}`).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    return err as HttpError;
}

/* ------------------------------------------------------------------ */
/* getStaffActor / requireUser / requireRole                           */
/* ------------------------------------------------------------------ */

describe('getStaffActor', () => {
    it('returns null without a cookie or Authorization header', async () => {
        expect(await getStaffActor(req())).toBeNull();
        expect(prisma.users.findUnique).not.toHaveBeenCalled();
    });

    it('returns null for a malformed token', async () => {
        expect(await getStaffActor(req({ token: 'not-a-jwt' }))).toBeNull();
    });

    it('returns null for a token signed with another secret', async () => {
        const forged = jwt.sign({ userId: U.DEV, role: 'DEVELOPER' }, 'attacker-secret');
        expect(await getStaffActor(req({ token: forged }))).toBeNull();
    });

    it('returns null for an expired token', async () => {
        const expired = jwt.sign({ userId: U.DEV, role: 'DEVELOPER' }, 'test-secret', { expiresIn: -10 });
        expect(await getStaffActor(req({ token: expired }))).toBeNull();
    });

    it('returns null when the JWT userId is not a positive integer (no DB lookup)', async () => {
        for (const userId of [0, -1, 1.5, 'abc', null]) {
            expect(await getStaffActor(req({ token: jwt.sign({ userId }, 'test-secret') }))).toBeNull();
        }
        expect(prisma.users.findUnique).not.toHaveBeenCalled();
    });

    it('accepts a Bearer token in the Authorization header', async () => {
        const a = await getStaffActor(req({ headers: { Authorization: `Bearer ${tokenFor(U.ADMIN_C1)}` } }));
        expect(a).toMatchObject({ kind: 'staff', userId: U.ADMIN_C1, role: 'ADMIN', companyId: 1 });
    });

    it('returns null when the user was deleted from the DB', async () => {
        const t = tokenFor(U.ADMIN_C1);
        db.users = db.users.filter((u) => u.id !== U.ADMIN_C1);
        expect(await getStaffActor(req({ token: t }))).toBeNull();
    });

    it('DB role and company win over the JWT claims', async () => {
        // JWT claims DEVELOPER of company 2; DB says PARTICIPANT of company 1.
        const t = tokenFor(U.PART_C1_INVITED, { role: 'DEVELOPER', companyId: 2, email: 'evil@x.test' });
        const a = await getStaffActor(req({ token: t }));
        expect(a).toEqual({
            kind: 'staff',
            userId: U.PART_C1_INVITED,
            role: 'PARTICIPANT',
            companyId: 1,
            email: 'p.invited@c1.test',
        });
    });

    it('a demotion in the DB takes effect immediately', async () => {
        const t = tokenFor(U.ADMIN_C1);
        db.users.find((u) => u.id === U.ADMIN_C1)!.role = 'PARTICIPANT';
        expect((await getStaffActor(req({ token: t })))?.role).toBe('PARTICIPANT');
    });

    it('returns null for an ADMIN with company null', async () => {
        expect(await getStaffActor(reqAs(U.ADMIN_NOCO))).toBeNull();
    });

    it('returns null for a PARTICIPANT with company null', async () => {
        db.users.find((u) => u.id === U.PART_C1_INVITED)!.company_id = null;
        expect(await getStaffActor(reqAs(U.PART_C1_INVITED))).toBeNull();
    });

    it('allows a DEVELOPER with company null', async () => {
        expect(await getStaffActor(reqAs(U.DEV))).toMatchObject({ role: 'DEVELOPER', companyId: null });
    });

    it('signJwt puts tv in the token and it resolves', async () => {
        db.users.find((u) => u.id === U.ADMIN_C1)!.token_version = 3;
        const t = signJwt({ userId: U.ADMIN_C1, email: 'admin@c1.test', role: 'ADMIN', companyId: 1, tv: 3 });
        expect(jwt.decode(t)).toMatchObject({ tv: 3 });
        expect(await getStaffActor(req({ token: t }))).toMatchObject({ userId: U.ADMIN_C1 });
    });

    it('returns null when tv does not match users.token_version (revoked session)', async () => {
        const t = tokenFor(U.ADMIN_C1); // tv 0
        db.users.find((u) => u.id === U.ADMIN_C1)!.token_version = 1; // e.g. password reset
        expect(await getStaffActor(req({ token: t }))).toBeNull();
        expect(await getStaffActor(req({ token: tokenFor(U.ADMIN_C1) }))).toMatchObject({ userId: U.ADMIN_C1 });
    });

    it('a token without tv (issued before the change) works only while token_version is 0', async () => {
        const legacy = jwt.sign({ userId: U.ADMIN_C1, role: 'ADMIN', companyId: 1 }, 'test-secret');
        expect(await getStaffActor(req({ token: legacy }))).toMatchObject({ userId: U.ADMIN_C1 });
        db.users.find((u) => u.id === U.ADMIN_C1)!.token_version = 1;
        expect(await getStaffActor(req({ token: legacy }))).toBeNull();
    });

    it('returns null for a non-integer tv claim', async () => {
        for (const tv of ['0', null, 0.5, true]) {
            expect(await getStaffActor(req({ token: tokenFor(U.ADMIN_C1, { tv }) }))).toBeNull();
        }
    });

    it('refuses tokens signed with another algorithm (alg pinned to HS256)', async () => {
        const hs512 = jwt.sign({ userId: U.DEV, role: 'DEVELOPER', tv: 0 }, 'test-secret', { algorithm: 'HS512' });
        expect(await getStaffActor(req({ token: hs512 }))).toBeNull();
        const none = jwt.sign({ userId: U.DEV, role: 'DEVELOPER', tv: 0 }, '', { algorithm: 'none' });
        expect(await getStaffActor(req({ token: none }))).toBeNull();
    });

    it('returns null for an unknown or missing role', async () => {
        expect(await getStaffActor(reqAs(U.WEIRD_ROLE))).toBeNull();
        db.users.find((u) => u.id === U.ADMIN_C1)!.role = null;
        expect(await getStaffActor(reqAs(U.ADMIN_C1))).toBeNull();
    });
});

describe('requireUser / requireRole', () => {
    it('requireUser throws 401 without a valid session', async () => {
        await expectHttp(requireUser(req()), 401);
        await expectHttp(requireUser(reqAs(U.ADMIN_NOCO)), 401);
    });

    it('requireUser returns the actor', async () => {
        expect((await requireUser(reqAs(U.ADMIN_C2))).companyId).toBe(2);
    });

    it('requireRole throws 401 when not logged in', async () => {
        await expectHttp(requireRole(req(), 'ADMIN'), 401);
    });

    it('requireRole throws 403 for a role outside the list', async () => {
        await expectHttp(requireRole(reqAs(U.PART_C1_INVITED), 'ADMIN', 'DEVELOPER'), 403);
        await expectHttp(requireRole(reqAs(U.ADMIN_C1), 'DEVELOPER'), 403);
    });

    it('requireRole passes for an allowed role', async () => {
        expect((await requireRole(reqAs(U.ADMIN_C1), 'ADMIN', 'DEVELOPER')).role).toBe('ADMIN');
        expect((await requireRole(reqAs(U.DEV), 'DEVELOPER')).role).toBe('DEVELOPER');
    });
});

/* ------------------------------------------------------------------ */
/* assertMeetingAccess                                                 */
/* ------------------------------------------------------------------ */

describe('assertMeetingAccess', () => {
    it('404 when the meeting does not exist (for any actor)', async () => {
        await expectHttp(assertMeetingAccess(await staff(U.DEV), M.MISSING, 'read'), 404);
        await expectHttp(assertMeetingAccess(await staff(U.ADMIN_C1), M.MISSING, 'manage'), 404);
    });

    it('DEVELOPER reads and manages meetings of every company', async () => {
        const dev = await staff(U.DEV);
        for (const id of [M.C1, M.C2, M.C3]) {
            for (const mode of ['read', 'manage'] as const) {
                expect((await assertMeetingAccess(dev, id, mode)).id).toBe(id);
            }
        }
    });

    it('ADMIN reads and manages meetings of his own company', async () => {
        const admin = await staff(U.ADMIN_C1);
        expect(await assertMeetingAccess(admin, M.C1, 'read')).toEqual({ id: M.C1, company_id: 1, status: 'SCHEDULED' });
        expect((await assertMeetingAccess(admin, M.C1, 'manage')).id).toBe(M.C1);
    });

    it('ADMIN gets 403 on meetings of other companies', async () => {
        const a1 = await staff(U.ADMIN_C1);
        const a2 = await staff(U.ADMIN_C2);
        for (const mode of ['read', 'manage'] as const) {
            await expectHttp(assertMeetingAccess(a1, M.C2, mode), 403);
            await expectHttp(assertMeetingAccess(a1, M.C3, mode), 403);
            await expectHttp(assertMeetingAccess(a2, M.C1, mode), 403);
        }
    });

    it('ADMIN actor with companyId null (forged object) is denied', async () => {
        const forged: StaffActor = { kind: 'staff', userId: U.ADMIN_NOCO, role: 'ADMIN', companyId: null, email: null };
        await expectHttp(assertMeetingAccess(forged, M.C1, 'read'), 403);
    });

    it('PARTICIPANT invited to the meeting can read it', async () => {
        const p = await staff(U.PART_C1_INVITED);
        expect((await assertMeetingAccess(p, M.C1, 'read')).id).toBe(M.C1);
    });

    it('PARTICIPANT invited to the meeting cannot manage it', async () => {
        await expectHttp(assertMeetingAccess(await staff(U.PART_C1_INVITED), M.C1, 'manage'), 403);
    });

    it('PARTICIPANT of the same company but not invited gets 403', async () => {
        await expectHttp(assertMeetingAccess(await staff(U.PART_C1_NOT_INVITED), M.C1, 'read'), 403);
    });

    it('PARTICIPANT of another company gets 403 even if his email is on the list', async () => {
        await expectHttp(assertMeetingAccess(await staff(U.PART_C2_EMAIL_INVITED), M.C1, 'read'), 403);
        await expectHttp(assertMeetingAccess(await staff(U.PART_C1_INVITED), M.C2, 'read'), 403);
    });

    it('PARTICIPANT without an email is denied', async () => {
        const p: StaffActor = { kind: 'staff', userId: U.PART_C1_INVITED, role: 'PARTICIPANT', companyId: 1, email: null };
        await expectHttp(assertMeetingAccess(p, M.C1, 'read'), 403);
    });

    it('invitee reads his own meeting', async () => {
        const inv = await invitee(M.C1, 'tok-accepted', 'guest.ok@ext.test');
        expect((await assertMeetingAccess(inv, M.C1, 'read')).id).toBe(M.C1);
    });

    it('invitee gets 403 on another meeting', async () => {
        const inv = await invitee(M.C1, 'tok-accepted', 'guest.ok@ext.test');
        await expectHttp(assertMeetingAccess(inv, M.C2, 'read'), 403);
        await expectHttp(assertMeetingAccess(inv, M.C3, 'read'), 403);
    });

    it('invitee cannot manage, even his own meeting', async () => {
        const inv = await invitee(M.C1, 'tok-accepted', 'guest.ok@ext.test');
        await expectHttp(assertMeetingAccess(inv, M.C1, 'manage'), 403);
    });
});

describe('isMeetingStaff', () => {
    it('DEVELOPER and ADMIN of the meeting company only', async () => {
        const m1 = { company_id: 1 };
        expect(isMeetingStaff(await staff(U.DEV), m1)).toBe(true);
        expect(isMeetingStaff(await staff(U.ADMIN_C1), m1)).toBe(true);
        expect(isMeetingStaff(await staff(U.ADMIN_C2), m1)).toBe(false);
        expect(isMeetingStaff(await staff(U.PART_C1_INVITED), m1)).toBe(false);
        expect(isMeetingStaff(await invitee(M.C1, 'tok-accepted', 'guest.ok@ext.test'), m1)).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/* invitees and requireMeetingActor                                    */
/* ------------------------------------------------------------------ */

describe('getInviteeActor', () => {
    it('resolves accepted and not-accepted invitees', async () => {
        expect(await getInviteeActor(M.C1, 'tok-accepted', 'guest.ok@ext.test')).toEqual({
            kind: 'invitee',
            participantId: 102,
            meetingId: M.C1,
            email: 'guest.ok@ext.test',
            accepted: true,
        });
        expect((await getInviteeActor(M.C1, 'tok-pending', 'guest.wait@ext.test'))?.accepted).toBe(false);
        expect((await getInviteeActor(M.C1, 'tok-noinv', 'guest.none@ext.test'))?.accepted).toBe(false);
    });

    it('returns null for missing credentials, wrong pair or wrong meeting', async () => {
        expect(await getInviteeActor(M.C1, null, 'guest.ok@ext.test')).toBeNull();
        expect(await getInviteeActor(M.C1, 'tok-accepted', undefined)).toBeNull();
        expect(await getInviteeActor(M.C1, '', '')).toBeNull();
        expect(await getInviteeActor(M.C1, 'tok-accepted', 'guest.wait@ext.test')).toBeNull();
        expect(await getInviteeActor(M.C1, 'tok-20', 'guest20@ext.test')).toBeNull();
        expect(await getInviteeActor(M.C2, 'tok-accepted', 'guest.ok@ext.test')).toBeNull();
    });

    it('rejects non-string credentials without querying the DB', async () => {
        expect(await getInviteeActor(M.C1, ['tok-accepted'] as unknown as string, 'guest.ok@ext.test')).toBeNull();
        expect(await getInviteeActor(M.C1, 'tok-accepted', { $ne: '' } as unknown as string)).toBeNull();
        expect(prisma.meetings_participants.findFirst).not.toHaveBeenCalled();
    });
});

describe('getInviteeActor on a meeting that is over (N47)', () => {
    it.each(['FINISHED', 'CANCELLED'])('returns null when the meeting is %s', async (status) => {
        db.meetings.find((m) => m.id === M.C1)!.status = status;
        expect(await getInviteeActor(M.C1, 'tok-accepted', 'guest.ok@ext.test')).toBeNull();
    });

    it('still resolves while the meeting is STARTED', async () => {
        db.meetings.find((m) => m.id === M.C1)!.status = 'STARTED';
        expect(await getInviteeActor(M.C1, 'tok-accepted', 'guest.ok@ext.test')).toMatchObject({ participantId: 102 });
    });

    it('requireMeetingActor: 403 meetingEnded for a valid link without a session', async () => {
        db.meetings.find((m) => m.id === M.C1)!.status = 'FINISHED';
        const err = await expectHttp(
            requireMeetingActor(req({ query: { token: 'tok-accepted', email: 'guest.ok@ext.test' } }), M.C1),
            403,
        );
        expect(err.extra).toEqual({ meetingEnded: true });
    });

    it('requireMeetingActor: a wrong pair on a finished meeting is still 401', async () => {
        db.meetings.find((m) => m.id === M.C1)!.status = 'FINISHED';
        await expectHttp(requireMeetingActor(req({ query: { token: 'nope', email: 'guest.ok@ext.test' } }), M.C1), 401);
    });

    it('requireMeetingActor: falls back to the staff session when the link has expired', async () => {
        db.meetings.find((m) => m.id === M.C1)!.status = 'FINISHED';
        const a = await requireMeetingActor(
            req({ token: tokenFor(U.ADMIN_C1), query: { token: 'tok-accepted', email: 'guest.ok@ext.test' } }),
            M.C1,
        );
        expect(a).toMatchObject({ kind: 'staff', userId: U.ADMIN_C1 });
    });
});

describe('readInviteeCredentials', () => {
    it('reads query params, headers win over query', () => {
        expect(readInviteeCredentials(req({ query: { token: 'q', email: 'q@x' } }))).toEqual({ token: 'q', email: 'q@x' });
        expect(
            readInviteeCredentials(
                req({ query: { token: 'q', email: 'q@x' }, headers: { 'x-participant-token': 'h', 'x-participant-email': 'h@x' } }),
            ),
        ).toEqual({ token: 'h', email: 'h@x' });
        expect(readInviteeCredentials(req())).toEqual({ token: null, email: null });
    });
});

describe('requireMeetingActor', () => {
    it('valid invitee credentials win over a staff session (invite link opened while logged in)', async () => {
        const r = req({
            token: tokenFor(U.ADMIN_C1),
            headers: { 'x-participant-token': 'tok-accepted', 'x-participant-email': 'guest.ok@ext.test' },
        });
        const a = await requireMeetingActor(r, M.C1);
        expect(a).toMatchObject({ kind: 'invitee', participantId: 102 });
    });

    it('invalid invitee credentials fall back to the staff session', async () => {
        const r = req({
            token: tokenFor(U.ADMIN_C1),
            headers: { 'x-participant-token': 'nope', 'x-participant-email': 'guest.ok@ext.test' },
        });
        const a = await requireMeetingActor(r, M.C1);
        expect(a).toMatchObject({ kind: 'staff', userId: U.ADMIN_C1 });
    });

    it('staff session is used when no invitee credentials are sent', async () => {
        const a = await requireMeetingActor(req({ token: tokenFor(U.ADMIN_C1) }), M.C1);
        expect(a).toMatchObject({ kind: 'staff', userId: U.ADMIN_C1 });
        expect(prisma.meetings_participants.findFirst).not.toHaveBeenCalled();
    });

    it('resolves an invitee from the query string', async () => {
        const a = await requireMeetingActor(req({ query: { token: 'tok-accepted', email: 'guest.ok@ext.test' } }), M.C1);
        expect(a).toMatchObject({ kind: 'invitee', participantId: 102, accepted: true });
    });

    it('resolves an invitee from x-participant-* headers', async () => {
        const a = await requireMeetingActor(
            req({ headers: { 'x-participant-token': 'tok-pending', 'x-participant-email': 'guest.wait@ext.test' } }),
            M.C1,
        );
        expect(a).toMatchObject({ kind: 'invitee', participantId: 103, accepted: false });
    });

    it('explicit opts.token / opts.email override the request', async () => {
        const a = await requireMeetingActor(req({ query: { token: 'bad', email: 'bad@x' } }), M.C1, {
            token: 'tok-accepted',
            email: 'guest.ok@ext.test',
        });
        expect(a.kind).toBe('invitee');
    });

    it('falls back to invitee when the staff session is invalid', async () => {
        const a = await requireMeetingActor(
            req({ token: tokenFor(U.ADMIN_NOCO), query: { token: 'tok-accepted', email: 'guest.ok@ext.test' } }),
            M.C1,
        );
        expect(a.kind).toBe('invitee');
    });

    it('401 when neither a session nor valid invitee credentials exist', async () => {
        await expectHttp(requireMeetingActor(req(), M.C1), 401);
        await expectHttp(requireMeetingActor(req({ query: { token: 'tok-accepted', email: 'guest.ok@ext.test' } }), M.C2), 401);
        await expectHttp(requireMeetingActor(req({ query: { token: 'nope', email: 'guest.ok@ext.test' } }), M.C1), 401);
    });

    it('requireAccepted: accepted invitee passes', async () => {
        const a = await requireMeetingActor(req({ query: { token: 'tok-accepted', email: 'guest.ok@ext.test' } }), M.C1, {
            requireAccepted: true,
        });
        expect((a as InviteeActor).accepted).toBe(true);
    });

    it('requireAccepted: not-accepted invitee gets 403 with requireAcceptance', async () => {
        const err = await expectHttp(
            requireMeetingActor(req({ query: { token: 'tok-pending', email: 'guest.wait@ext.test' } }), M.C1, {
                requireAccepted: true,
            }),
            403,
        );
        expect(err.extra).toEqual({ requireAcceptance: true });
        const res = httpErrorResponse(err)!;
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ status: false, requireAcceptance: true });
    });

    it('requireAccepted does not apply to staff', async () => {
        const a = await requireMeetingActor(reqAs(U.PART_C1_INVITED), M.C1, { requireAccepted: true });
        expect(a.kind).toBe('staff');
    });

    it('the resolved actor plugs into assertMeetingAccess', async () => {
        const a: Actor = await requireMeetingActor(req({ query: { token: 'tok-20', email: 'guest20@ext.test' } }), M.C2);
        expect((await assertMeetingAccess(a, M.C2, 'read')).id).toBe(M.C2);
        await expectHttp(assertMeetingAccess(a, M.C1, 'read'), 403);
    });
});

/* ------------------------------------------------------------------ */
/* user management ladder                                              */
/* ------------------------------------------------------------------ */

describe('canManageUser', () => {
    const target = (id: number) => {
        const u = db.users.find((x) => x.id === id)!;
        return { id: u.id, role: u.role, company_id: u.company_id };
    };

    it('DEVELOPER manages everyone', async () => {
        const dev = await staff(U.DEV);
        for (const u of db.users) expect(canManageUser(dev, target(u.id))).toBe(true);
    });

    it('ADMIN manages PARTICIPANT users of his own company', async () => {
        const admin = await staff(U.ADMIN_C1);
        expect(canManageUser(admin, target(U.PART_C1_INVITED))).toBe(true);
        expect(canManageUser(admin, target(U.PART_C1_NOT_INVITED))).toBe(true);
    });

    it('ADMIN manages himself', async () => {
        expect(canManageUser(await staff(U.ADMIN_C1), target(U.ADMIN_C1))).toBe(true);
    });

    it('ADMIN cannot manage PARTICIPANT users of other companies or without company', async () => {
        const admin = await staff(U.ADMIN_C1);
        expect(canManageUser(admin, target(U.PART_C2_EMAIL_INVITED))).toBe(false);
        expect(canManageUser(admin, { id: 500, role: 'PARTICIPANT', company_id: null })).toBe(false);
        expect(canManageUser(admin, { id: 501, role: 'PARTICIPANT', company_id: 3 })).toBe(false);
    });

    it('ADMIN cannot manage another ADMIN (same or other company) or a DEVELOPER', async () => {
        const admin = await staff(U.ADMIN_C1);
        expect(canManageUser(admin, { id: 502, role: 'ADMIN', company_id: 1 })).toBe(false);
        expect(canManageUser(admin, target(U.ADMIN_C2))).toBe(false);
        expect(canManageUser(admin, target(U.ADMIN_C3))).toBe(false);
        expect(canManageUser(admin, target(U.DEV))).toBe(false);
        expect(canManageUser(admin, { id: 503, role: null, company_id: 1 })).toBe(false);
    });

    it('ADMIN actor with companyId null manages no other user', () => {
        const forged: StaffActor = { kind: 'staff', userId: U.ADMIN_NOCO, role: 'ADMIN', companyId: null, email: null };
        expect(canManageUser(forged, { id: 504, role: 'PARTICIPANT', company_id: null })).toBe(false);
    });

    it('PARTICIPANT manages only himself', async () => {
        const p = await staff(U.PART_C1_INVITED);
        expect(canManageUser(p, target(U.PART_C1_INVITED))).toBe(true);
        expect(canManageUser(p, target(U.PART_C1_NOT_INVITED))).toBe(false);
        expect(canManageUser(p, target(U.ADMIN_C1))).toBe(false);
        expect(canManageUser(p, target(U.DEV))).toBe(false);
    });
});

describe('assignableRoles', () => {
    it('DEVELOPER may assign every role', async () => {
        expect(assignableRoles(await staff(U.DEV))).toEqual(['DEVELOPER', 'ADMIN', 'PARTICIPANT']);
    });
    it('ADMIN may assign only PARTICIPANT', async () => {
        expect(assignableRoles(await staff(U.ADMIN_C1))).toEqual(['PARTICIPANT']);
    });
    it('PARTICIPANT may assign nothing', async () => {
        expect(assignableRoles(await staff(U.PART_C1_INVITED))).toEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

describe('httpErrorResponse', () => {
    it('maps HttpError to { status:false, message } with its status', async () => {
        for (const [status, msg] of [[401, 'Unauthorized'], [403, 'Forbidden'], [404, 'Meeting not found']] as const) {
            const res = httpErrorResponse(new HttpError(status, msg))!;
            expect(res.status).toBe(status);
            expect(await res.json()).toEqual({ status: false, message: msg });
        }
    });

    it('merges extra fields into the body', async () => {
        const res = httpErrorResponse(new HttpError(409, 'Conflict', { field: 'email' }))!;
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ status: false, message: 'Conflict', field: 'email' });
    });

    it('returns null for non-HttpError values', () => {
        expect(httpErrorResponse(new Error('boom'))).toBeNull();
        expect(httpErrorResponse('x')).toBeNull();
        expect(httpErrorResponse(null)).toBeNull();
    });
});

describe('toPositiveInt', () => {
    it('accepts positive integers and numeric strings', () => {
        expect(toPositiveInt(1)).toBe(1);
        expect(toPositiveInt(42)).toBe(42);
        expect(toPositiveInt('7')).toBe(7);
        expect(toPositiveInt(' 7 ')).toBe(7);
    });

    it('rejects zero, negatives, fractions, NaN and Infinity', () => {
        for (const v of [0, -1, 1.5, NaN, Infinity, '0', '-3', '2.5', 'Infinity']) {
            expect(toPositiveInt(v), String(v)).toBeNull();
        }
    });

    it('rejects empty, blank, non-numeric strings and other types', () => {
        for (const v of ['', '   ', 'abc', '12abc', null, undefined, true, {}, [], [5]]) {
            expect(toPositiveInt(v), JSON.stringify(v)).toBeNull();
        }
    });
});
