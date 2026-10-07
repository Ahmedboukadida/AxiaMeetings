import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/authz', async () => {
    const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
    return {
        ...actual,
        requireUser: vi.fn(async () => ({ userId: 2, role: 'ADMIN', companyId: 1 })),
        assertMeetingAccess: vi.fn(async () => undefined),
    };
});
vi.mock('@/lib/logger', () => ({ createLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/push', () => ({ dispatchMeetingPush: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
    prisma: {
        meetings_documents: { findMany: vi.fn(async () => []) },
        meetings: {
            findUnique: vi.fn(async () => ({ status: 'PLANNED', company_id: 1, date: '2099-01-01', time: '10:00' })),
            update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 7, ...data })),
        },
    },
}));

import { prisma } from '@/lib/prisma';
import { PUT } from '@/app/api/meetings/[id]/route';

const update = prisma.meetings.update as unknown as ReturnType<typeof vi.fn>;

function put(body: unknown) {
    return PUT(
        new NextRequest('http://localhost/api/meetings/7', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: '7' }) },
    );
}

beforeEach(() => vi.clearAllMocks());

describe('PUT /api/meetings/[id] summary', () => {
    it('sanitizes the summary HTML before saving', async () => {
        const res = await put({ summary: '<p onclick="x()">ok<script>alert(1)</script><img src=x onerror=alert(1)></p>' });
        expect(res.status).toBe(200);
        const saved = String(update.mock.calls[0][0].data.summary);
        expect(saved).toContain('ok');
        expect(saved).not.toMatch(/script|onerror|onclick/i);
    });

    it('keeps an explicit null and leaves summary untouched when absent', async () => {
        await put({ summary: null });
        expect(update.mock.calls[0][0].data.summary).toBeNull();
        await put({ subject: 'x' });
        expect('summary' in update.mock.calls[1][0].data).toBe(false);
    });
});
