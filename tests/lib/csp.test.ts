import { describe, expect, it } from 'vitest';
import { baseSecurityHeaders, buildContentSecurityPolicy, liveKitOrigins, PERMISSIONS_POLICY, siteWebSocketOrigins, webSocketOrigin } from '@/lib/security-headers';

function directive(csp: string, name: string): string[] {
    const d = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `));
    return d ? d.split(/\s+/).slice(1) : [];
}

describe('buildContentSecurityPolicy', () => {
    it('production: no unsafe-eval, strict defaults', () => {
        const csp = buildContentSecurityPolicy({ NODE_ENV: 'production' });
        expect(csp).not.toContain("'unsafe-eval'");
        expect(directive(csp, 'script-src')).toEqual(["'self'", "'unsafe-inline'"]);
        expect(directive(csp, 'object-src')).toEqual(["'none'"]);
        expect(directive(csp, 'frame-ancestors')).toEqual(["'self'"]);
        expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
        expect(directive(csp, 'media-src')).toContain('mediastream:');
        expect(directive(csp, 'connect-src')).toEqual(expect.arrayContaining(["'self'", 'wss://*.livekit.cloud', 'https://*.livekit.cloud']));
    });

    it('development: adds unsafe-eval', () => {
        const csp = buildContentSecurityPolicy({ NODE_ENV: 'development' });
        expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    });

    it('connect-src: no blanket ws:/wss:, only the site origin websocket + LiveKit', () => {
        const csp = buildContentSecurityPolicy({
            NODE_ENV: 'production',
            NEXT_PUBLIC_SITE_URL: 'https://meet.example.com',
            NEXT_PUBLIC_LIVEKIT_URL: 'wss://proj.livekit.cloud',
        });
        expect(directive(csp, 'connect-src')).toEqual([
            "'self'",
            'wss://meet.example.com',
            'https://*.livekit.cloud',
            'wss://*.livekit.cloud',
            'wss://proj.livekit.cloud',
            'https://proj.livekit.cloud',
        ]);
    });

    it('connect-src: localhost ws only in development', () => {
        const prod = directive(buildContentSecurityPolicy({ NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://localhost:3002' }), 'connect-src');
        expect(prod).toContain('ws://localhost:3002');
        expect(prod).not.toContain('ws://localhost:*');
        expect(prod).not.toContain('ws:');
        expect(prod).not.toContain('wss:');
        const dev = directive(buildContentSecurityPolicy({ NODE_ENV: 'development' }), 'connect-src');
        expect(dev).toEqual(expect.arrayContaining(['ws://localhost:*', 'ws://127.0.0.1:*']));
        expect(dev).not.toContain('ws:');
    });

    it('derives ws(s) origins from the site URL and CORS_ORIGINS', () => {
        expect(webSocketOrigin('https://a.example.com/path?q=1')).toBe('wss://a.example.com');
        expect(webSocketOrigin('http://192.168.1.10:3002')).toBe('ws://192.168.1.10:3002');
        expect(webSocketOrigin('ftp://x')).toBeNull();
        expect(webSocketOrigin('not a url')).toBeNull();
        expect(webSocketOrigin(undefined)).toBeNull();
        expect(siteWebSocketOrigins({
            NEXT_PUBLIC_SITE_URL: 'https://meet.example.com',
            CORS_ORIGINS: ' http://192.168.1.10:3002 ,, bad; script-src *',
        })).toEqual(['wss://meet.example.com', 'ws://192.168.1.10:3002']);
    });

    it('includes the configured LiveKit host (wss + https)', () => {
        const csp = buildContentSecurityPolicy({ NODE_ENV: 'production', NEXT_PUBLIC_LIVEKIT_URL: 'wss://lk.example.org:7880' });
        const connect = directive(csp, 'connect-src');
        expect(connect).toContain('wss://lk.example.org:7880');
        expect(connect).toContain('https://lk.example.org:7880');
    });

    it('ignores invalid LiveKit URLs', () => {
        expect(liveKitOrigins(undefined)).toEqual([]);
        expect(liveKitOrigins('not a url')).toEqual([]);
        expect(liveKitOrigins('javascript:alert(1)')).toEqual([]);
        expect(liveKitOrigins('ws://localhost:7880')).toEqual(['ws://localhost:7880', 'http://localhost:7880']);
        const csp = buildContentSecurityPolicy({ NODE_ENV: 'production', NEXT_PUBLIC_LIVEKIT_URL: 'x; script-src *' });
        expect(csp).not.toContain('script-src *');
    });
});

describe('baseSecurityHeaders', () => {
    it('sets the expected headers', () => {
        const h = Object.fromEntries(baseSecurityHeaders().map(({ key, value }) => [key, value]));
        expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
        expect(h['X-Content-Type-Options']).toBe('nosniff');
        expect(h['X-Frame-Options']).toBe('SAMEORIGIN');
        expect(h['Permissions-Policy']).toBe(PERMISSIONS_POLICY);
        expect(PERMISSIONS_POLICY).toContain('camera=(self)');
        expect(PERMISSIONS_POLICY).toContain('geolocation=()');
    });
});
