/**
 * Pure helpers for outbound fetches of user-supplied URLs (N38).
 *
 * - isBlockedAddress(ip): true for any address a server-side fetch must never
 *   reach (loopback, private, link-local / cloud metadata, CGNAT, unique-local
 *   IPv6, multicast, reserved, IPv4-mapped/compat forms of those, ...).
 * - sniffImageType(bytes): detect a raster image type from its magic bytes.
 *
 * No Node-only imports so the functions can be unit-tested in isolation.
 */

/** Parse dotted IPv4 into 4 octets, or null. Only canonical decimal form is accepted. */
function parseIPv4(ip: string): number[] | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    const out: number[] = [];
    for (const p of parts) {
        if (!/^\d{1,3}$/.test(p)) return null;
        const n = Number(p);
        if (n > 255) return null;
        out.push(n);
    }
    return out;
}

function isBlockedIPv4(o: number[]): boolean {
    const [a, b] = o;
    if (a === 0) return true;                          // 0.0.0.0/8 "this network"
    if (a === 10) return true;                         // 10/8 private
    if (a === 127) return true;                        // loopback
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a === 169 && b === 254) return true;           // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16/12 private (docker bridges)
    if (a === 192 && b === 168) return true;           // 192.168/16 private
    if (a === 192 && b === 0 && o[2] === 0) return true;   // 192.0.0/24 IETF protocol assignments
    if (a === 192 && b === 0 && o[2] === 2) return true;   // TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true;  // 198.18/15 benchmarking
    if (a === 198 && b === 51 && o[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && o[2] === 113) return true;  // TEST-NET-3
    if (a >= 224) return true;                         // multicast + reserved + broadcast
    return false;
}

/** Expand an IPv6 string (optionally with embedded IPv4 tail) into 8 16-bit groups, or null. */
function parseIPv6(input: string): number[] | null {
    let ip = input;
    const zone = ip.indexOf('%');
    if (zone !== -1) ip = ip.slice(0, zone);
    if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
    if (!ip.includes(':')) return null;

    let tail: number[] = [];
    const lastColon = ip.lastIndexOf(':');
    const maybeV4 = ip.slice(lastColon + 1);
    if (maybeV4.includes('.')) {
        const v4 = parseIPv4(maybeV4);
        if (!v4) return null;
        tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
        ip = ip.slice(0, lastColon + 1) + '0'; // placeholder group, replaced below
    }

    const halves = ip.split('::');
    if (halves.length > 2) return null;
    const toGroups = (s: string): number[] | null => {
        if (s === '') return [];
        const groups: number[] = [];
        for (const g of s.split(':')) {
            if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
            groups.push(parseInt(g, 16));
        }
        return groups;
    };
    const head = toGroups(halves[0]);
    const rest = halves.length === 2 ? toGroups(halves[1]) : [];
    if (!head || !rest) return null;

    let groups: number[];
    if (halves.length === 2) {
        const fill = 8 - head.length - rest.length;
        if (fill < 1) return null;
        groups = [...head, ...new Array(fill).fill(0), ...rest];
    } else {
        groups = head;
    }
    if (groups.length !== 8) return null;
    if (tail.length) groups.splice(6, 2, ...tail);
    return groups;
}

function isBlockedIPv6(g: number[]): boolean {
    const allZeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
    // :: (unspecified) and ::1 (loopback)
    if (allZeroPrefix(7) && (g[7] === 0 || g[7] === 1)) return true;
    // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d -> judge the IPv4 part
    if (allZeroPrefix(5) && (g[5] === 0xffff || g[5] === 0)) {
        return isBlockedIPv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
    }
    // IPv4-translated ::ffff:0:a.b.c.d
    if (allZeroPrefix(4) && g[4] === 0xffff && g[5] === 0) {
        return isBlockedIPv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
    }
    // NAT64 64:ff9b::/96 -> embedded IPv4
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
        return isBlockedIPv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
    }
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
    if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    if (g[0] === 0x2002) {                         // 6to4 -> embedded IPv4
        return isBlockedIPv4([g[1] >> 8, g[1] & 0xff, g[2] >> 8, g[2] & 0xff]);
    }
    if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard-only 100::/64
    return false;
}

/**
 * True when a resolved IP address must not be fetched server-side.
 * Anything that does not parse as an IP literal is treated as blocked (fail closed).
 */
export function isBlockedAddress(ip: string): boolean {
    if (typeof ip !== 'string' || !ip) return true;
    const v4 = parseIPv4(ip.trim());
    if (v4) return isBlockedIPv4(v4);
    const v6 = parseIPv6(ip.trim());
    if (v6) return isBlockedIPv6(v6);
    return true;
}

/** True when the string is an IPv4 or IPv6 literal (brackets allowed). */
export function isIpLiteral(host: string): boolean {
    return parseIPv4(host) !== null || parseIPv6(host) !== null;
}

/** Hostnames that resolve to internal services regardless of DNS answers. */
const BLOCKED_HOSTNAMES = [
    'localhost',
    'host.docker.internal',
    'gateway.docker.internal',
    'kubernetes.docker.internal',
    'metadata.google.internal',
    'metadata',
];
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa', '.lan'];

export function isBlockedHostname(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/\.$/, '');
    if (!h) return true;
    if (BLOCKED_HOSTNAMES.includes(h)) return true;
    if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
    // Single-label names ("db", "redis", "app") are docker-compose service names.
    if (!h.includes('.') && !isIpLiteral(h)) return true;
    return false;
}

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/x-icon'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Normalize a Content-Type header to one of the allowed image types, or null. */
export function normalizeImageContentType(header: string | null | undefined): AllowedImageType | null {
    if (!header) return null;
    const base = header.split(';', 1)[0].trim().toLowerCase();
    const aliases: Record<string, AllowedImageType> = {
        'image/png': 'image/png',
        'image/jpeg': 'image/jpeg',
        'image/jpg': 'image/jpeg',
        'image/pjpeg': 'image/jpeg',
        'image/gif': 'image/gif',
        'image/webp': 'image/webp',
        'image/avif': 'image/avif',
        'image/x-icon': 'image/x-icon',
        'image/vnd.microsoft.icon': 'image/x-icon',
        'image/ico': 'image/x-icon',
    };
    return aliases[base] ?? null;
}

/** Detect a supported raster image from its first bytes. Never returns SVG/HTML. */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
    const b = bytes;
    const at = (i: number) => (i < b.length ? b[i] : -1);
    const ascii = (start: number, s: string) => {
        for (let i = 0; i < s.length; i++) if (at(start + i) !== s.charCodeAt(i)) return false;
        return true;
    };
    if (at(0) === 0x89 && ascii(1, 'PNG') && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'image/png';
    if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
    if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
    if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
    if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return 'image/avif';
    // ICO: reserved 0, type 1 (icon) or 2 (cursor), count >= 1
    if (at(0) === 0 && at(1) === 0 && (at(2) === 1 || at(2) === 2) && at(3) === 0 && (at(4) > 0 || at(5) > 0)) return 'image/x-icon';
    return null;
}
