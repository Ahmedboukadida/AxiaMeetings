import { NextRequest, NextResponse } from 'next/server';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import { getIp, rateLimit } from '@/lib/rate-limit';
import {
    isBlockedAddress,
    isBlockedHostname,
    normalizeImageContentType,
    sniffImageType,
} from '@/lib/ssrf-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/proxy-image?url=<http(s) image url>
 *
 * Public (used by formatLogoUrl for `http://<ip>` logos on the landing page),
 * so it is hardened instead of authenticated (N38):
 * - only http/https, no credentials in the URL, default ports only (80/443/8080/8443)
 * - every DNS answer is checked at connect time (custom `lookup`), so private,
 *   loopback, link-local/metadata, CGNAT, unique-local IPv6 and docker-internal
 *   targets are refused, including via DNS rebinding
 * - redirects followed manually, max 3, each hop re-validated
 * - 5 s overall timeout, 5 MB max body (aborted while streaming)
 * - only png/jpeg/gif/webp/avif/ico, verified by magic bytes (no SVG, no HTML)
 * - served with the sniffed type + nosniff + `CSP: default-src 'none'; sandbox`
 * - rate limited per IP
 */

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

class ProxyError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

/** dns.lookup wrapper that refuses the connection if ANY resolved address is internal. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
        if (err) return callback(err, '', 0);
        const list = Array.isArray(addresses) ? addresses : [];
        if (list.length === 0) return callback(new Error('No address'), '', 0);
        if (list.some((a) => isBlockedAddress(a.address))) {
            return callback(Object.assign(new Error('Blocked address'), { code: 'EBLOCKED' }), '', 0);
        }
        if (options && (options as { all?: boolean }).all) {
            return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
        }
        callback(null, list[0].address, list[0].family);
    });
};

function validateUrl(raw: string): URL {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        throw new ProxyError(400, 'Invalid url');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ProxyError(400, 'Only http and https are allowed');
    if (u.username || u.password) throw new ProxyError(400, 'Credentials in url are not allowed');
    if (!ALLOWED_PORTS.has(u.port)) throw new ProxyError(400, 'Port not allowed');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (isBlockedHostname(host)) throw new ProxyError(403, 'Host not allowed');
    // IP literal hosts skip DNS: check them directly.
    if (/^[\d.]+$/.test(host) || host.includes(':')) {
        if (isBlockedAddress(host)) throw new ProxyError(403, 'Host not allowed');
    }
    return u;
}

interface Fetched {
    status: number;
    location: string | null;
    contentType: string | null;
    body: Buffer;
}

function fetchOnce(url: URL, signal: AbortSignal): Promise<Fetched> {
    return new Promise((resolve, reject) => {
        const mod = url.protocol === 'https:' ? https : http;
        const req = mod.request(
            url,
            {
                method: 'GET',
                lookup: guardedLookup,
                signal,
                headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/x-icon;q=0.9', 'User-Agent': 'AxiaMeetings-ImageProxy/1.0' },
            },
            (res) => {
                const status = res.statusCode || 0;
                const location = typeof res.headers.location === 'string' ? res.headers.location : null;
                const contentType = typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : null;
                if (status >= 300 && status < 400) {
                    res.resume();
                    return resolve({ status, location, contentType, body: Buffer.alloc(0) });
                }
                if (status !== 200) {
                    res.resume();
                    return reject(new ProxyError(502, `Upstream status ${status}`));
                }
                const declared = Number(res.headers['content-length']);
                if (Number.isFinite(declared) && declared > MAX_BYTES) {
                    res.destroy();
                    return reject(new ProxyError(413, 'Image too large'));
                }
                const chunks: Buffer[] = [];
                let total = 0;
                res.on('data', (chunk: Buffer) => {
                    total += chunk.length;
                    if (total > MAX_BYTES) {
                        res.destroy();
                        reject(new ProxyError(413, 'Image too large'));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on('end', () => resolve({ status, location, contentType, body: Buffer.concat(chunks) }));
                res.on('error', () => reject(new ProxyError(signal.aborted ? 504 : 502, signal.aborted ? 'Upstream timeout' : 'Upstream fetch failed')));
            },
        );
        req.on('error', (err: NodeJS.ErrnoException) => {
            if (err?.code === 'EBLOCKED') reject(new ProxyError(403, 'Host not allowed'));
            else if (err?.name === 'AbortError' || err?.name === 'TimeoutError') reject(new ProxyError(504, 'Upstream timeout'));
            else reject(new ProxyError(502, 'Upstream fetch failed'));
        });
        req.end();
    });
}

export async function GET(req: NextRequest) {
    const raw = new URL(req.url).searchParams.get('url');
    if (!raw) return new NextResponse('Missing url parameter', { status: 400 });

    if (!(await rateLimit(`proxy-image:${getIp(req)}`, 60, 60000))) {
        return new NextResponse('Too many requests', { status: 429, headers: { 'Retry-After': '60' } });
    }

    try {
        const signal = AbortSignal.timeout(TIMEOUT_MS);
        let target = validateUrl(raw);
        let result: Fetched | null = null;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            result = await fetchOnce(target, signal);
            if (result.status >= 300 && result.status < 400) {
                if (!result.location || hop === MAX_REDIRECTS) throw new ProxyError(502, 'Too many redirects');
                target = validateUrl(new URL(result.location, target).toString());
                continue;
            }
            break;
        }
        if (!result || result.status !== 200) throw new ProxyError(502, 'Upstream fetch failed');

        if (!normalizeImageContentType(result.contentType)) throw new ProxyError(415, 'Unsupported content type');
        const sniffed = sniffImageType(result.body);
        if (!sniffed) throw new ProxyError(415, 'Not a supported image');

        return new NextResponse(new Uint8Array(result.body), {
            status: 200,
            headers: {
                'Content-Type': sniffed,
                'Content-Length': String(result.body.length),
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "default-src 'none'; sandbox",
                'Content-Disposition': 'inline',
                'Cross-Origin-Resource-Policy': 'same-origin',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (error) {
        if (error instanceof ProxyError) {
            return new NextResponse(error.message, { status: error.status, headers: { 'X-Content-Type-Options': 'nosniff' } });
        }
        console.error('Proxy image error:', (error as Error)?.message || error);
        return new NextResponse('Internal server error fetching image', { status: 500 });
    }
}
