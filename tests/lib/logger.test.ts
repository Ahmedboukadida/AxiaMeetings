import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
    prisma: { logs: { create: vi.fn(async () => ({ id: 1 })) } },
}));

import { prisma } from '@/lib/prisma';
import { createLog } from '@/lib/logger';

const createMock = () => prisma.logs.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('createLog', () => {
    it('redacts secrets in request, payload and response centrally', async () => {
        await createLog({
            message: 'm',
            request: { headers: { authorization: 'Bearer x', cookie: 'axia=1' } },
            payload: { email: 'a@b.c', password: 'p', nested: { accessToken: 't' } },
            response: { id: 3, api_key: 'k', reset_token: 'r', updated_at: new Date('2026-01-01T00:00:00Z') },
        });
        const data = createMock().mock.calls[0][0].data;
        expect(data.request).toEqual({ headers: { authorization: '***', cookie: '***' } });
        expect(data.payload).toEqual({ email: 'a@b.c', password: '***', nested: { accessToken: '***' } });
        expect(data.response).toEqual({ id: 3, api_key: '***', reset_token: '***', updated_at: '2026-01-01T00:00:00.000Z' });
    });

    it('stores null for missing parts and never throws', async () => {
        await createLog({ message: 'only message' });
        const data = createMock().mock.calls[0][0].data;
        expect(data.payload).toBeNull();
        createMock().mockRejectedValueOnce(new Error('db down'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(createLog({ message: 'x' })).resolves.toBeUndefined();
        spy.mockRestore();
    });
});
