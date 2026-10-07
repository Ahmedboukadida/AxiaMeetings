import { describe, it, expect, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { signPvToken, verifyPvToken, buildPvUrl, pvLinkTtlDays, DEFAULT_PV_LINK_TTL_DAYS } from '@/lib/pv-link';

const payload = { meetingId: 12, participantId: 34, email: 'invitee@example.com' };

describe('pv-link', () => {
    const env = { ...process.env };
    afterEach(() => {
        process.env = { ...env };
        vi.useRealTimers();
    });

    it('sign/verify roundtrip', () => {
        const token = signPvToken(payload);
        expect(verifyPvToken(token)).toEqual(payload);
        const decoded = jwt.decode(token, { complete: true }) as any;
        expect(decoded.header.alg).toBe('HS256');
        expect(decoded.payload.purpose).toBe('pv');
    });

    it('uses PV_LINK_TTL_DAYS (default 90)', () => {
        delete process.env.PV_LINK_TTL_DAYS;
        expect(pvLinkTtlDays()).toBe(DEFAULT_PV_LINK_TTL_DAYS);
        process.env.PV_LINK_TTL_DAYS = 'abc';
        expect(pvLinkTtlDays()).toBe(90);
        process.env.PV_LINK_TTL_DAYS = '7';
        const decoded = jwt.decode(signPvToken(payload)) as any;
        expect(decoded.exp - decoded.iat).toBe(7 * 24 * 3600);
    });

    it('rejects a token with another purpose (e.g. a session JWT)', () => {
        const secret = process.env.JWT_SECRET as string;
        expect(verifyPvToken(jwt.sign({ ...payload, purpose: 'session' }, secret))).toBeNull();
        expect(verifyPvToken(jwt.sign({ userId: 1, email: 'a@b.c', role: 'ADMIN' }, secret))).toBeNull();
    });

    it('rejects an expired token', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        process.env.PV_LINK_TTL_DAYS = '1';
        const token = signPvToken(payload);
        vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
        expect(verifyPvToken(token)).toBeNull();
    });

    it('rejects tampered tokens, other secrets and other algorithms', () => {
        const token = signPvToken(payload);
        const [h, , s] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ ...payload, participantId: 99, purpose: 'pv' })).toString('base64url');
        expect(verifyPvToken(`${h}.${forged}.${s}`)).toBeNull();
        expect(verifyPvToken(token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa'))).toBeNull();
        expect(verifyPvToken(jwt.sign({ ...payload, purpose: 'pv' }, 'other-secret'))).toBeNull();
        expect(verifyPvToken(jwt.sign({ ...payload, purpose: 'pv' }, process.env.JWT_SECRET as string, { algorithm: 'HS512' }))).toBeNull();
        const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...payload, purpose: 'pv' })).toString('base64url')}.`;
        expect(verifyPvToken(none)).toBeNull();
        expect(verifyPvToken('')).toBeNull();
        expect(verifyPvToken(null)).toBeNull();
    });

    it('rejects malformed payloads', () => {
        const secret = process.env.JWT_SECRET as string;
        expect(verifyPvToken(jwt.sign({ purpose: 'pv', meetingId: '12', participantId: 34, email: 'x@y.z' }, secret))).toBeNull();
        expect(() => signPvToken({ meetingId: 0, participantId: 1, email: 'x@y.z' })).toThrow();
    });

    it('buildPvUrl uses NEXT_PUBLIC_SITE_URL and encodes the token', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://meet.example.com/';
        expect(buildPvUrl(5, 'a.b+c/d')).toBe('https://meet.example.com/meetings/5/pv?t=a.b%2Bc%2Fd');
        delete process.env.NEXT_PUBLIC_SITE_URL;
        expect(() => buildPvUrl(5, 'x')).toThrow();
    });
});
