import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Redis disabled: exercise the in-memory path.
vi.mock('@/lib/redis', () => ({ redis: null, isCacheConnected: () => false }));

import {
    LOGIN_LOCK_MS,
    LOGIN_MAX_FAILURES,
    LOGIN_WINDOW_MS,
    clearLoginFailures,
    getLoginLock,
    normaliseLoginId,
    recordLoginFailure,
    resetLoginGuardMemory,
} from '@/lib/login-guard';

beforeEach(() => {
    resetLoginGuardMemory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

async function fail(id: string, times: number) {
    let last = { locked: false, retryAfterSeconds: 0 };
    for (let i = 0; i < times; i++) last = await recordLoginFailure(id);
    return last;
}

describe('login guard (in-memory)', () => {
    it('normalises identifiers', () => {
        expect(normaliseLoginId('  Admin@Axia.TEST ')).toBe('admin@axia.test');
    });

    it('locks after 5 failures within the window, case-insensitively', async () => {
        expect(LOGIN_MAX_FAILURES).toBe(5);
        expect(await fail('alice@x.test', 4)).toEqual({ locked: false, retryAfterSeconds: 0 });
        expect((await getLoginLock('alice@x.test')).locked).toBe(false);
        const fifth = await recordLoginFailure('ALICE@x.test ');
        expect(fifth.locked).toBe(true);
        expect(fifth.retryAfterSeconds).toBe(LOGIN_LOCK_MS / 1000);
        expect((await getLoginLock('alice@x.test')).locked).toBe(true);
    });

    it('does not lock other identifiers', async () => {
        await fail('alice@x.test', 5);
        expect((await getLoginLock('bob@x.test')).locked).toBe(false);
    });

    it('the lock ends after 15 minutes', async () => {
        await fail('alice', 5);
        vi.advanceTimersByTime(LOGIN_LOCK_MS - 1000);
        const l = await getLoginLock('alice');
        expect(l).toEqual({ locked: true, retryAfterSeconds: 1 });
        vi.advanceTimersByTime(1000);
        expect((await getLoginLock('alice')).locked).toBe(false);
        // counting starts again from zero
        expect((await fail('alice', 4)).locked).toBe(false);
    });

    it('failures older than the window are forgotten', async () => {
        await fail('alice', 4);
        vi.advanceTimersByTime(LOGIN_WINDOW_MS + 1);
        expect((await fail('alice', 4)).locked).toBe(false);
        expect((await recordLoginFailure('alice')).locked).toBe(true);
    });

    it('a successful login resets the counter', async () => {
        await fail('alice', 4);
        await clearLoginFailures('Alice');
        expect((await fail('alice', 4)).locked).toBe(false);
    });
});
