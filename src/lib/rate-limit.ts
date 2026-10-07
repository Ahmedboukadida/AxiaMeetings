import { NextRequest } from 'next/server';
import { redis, isCacheConnected } from './redis';

interface RateLimiter {
    tokens: number;
    lastRefill: number;
}

// One limiter map + one cleanup timer per process (shared by every bundled copy).
const rlGlobal = globalThis as typeof globalThis & { __axiaRateLimiters?: Map<string, RateLimiter> };
const limiters: Map<string, RateLimiter> = rlGlobal.__axiaRateLimiters ?? new Map<string, RateLimiter>();

// Periodic cleanup to avoid memory leak (never keeps the process alive)
if (typeof setInterval !== 'undefined' && !rlGlobal.__axiaRateLimiters) {
    rlGlobal.__axiaRateLimiters = limiters;
    const sweep = setInterval(() => {
        const now = Date.now();
        // Clear limiters older than 10 minutes
        for (const [key, value] of limiters.entries()) {
            if (now - value.lastRefill > 10 * 60 * 1000) {
                limiters.delete(key);
            }
        }
    }, 5 * 60 * 1000); // run every 5 minutes
    (sweep as { unref?: () => void }).unref?.();
}

// In-memory token bucket rate limiter fallback
function rateLimitLocal(ip: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    let limiter = limiters.get(ip);

    if (!limiter) {
        limiter = { tokens: limit, lastRefill: now };
        limiters.set(ip, limiter);
    }

    const elapsed = now - limiter.lastRefill;
    const tokensToAdd = Math.floor((elapsed / windowMs) * limit);
    if (tokensToAdd > 0) {
        limiter.tokens = Math.min(limit, limiter.tokens + tokensToAdd);
        limiter.lastRefill = now;
    }

    if (limiter.tokens > 0) {
        limiter.tokens--;
        return true;
    }

    return false;
}

/**
 * Check if the request IP has exceeded its limit.
 * @param ip IP address of request
 * @param limit Max requests allowed in window
 * @param windowMs Time window in milliseconds
 * @returns Promise<boolean> true if allowed, false if rate limited
 */
export async function rateLimit(ip: string, limit: number = 60, windowMs: number = 60000): Promise<boolean> {
    if (!redis || !isCacheConnected()) {
        return rateLimitLocal(ip, limit, windowMs);
    }
    try {
        const key = `ratelimit:${ip}:${Math.floor(Date.now() / windowMs)}`;
        const current = await redis.incr(key);
        if (current === 1) {
            await redis.pexpire(key, windowMs);
        }
        return current <= limit;
    } catch (err) {
        console.error('Redis rate limit error, falling back to local:', err);
        return rateLimitLocal(ip, limit, windowMs);
    }
}

/** Header set by server.mjs from the TCP socket address (any incoming copy is stripped there). */
export const CLIENT_IP_HEADER = 'x-axia-client-ip';

/** Bucket used when no trustworthy address is known (e.g. `next dev` without server.mjs). */
const DIRECT_BUCKET = 'direct';

function cleanIp(value: string | null | undefined): string | null {
    if (!value) return null;
    let ip = value.trim();
    if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7); // IPv4-mapped IPv6
    return ip.length > 0 && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

/**
 * Client address used as the rate-limit key (N11/N45).
 *
 * - TRUST_PROXY=true (the app sits behind ONE reverse proxy that appends the client
 *   address to X-Forwarded-For, e.g. nginx `$proxy_add_x_forwarded_for`, Caddy, Traefik):
 *   the RIGHT-MOST X-Forwarded-For entry, i.e. the address our own proxy saw. Left-hand
 *   entries are written by the client and can be forged, so they are never used. Falls
 *   back to X-Real-IP, then to the socket address.
 * - Otherwise forwarding headers are ignored (anyone could send them): the socket address
 *   that server.mjs puts in x-axia-client-ip, else one shared 'direct' bucket.
 */
export function getIp(req: NextRequest): string {
    if (process.env.TRUST_PROXY === 'true') {
        const forwarded = req.headers.get('x-forwarded-for');
        if (forwarded) {
            const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
            const last = cleanIp(hops[hops.length - 1]);
            if (last) return last;
        }
        const realIp = cleanIp(req.headers.get('x-real-ip'));
        if (realIp) return realIp;
    }
    return cleanIp(req.headers.get(CLIENT_IP_HEADER)) ?? DIRECT_BUCKET;
}
