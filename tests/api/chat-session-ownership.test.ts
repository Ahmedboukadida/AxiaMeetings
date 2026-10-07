import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/** Callers by id (x-test-user header) and chat sessions by session_id. */
const db = vi.hoisted(() => ({
    actors: {
        1: { userId: 1, role: 'DEVELOPER', companyId: null },
        2: { userId: 2, role: 'ADMIN', companyId: 1 },
        3: { userId: 3, role: 'PARTICIPANT', companyId: 1 },
    } as Record<number, { userId: number; role: string; companyId: number | null }>,
    sessions: {} as Record<string, { user_id: number | null }>,
}));

vi.mock('@/lib/authz', () => ({
    getStaffActor: vi.fn(async (req: NextRequest) => db.actors[Number(req.headers.get('x-test-user'))] ?? null),
    assertMeetingAccess: vi.fn(async () => { throw new Error('no'); }),
    toPositiveInt: (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null),
}));

vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => true), getIp: () => '127.0.0.1' }));
vi.mock('@/lib/logger', () => ({ createLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/ai-provider', () => ({
    getStreamingClients: vi.fn(async () => []),
    trackUsage: vi.fn(async () => undefined),
    generateWithRetry: vi.fn(async () => 'hello there'),
    getChatResponse: vi.fn(async () => 'hello there'),
    groqChatWithModelFallback: vi.fn(),
    groqModelParams: () => ({}),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        app_settings: { findFirst: vi.fn(async () => null) },
        users: { findUnique: vi.fn(async () => null) },
        companies: { findUnique: vi.fn(async () => null) },
        meetings: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
        chat_sessions: {
            findUnique: vi.fn(async ({ where }: { where: { session_id: string } }) => db.sessions[where.session_id] ?? null),
            updateMany: vi.fn(async () => ({ count: 1 })),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data })),
            update: vi.fn(async () => ({})),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/chat/route';

const OWNED = 'owned-by-user-3-0000';
const ANON = 'anonymous-session-0000';

function chat(user: number | null, sessionId: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = String(user);
    return new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, locale: 'en', messages: [{ role: 'user', content: 'hi' }] }),
    });
}

const sessions = prisma.chat_sessions as unknown as Record<'updateMany' | 'create', ReturnType<typeof vi.fn>>;

beforeEach(() => {
    vi.clearAllMocks();
    db.sessions = { [OWNED]: { user_id: 3 }, [ANON]: { user_id: null } };
});

describe('POST /api/chat session ownership', () => {
    it('refuses another logged-in user writing into an owned session', async () => {
        const res = await POST(chat(2, OWNED));
        expect(res.status).toBe(403);
        expect(sessions.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an anonymous caller taking over an owned session', async () => {
        const res = await POST(chat(null, OWNED));
        expect(res.status).toBe(403);
    });

    it('refuses a logged-in user writing into an anonymous session', async () => {
        const res = await POST(chat(3, ANON));
        expect(res.status).toBe(403);
    });

    it('lets the owner continue the session, without changing its owner', async () => {
        const res = await POST(chat(3, OWNED));
        expect(res.status).toBe(200);
        await res.text();
        expect(sessions.updateMany).toHaveBeenCalledTimes(1);
        const arg = sessions.updateMany.mock.calls[0][0];
        expect(arg.where).toEqual({ session_id: OWNED, user_id: 3 });
        expect(arg.data.user_id).toBeUndefined();
    });

    it('lets a DEVELOPER write without taking ownership', async () => {
        const res = await POST(chat(1, OWNED));
        expect(res.status).toBe(200);
        await res.text();
        const arg = sessions.updateMany.mock.calls[0][0];
        expect(arg.where).toEqual({ session_id: OWNED, user_id: 3 });
        expect(arg.data.user_id).toBeUndefined();
        expect(arg.data.role).toBeUndefined();
    });

    it('lets an anonymous caller continue an anonymous session', async () => {
        const res = await POST(chat(null, ANON));
        expect(res.status).toBe(200);
        await res.text();
        expect(sessions.updateMany.mock.calls[0][0].where).toEqual({ session_id: ANON, user_id: null });
    });

    it('creates an unknown session for the caller', async () => {
        const res = await POST(chat(3, 'brand-new-session-id'));
        expect(res.status).toBe(200);
        await res.text();
        expect(sessions.create).toHaveBeenCalledTimes(1);
        expect(sessions.create.mock.calls[0][0].data).toMatchObject({ session_id: 'brand-new-session-id', user_id: 3 });
    });

    it('rejects a missing or malformed sessionId', async () => {
        expect((await POST(chat(null, 'short'))).status).toBe(400);
    });
});
