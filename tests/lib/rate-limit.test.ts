import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/redis', () => ({ redis: null, isCacheConnected: () => false }));

import { CLIENT_IP_HEADER, getIp, rateLimit } from '@/lib/rate-limit';

function req(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost/api/auth/login', { headers: new Headers(headers) });
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('getIp without TRUST_PROXY', () => {
    it('ignores X-Forwarded-For and X-Real-IP (client-controlled)', () => {
        vi.stubEnv('TRUST_PROXY', '');
        expect(getIp(req({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' }))).toBe('direct');
    });

    it('uses the socket address set by server.mjs', () => {
        vi.stubEnv('TRUST_PROXY', 'false');
        expect(getIp(req({ [CLIENT_IP_HEADER]: '10.0.0.7', 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.7');
        expect(getIp(req({ [CLIENT_IP_HEADER]: '::ffff:192.168.1.9' }))).toBe('192.168.1.9');
        expect(getIp(req({ [CLIENT_IP_HEADER]: '2001:db8::1' }))).toBe('2001:db8::1');
    });

    it('falls back to one shared bucket for garbage', () => {
        expect(getIp(req({ [CLIENT_IP_HEADER]: 'not an ip; drop table' }))).toBe('direct');
        expect(getIp(req({}))).toBe('direct');
    });
});

describe('getIp with TRUST_PROXY=true', () => {
    it('takes the right-most X-Forwarded-For hop (the one our proxy appended)', () => {
        vi.stubEnv('TRUST_PROXY', 'true');
        // "6.6.6.6" was forged by the client; 203.0.113.5 is what the proxy saw.
        expect(getIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5', [CLIENT_IP_HEADER]: '172.18.0.1' }))).toBe('203.0.113.5');
        expect(getIp(req({ 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5');
    });

    it('falls back to X-Real-IP, then to the socket address', () => {
        vi.stubEnv('TRUST_PROXY', 'true');
        expect(getIp(req({ 'x-real-ip': '198.51.100.2', [CLIENT_IP_HEADER]: '172.18.0.1' }))).toBe('198.51.100.2');
        expect(getIp(req({ [CLIENT_IP_HEADER]: '172.18.0.1' }))).toBe('172.18.0.1');
        expect(getIp(req({ 'x-forwarded-for': 'garbage', [CLIENT_IP_HEADER]: '172.18.0.1' }))).toBe('172.18.0.1');
    });
});

describe('rateLimit (in-memory)', () => {
    it('allows `limit` requests per key, then refuses', async () => {
        const key = `test:${Math.random()}`;
        for (let i = 0; i < 3; i++) expect(await rateLimit(key, 3, 60000)).toBe(true);
        expect(await rateLimit(key, 3, 60000)).toBe(false);
        expect(await rateLimit(`${key}:other`, 3, 60000)).toBe(true);
    });
});
