/**
 * Per-account login lockout (N45/N11), on top of the per-IP rate limit:
 * after LOGIN_MAX_FAILURES failed logins for the same normalised username/email within
 * LOGIN_WINDOW_MS, that identifier is refused for LOGIN_LOCK_MS (whatever the IP).
 * A successful login clears the counter.
 *
 * Counters live in Redis when it is connected (shared by every instance), else in an
 * in-memory Map with TTL (per process). Keys are SHA-256 hashes of the identifier, so no
 * username or email is stored in Redis or memory.
 */
import crypto from 'crypto';
import { redis, isCacheConnected } from './redis';

export const LOGIN_MAX_FAILURES = 5;
/**
 * Account-wide ceiling. The strict 5-failure lock is keyed on (account, client IP), so a stranger
 * cannot lock the real owner out from another address; this much higher limit keyed on the
 * account alone still stops a distributed guessing attack.
 */
export const LOGIN_ACCOUNT_MAX_FAILURES = 50;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export interface LockState {
    locked: boolean;
    /** Seconds until the lock ends (0 when not locked). */
    retryAfterSeconds: number;
}

interface LocalEntry {
    failures: number;
    windowEndsAt: number;
    lockedUntil: number;
}

const guardGlobal = globalThis as typeof globalThis & { __axiaLoginGuard?: Map<string, LocalEntry> };
const local: Map<string, LocalEntry> = guardGlobal.__axiaLoginGuard ?? new Map<string, LocalEntry>();
if (!guardGlobal.__axiaLoginGuard) {
    guardGlobal.__axiaLoginGuard = local;
    if (typeof setInterval !== 'undefined') {
        const sweep = setInterval(() => {
            const now = Date.now();
            for (const [k, e] of local.entries()) {
                if (e.lockedUntil <= now && e.windowEndsAt <= now) local.delete(k);
            }
        }, 5 * 60 * 1000);
        (sweep as { unref?: () => void }).unref?.();
    }
}

/** Same identifier whatever the case or surrounding spaces ("Admin@X.com " = "admin@x.com"). */
export function normaliseLoginId(id: string): string {
    return id.trim().toLowerCase();
}

function keyOf(id: string): string {
    return crypto.createHash('sha256').update(normaliseLoginId(id)).digest('hex');
}

const useRedis = () => !!redis && isCacheConnected();
const failKey = (k: string) => `login:fail:${k}`;
const lockKey = (k: string) => `login:lock:${k}`;
const NOT_LOCKED: LockState = { locked: false, retryAfterSeconds: 0 };

function lockedFor(ms: number): LockState {
    return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil(ms / 1000)) };
}

function localState(k: string, now: number): LocalEntry | null {
    const e = local.get(k);
    if (!e) return null;
    if (e.lockedUntil <= now && e.windowEndsAt <= now) {
        local.delete(k);
        return null;
    }
    return e;
}

/** Is this identifier currently locked out? */
export async function getLoginLock(id: string): Promise<LockState> {
    const k = keyOf(id);
    if (useRedis()) {
        try {
            const ttl = await redis!.pttl(lockKey(k));
            return ttl > 0 ? lockedFor(ttl) : NOT_LOCKED;
        } catch (err) {
            console.error('Login guard Redis error, falling back to memory:', err);
        }
    }
    const now = Date.now();
    const e = localState(k, now);
    return e && e.lockedUntil > now ? lockedFor(e.lockedUntil - now) : NOT_LOCKED;
}

/** Count one failed login; returns the lock state after counting it. */
export async function recordLoginFailure(id: string, maxFailures = LOGIN_MAX_FAILURES): Promise<LockState> {
    const k = keyOf(id);
    if (useRedis()) {
        try {
            const failures = await redis!.incr(failKey(k));
            if (failures === 1) await redis!.pexpire(failKey(k), LOGIN_WINDOW_MS);
            if (failures >= maxFailures) {
                await redis!.set(lockKey(k), '1', 'PX', LOGIN_LOCK_MS);
                await redis!.del(failKey(k));
                return lockedFor(LOGIN_LOCK_MS);
            }
            return NOT_LOCKED;
        } catch (err) {
            console.error('Login guard Redis error, falling back to memory:', err);
        }
    }
    const now = Date.now();
    let e = localState(k, now);
    if (!e || e.windowEndsAt <= now) {
        e = { failures: 0, windowEndsAt: now + LOGIN_WINDOW_MS, lockedUntil: e?.lockedUntil ?? 0 };
        local.set(k, e);
    }
    e.failures += 1;
    if (e.failures >= maxFailures) {
        e.lockedUntil = now + LOGIN_LOCK_MS;
        e.failures = 0;
        e.windowEndsAt = now; // the lock replaces the window
        return lockedFor(LOGIN_LOCK_MS);
    }
    return NOT_LOCKED;
}

/** Successful login: forget the failures (and any expired lock). */
export async function clearLoginFailures(id: string): Promise<void> {
    const k = keyOf(id);
    if (useRedis()) {
        try {
            await redis!.del(failKey(k), lockKey(k));
            return;
        } catch (err) {
            console.error('Login guard Redis error, falling back to memory:', err);
        }
    }
    local.delete(k);
}

/** Test helper: empty the in-memory store. */
export function resetLoginGuardMemory(): void {
    local.clear();
}
