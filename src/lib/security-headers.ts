/**
 * Security response headers (N46). Pure functions, no imports, so next.config.ts
 * can load this file directly.
 *
 * Next.js App Router without nonces needs script-src 'unsafe-inline' (inline
 * bootstrap/flight scripts); 'unsafe-eval' is only added in development (React
 * Refresh / HMR). Fonts are self-hosted (next/font/local); AI providers are called
 * server-side only, so they are not in connect-src.
 *
 * connect-src: no blanket ws:/wss:. Socket.IO connects to the page's own origin
 * ('self' covers same-origin ws(s) in CSP3 browsers); the site URL and CORS_ORIGINS
 * are also listed explicitly as ws(s) origins, plus LiveKit. Development adds
 * ws://localhost:* / ws://127.0.0.1:* for HMR.
 */

export interface SecurityHeadersEnv {
    NODE_ENV?: string;
    NEXT_PUBLIC_LIVEKIT_URL?: string;
    NEXT_PUBLIC_SITE_URL?: string;
    CORS_ORIGINS?: string;
}

/** ws(s) origin matching an http(s) site origin, null if unset/invalid. */
export function webSocketOrigin(raw: string | undefined): string | null {
    if (!raw) return null;
    try {
        const u = new URL(raw.trim());
        if (!u.host) return null;
        if (u.protocol === 'https:') return `wss://${u.host}`;
        if (u.protocol === 'http:') return `ws://${u.host}`;
        return null;
    } catch {
        return null;
    }
}

/** Same-origin websocket origins for the site URL and each CORS_ORIGINS entry. */
export function siteWebSocketOrigins(env: SecurityHeadersEnv): string[] {
    const raws = [env.NEXT_PUBLIC_SITE_URL, ...(env.CORS_ORIGINS ?? '').split(',')];
    return raws.map(webSocketOrigin).filter((o): o is string => o !== null);
}

/** wss/https (or ws/http) origins for the configured LiveKit server, [] if unset/invalid. */
export function liveKitOrigins(raw: string | undefined): string[] {
    if (!raw) return [];
    try {
        const u = new URL(raw.trim());
        const host = u.host;
        if (!host) return [];
        if (u.protocol === 'wss:' || u.protocol === 'https:') return [`wss://${host}`, `https://${host}`];
        if (u.protocol === 'ws:' || u.protocol === 'http:') return [`ws://${host}`, `http://${host}`];
        return [];
    } catch {
        return [];
    }
}

export function buildContentSecurityPolicy(env: SecurityHeadersEnv): string {
    const isDev = env.NODE_ENV === 'development';
    const connectSrc = Array.from(new Set([
        "'self'",
        ...siteWebSocketOrigins(env),
        ...(isDev ? ['ws://localhost:*', 'ws://127.0.0.1:*'] : []),
        'https://*.livekit.cloud',
        'wss://*.livekit.cloud',
        ...liveKitOrigins(env.NEXT_PUBLIC_LIVEKIT_URL),
    ]));
    const directives: [string, string[]][] = [
        ['default-src', ["'self'"]],
        ['script-src', ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])]],
        ['style-src', ["'self'", "'unsafe-inline'"]],
        ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
        ['font-src', ["'self'", 'data:']],
        ['connect-src', connectSrc],
        ['media-src', ["'self'", 'blob:', 'mediastream:']],
        ['worker-src', ["'self'", 'blob:']],
        ['frame-src', ["'self'"]],
        ['frame-ancestors', ["'self'"]],
        ['object-src', ["'none'"]],
        ['base-uri', ["'self'"]],
        ['form-action', ["'self'"]],
    ];
    return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

export const PERMISSIONS_POLICY = 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()';

/** Headers for every route (CSP is separate so /api/files keeps its own sandbox CSP). */
export function baseSecurityHeaders(): { key: string; value: string }[] {
    return [
        { key: 'X-DNS-Prefetch-Control', value: 'on' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    ];
}
