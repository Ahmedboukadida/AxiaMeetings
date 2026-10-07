/**
 * Safe Prisma `select` shapes: never return password, reset tokens,
 * participant join tokens, API keys/secrets or integration wiring to the browser.
 */
import type { Prisma } from '@prisma/client';

export const USER_PUBLIC_SELECT = {
    id: true,
    fullname: true,
    email: true,
    username: true,
    role: true,
    company_id: true,
    identifiant_extern: true,
    phone: true,
} satisfies Prisma.usersSelect;

/** Participant row without its join token. */
export const PARTICIPANT_PUBLIC_SELECT = {
    id: true,
    email: true,
    meeting_id: true,
} satisfies Prisma.meetings_participantsSelect;

/** Company fields safe for any meeting viewer (no endpoint ids, no schema name). */
export const COMPANY_PUBLIC_SELECT = {
    id: true,
    name: true,
    logo_url: true,
    url: true,
} satisfies Prisma.companiesSelect;

/**
 * Secret detection by key name (case-insensitive, separators ignored):
 * a key is secret when it CONTAINS one of these fragments, e.g. password, smtp_password,
 * accessToken, refresh_token, apiKey, api-key, livekit_api_secret, Authorization, Set-Cookie.
 */
const SECRET_FRAGMENTS = ['password', 'passwd', 'secret', 'token', 'apikey', 'authorization', 'cookie'];

/**
 * Exceptions, deliberately narrow:
 * - AI usage counters (tokens_count, max_tokens, total_tokens, prompt_tokens...) are kept only
 *   when the value is a number — a string under such a key is still masked.
 * - Boolean flags (email_password_set: true, has_token: false) are kept: a boolean leaks nothing.
 * Anything else whose key matches is replaced by '***' whatever its type (objects included).
 */
const TOKEN_COUNTER = /^(max|total|prompt|completion|input|output|candidates|cached)?tokens?(count|used|usage|limit|total|remaining)?$/;

function normaliseKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSecretKey(key: string, value?: unknown): boolean {
    const k = normaliseKey(key);
    if (!SECRET_FRAGMENTS.some((f) => k.includes(f))) return false;
    if (typeof value === 'boolean') return false;
    if (typeof value === 'number' && TOKEN_COUNTER.test(k) && k !== 'token') return false;
    return true;
}

/** Deep copy with secret-looking keys replaced by '***' (createLog applies it to payload/response). */
export function redactSecrets<T>(value: T, depth = 0): T {
    if (value == null || typeof value !== 'object' || value instanceof Date) return value;
    // Too deep to inspect: drop it rather than risk passing a nested secret through.
    if (depth > 8) return '[Truncated]' as unknown as T;
    if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1)) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = isSecretKey(k, v) ? '***' : redactSecrets(v, depth + 1);
    }
    return out as T;
}

/** Show only the last 4 characters of a key. */
export function maskSecret(secret: string | null | undefined): string {
    if (!secret) return '';
    return secret.length <= 4 ? '****' : `${'*'.repeat(Math.min(12, secret.length - 4))}${secret.slice(-4)}`;
}
