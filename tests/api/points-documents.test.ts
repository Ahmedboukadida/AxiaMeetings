import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/* Company 1 owns meeting 10 (point 100, document 500); company 2 owns meeting 20 (point 200, document 600). */
const db = vi.hoisted(() => ({
    users: {
        1: { id: 1, role: 'DEVELOPER', company_id: null, email: 'dev@axia.test' },
        2: { id: 2, role: 'ADMIN', company_id: 1, email: 'admin@c1.test' },
        3: { id: 3, role: 'PARTICIPANT', company_id: 1, email: 'p@c1.test' },
        4: { id: 4, role: 'ADMIN', company_id: 2, email: 'admin@c2.test' },
    } as Record<number, { id: number; role: string; company_id: number | null; email: string }>,
    meetings: [
        { id: 10, company_id: 1, status: 'SCHEDULED', subject: 'Board C1' },
        { id: 20, company_id: 2, status: 'SCHEDULED', subject: 'Board C2' },
    ],
    points: [
        { id: 100, meeting_id: 10, point: 'P1', parent_id: null },
        { id: 200, meeting_id: 20, point: 'P2', parent_id: null },
    ],
    participants: [{ id: 7, meeting_id: 10, email: 'p@c1.test' }],
    documents: [
        { id: 500, meeting_id: 10 },
        { id: 600, meeting_id: 20 },
    ],
}));

vi.mock('@/lib/auth', async (importOriginal) => {
    // Keep the real tv helpers; only the token parsing is faked (x-test-user header).
    const fake = (req: NextRequest) => {
        const id = Number(req.headers.get('x-test-user'));
        return id ? { userId: id, email: '', role: 'DEVELOPER', companyId: null } : null;
    };
    return {
        ...(await importOriginal<typeof import('@/lib/auth')>()),
        getJwtPayload: vi.fn(fake),
        getAuthenticatedUser: vi.fn(async (req: NextRequest) => fake(req)),
    };
});

vi.mock('@/lib/logger', () => ({ createLog: vi.fn(async () => undefined) }));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        users: { findUnique: vi.fn(async ({ where }: { where: { id: number } }) => db.users[where.id] ?? null) },
        meetings: {
            findUnique: vi.fn(async ({ where }: { where: { id: number } }) => db.meetings.find((m) => m.id === where.id) ?? null),
        },
        meetings_participants: {
            findFirst: vi.fn(async ({ where }: { where: { meeting_id: number; email?: string } }) =>
                db.participants.find((p) => p.meeting_id === where.meeting_id && p.email === where.email) ?? null),
        },
        meetings_points: {
            findFirst: vi.fn(async ({ where }: { where: { id: number; meeting_id: number } }) =>
                db.points.find((p) => p.id === where.id && p.meeting_id === where.meeting_id) ?? null),
            findMany: vi.fn(async (args: unknown) => {
                void args;
                return [];
            }),
            delete: vi.fn(async () => ({})),
        },
        meetings_votes: { deleteMany: vi.fn(async () => ({ count: 0 })) },
        meetings_documents: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data })),
            deleteMany: vi.fn(async ({ where }: { where: { id: number; meeting_id: number } }) => ({
                count: db.documents.filter((d) => d.id === where.id && d.meeting_id === where.meeting_id).length,
            })),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { DELETE as deletePoint, GET as getPoints } from '@/app/api/meetings/[id]/points/route';
import { DELETE as deleteDocument, POST as postDocument } from '@/app/api/meetings/[id]/documents/route';

function req(method: string, user: number | null, body?: unknown, url = 'http://localhost/api/meetings/10/x') {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = String(user);
    return new NextRequest(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const mockOf = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('DELETE /api/meetings/[id]/points', () => {
    it('404 when the point belongs to another meeting, and nothing is deleted', async () => {
        const res = await deletePoint(req('DELETE', 2, { point_id: 200 }), params(10));
        expect(res.status).toBe(404);
        expect(mockOf(prisma.meetings_points.delete)).not.toHaveBeenCalled();
        expect(mockOf(prisma.meetings_votes.deleteMany)).not.toHaveBeenCalled();
    });

    it('403 for an ADMIN of another company', async () => {
        const res = await deletePoint(req('DELETE', 4, { point_id: 100 }), params(10));
        expect(res.status).toBe(403);
    });

    it('403 for a PARTICIPANT', async () => {
        const res = await deletePoint(req('DELETE', 3, { point_id: 100 }), params(10));
        expect(res.status).toBe(403);
    });

    it('deletes a point of the meeting for its ADMIN', async () => {
        const res = await deletePoint(req('DELETE', 2, { point_id: 100 }), params(10));
        expect(res.status).toBe(200);
        expect(mockOf(prisma.meetings_points.delete)).toHaveBeenCalledWith({ where: { id: 100 } });
    });
});

describe('GET /api/meetings/[id]/points', () => {
    const include = () => mockOf(prisma.meetings_points.findMany).mock.calls[0][0].include;

    it('invited PARTICIPANT gets votes without meetings_participant_id', async () => {
        const res = await getPoints(req('GET', 3), params(10));
        expect(res.status).toBe(200);
        expect(include().meetings_votes).toEqual({ select: { id: true, point_id: true, vote: true } });
    });

    it('staff gets the full votes', async () => {
        await getPoints(req('GET', 2), params(10));
        expect(include().meetings_votes).toBe(true);
    });

    it('401 anonymous, 403 other company', async () => {
        expect((await getPoints(req('GET', null), params(10))).status).toBe(401);
        expect((await getPoints(req('GET', 4), params(10))).status).toBe(403);
    });
});

describe('/api/meetings/[id]/documents', () => {
    it('refuses unsafe file_path values', async () => {
        for (const file_path of ['javascript:alert(1)', 'http://evil.test/x.pdf', '//evil.test/x', 'data:text/html,x']) {
            const res = await postDocument(req('POST', 2, { file_title: 'Doc', file_path }), params(10));
            expect(res.status).toBe(400);
        }
        expect(mockOf(prisma.meetings_documents.create)).not.toHaveBeenCalled();
    });

    it('accepts storage and https links', async () => {
        expect((await postDocument(req('POST', 2, { file_title: 'Doc', file_path: '/api/files/a.pdf' }), params(10))).status).toBe(201);
        expect((await postDocument(req('POST', 2, { file_title: 'Doc', file_path: 'https://x.test/a.pdf' }), params(10))).status).toBe(201);
    });

    it('DELETE of a document from another meeting is 404', async () => {
        expect((await deleteDocument(req('DELETE', 2, { document_id: 600 }), params(10))).status).toBe(404);
        expect((await deleteDocument(req('DELETE', 2, { document_id: 500 }), params(10))).status).toBe(200);
    });

    it('ADMIN of another company cannot add documents', async () => {
        const res = await postDocument(req('POST', 4, { file_title: 'Doc', file_path: '/api/files/a.pdf' }), params(10));
        expect(res.status).toBe(403);
    });
});
