/**
 * Signed PV (procès-verbal) access links for meeting participants.
 *
 * Invitees have no account and their join token expires with the meeting, so
 * the PV link carries its own JWT: { purpose: 'pv', meetingId, participantId, email },
 * signed with JWT_SECRET (HS256), valid PV_LINK_TTL_DAYS days (default 90).
 */
import jwt from 'jsonwebtoken';

export const DEFAULT_PV_LINK_TTL_DAYS = 90;
const MAX_PV_LINK_TTL_DAYS = 3650;

export interface PvTokenPayload {
    meetingId: number;
    participantId: number;
    email: string;
}

function secret(): string {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET environment variable is not defined');
    return s;
}

/** PV_LINK_TTL_DAYS env, default 90, clamped to 1..3650. */
export function pvLinkTtlDays(): number {
    const n = Number(process.env.PV_LINK_TTL_DAYS);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_PV_LINK_TTL_DAYS;
    return Math.min(MAX_PV_LINK_TTL_DAYS, Math.max(1, Math.floor(n)));
}

const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

export function signPvToken(payload: PvTokenPayload): string {
    const { meetingId, participantId, email } = payload;
    if (!isPositiveInt(meetingId) || !isPositiveInt(participantId) || typeof email !== 'string' || !email) {
        throw new Error('Invalid PV token payload');
    }
    return jwt.sign({ purpose: 'pv', meetingId, participantId, email }, secret(), {
        algorithm: 'HS256',
        expiresIn: `${pvLinkTtlDays()}d`,
    });
}

/** Payload of a valid, unexpired PV token; null for anything else (wrong purpose, tampered, expired, other alg). */
export function verifyPvToken(token: string | null | undefined): PvTokenPayload | null {
    if (!token || typeof token !== 'string') return null;
    try {
        const decoded = jwt.verify(token, secret(), { algorithms: ['HS256'] });
        if (!decoded || typeof decoded !== 'object') return null;
        const { purpose, meetingId, participantId, email } = decoded as Record<string, unknown>;
        if (purpose !== 'pv') return null;
        if (!isPositiveInt(meetingId) || !isPositiveInt(participantId) || typeof email !== 'string' || !email) return null;
        return { meetingId, participantId, email };
    } catch {
        return null;
    }
}

/** Absolute public URL of the PV page for this token. Throws when NEXT_PUBLIC_SITE_URL is not set. */
export function buildPvUrl(meetingId: number, token: string): string {
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
    if (!site) throw new Error('NEXT_PUBLIC_SITE_URL is not configured');
    return `${site}/meetings/${encodeURIComponent(String(meetingId))}/pv?t=${encodeURIComponent(token)}`;
}
