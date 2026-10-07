import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
    users: {
        1: { id: 1, role: 'DEVELOPER', company_id: null, email: 'dev@axia.test' },
        2: { id: 2, role: 'ADMIN', company_id: 1, email: 'admin@c1.test' },
    } as Record<number, { id: number; role: string; company_id: number | null; email: string }>,
    token: {
        id: 5,
        provider: 'gemini',
        name: 'main',
        credit_limit: null,
        expiration: new Date('2027-01-01T00:00:00Z'),
        websocket_url: null,
        api_key: 'AIzaSyREALKEY-1234WXYZ',
        api_secret: 'super-secret-value',
        project_name: null,
        project_number: null,
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00Z'),
        usage: [] as unknown[],
    },
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

vi.mock('@/lib/ai-provider', () => ({ invalidateAiKeyCache: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        users: { findUnique: vi.fn(async ({ where }: { where: { id: number } }) => db.users[where.id] ?? null) },
        ia_tokens_keys: {
            findMany: vi.fn(async () => [db.token]),
            findUnique: vi.fn(async ({ where }: { where: { id: number } }) => (where.id === db.token.id ? { id: db.token.id } : null)),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
                const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
                return { ...db.token, ...clean };
            }),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { GET, PUT } from '@/app/api/ai-tokens/route';

function req(method: string, user: number | null, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = String(user);
    return new NextRequest('http://localhost/api/ai-tokens', {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/ai-tokens', () => {
    it('masks api_key and never returns api_secret', async () => {
        const res = await GET(req('GET', 1));
        expect(res.status).toBe(200);
        const json = await res.json();
        const t = json.data[0];
        expect(t.api_key).toBe('************WXYZ');
        expect(t).not.toHaveProperty('api_secret');
        expect(t.api_secret_set).toBe(true);
        expect(JSON.stringify(json)).not.toContain('REALKEY');
        expect(JSON.stringify(json)).not.toContain('super-secret');
    });

    it('is DEVELOPER only', async () => {
        expect((await GET(req('GET', 2))).status).toBe(403);
        expect((await GET(req('GET', null))).status).toBe(401);
    });
});

describe('PUT /api/ai-tokens', () => {
    const updateData = () => (prisma.ia_tokens_keys.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].data;

    it('treats empty or masked secrets as unchanged and keeps expiration on a toggle', async () => {
        const res = await PUT(req('PUT', 1, { id: 5, api_key: '************WXYZ', api_secret: '', is_active: false }));
        expect(res.status).toBe(200);
        const data = updateData();
        expect(data.api_key).toBeUndefined();
        expect(data.api_secret).toBeUndefined();
        expect(data.expiration).toBeUndefined();
        expect(data.is_active).toBe(false);
        const json = await res.json();
        expect(json.data).not.toHaveProperty('api_secret');
        expect(json.data.api_key).not.toContain('REALKEY');
    });

    it('stores a new key when a real value is sent', async () => {
        await PUT(req('PUT', 1, { id: 5, api_key: 'new-key-0000' }));
        expect(updateData().api_key).toBe('new-key-0000');
    });

    it('404 for an unknown token', async () => {
        expect((await PUT(req('PUT', 1, { id: 99, name: 'x' }))).status).toBe(404);
    });
});
