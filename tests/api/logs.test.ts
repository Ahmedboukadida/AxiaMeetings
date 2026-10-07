import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/** Users by id; the test picks the caller with the x-test-user header. */
const db = vi.hoisted(() => ({
    users: {
        1: { id: 1, role: 'DEVELOPER', company_id: null, email: 'dev@axia.test' },
        2: { id: 2, role: 'ADMIN', company_id: 1, email: 'admin@c1.test' },
        3: { id: 3, role: 'PARTICIPANT', company_id: 1, email: 'p@c1.test' },
    } as Record<number, { id: number; role: string; company_id: number | null; email: string }>,
    companies: new Set([1, 2]),
}));

vi.mock('@/lib/auth', async (importOriginal) => {
    // Keep the real tv helpers; only the token parsing is faked (x-test-user header).
    const fake = (req: NextRequest) => {
        const id = Number(req.headers.get('x-test-user'));
        return id ? { userId: id, email: '', role: 'IGNORED', companyId: 999 } : null;
    };
    return {
        ...(await importOriginal<typeof import('@/lib/auth')>()),
        getJwtPayload: vi.fn(fake),
        getAuthenticatedUser: vi.fn(async (req: NextRequest) => fake(req)),
    };
});

vi.mock('@/lib/prisma', () => ({
    prisma: {
        users: { findUnique: vi.fn(async ({ where }: { where: { id: number } }) => db.users[where.id] ?? null) },
        companies: {
            findUnique: vi.fn(async ({ where }: { where: { id: number } }) => (db.companies.has(where.id) ? { id: where.id } : null)),
        },
        logs: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data })),
            findMany: vi.fn(async () => [
                { id: 1, message: 'm', payload: { password: 'old-leak', ok: 1 }, request: null, response: null },
            ]),
            count: vi.fn(async () => 1),
            deleteMany: vi.fn(async () => ({ count: 1 })),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { DELETE, GET, POST } from '@/app/api/logs/route';

function req(method: string, user: number | null, body?: unknown, url = 'http://localhost/api/logs') {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = String(user);
    return new NextRequest(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const createMock = () => prisma.logs.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('POST /api/logs', () => {
    it('401 without a session', async () => {
        const res = await POST(req('POST', null, { message: 'x' }));
        expect(res.status).toBe(401);
    });

    it('forces company and user from the actor, ignoring a body company_id (ADMIN)', async () => {
        const res = await POST(req('POST', 2, { message: 'hello', company_id: 2, user_id: 1 }));
        expect(res.status).toBe(201);
        const data = createMock().mock.calls[0][0].data;
        expect(data.company_id).toBe(1);
        expect(data.user_id).toBe(2);
    });

    it('forces company from the actor for a PARTICIPANT', async () => {
        await POST(req('POST', 3, { message: 'hello', company_id: 2 }));
        expect(createMock().mock.calls[0][0].data.company_id).toBe(1);
    });

    it('DEVELOPER may target an existing company, not a missing one', async () => {
        await POST(req('POST', 1, { message: 'hello', company_id: 2 }));
        expect(createMock().mock.calls[0][0].data.company_id).toBe(2);
        const bad = await POST(req('POST', 1, { message: 'hello', company_id: 77 }));
        expect(bad.status).toBe(400);
    });

    it('redacts secrets from payload/request/response', async () => {
        await POST(req('POST', 2, { message: 'x', payload: { password: 'p', smtp: { api_key: 'k' }, name: 'n' } }));
        expect(createMock().mock.calls[0][0].data.payload).toEqual({ password: '***', smtp: { api_key: '***' }, name: 'n' });
    });

    it('400 without a message', async () => {
        const res = await POST(req('POST', 2, {}));
        expect(res.status).toBe(400);
    });
});

describe('GET /api/logs', () => {
    it('ADMIN is scoped to his own company whatever companyId says', async () => {
        const res = await GET(req('GET', 2, undefined, 'http://localhost/api/logs?companyId=2'));
        expect(res.status).toBe(200);
        const where = (prisma.logs.findMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
        expect(where).toEqual({ company_id: 1 });
        const json = await res.json();
        expect(json.data[0].payload).toEqual({ password: '***', ok: 1 });
    });

    it('PARTICIPANT gets 403', async () => {
        const res = await GET(req('GET', 3));
        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/logs', () => {
    it('is DEVELOPER only', async () => {
        expect((await DELETE(req('DELETE', 2, { id: 1 }))).status).toBe(403);
        expect((await DELETE(req('DELETE', 1, { id: 1 }))).status).toBe(200);
    });
});
