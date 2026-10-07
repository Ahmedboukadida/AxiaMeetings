/**
 * Runtime upload storage (N9 / N2 / N21).
 *
 * Files written at runtime (meeting documents, generated PVs, branding files)
 * live OUTSIDE `public/` because Next.js only serves `public/` assets that
 * existed at build time, and container rebuilds wipe them. In Docker the
 * runner sets `UPLOAD_DIR=/data/uploads` (a volume); locally it defaults to
 * `<cwd>/storage/uploads`.
 *
 * A "key" is a relative POSIX path inside UPLOAD_DIR, e.g. `pvs/123-ab-pv.docx`.
 * Public URL for a key: `/api/files/<key>` (served by src/app/api/files/[...path]).
 * Legacy URLs `/uploads/<key>` (stored in existing DB rows) are still accepted
 * by keyFromUrl/deleteUpload and rewritten by next.config.ts.
 *
 * Server-only module (uses `fs`). Do not import from client components.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type UploadArea = 'meetings' | 'pvs';

export const UPLOAD_DIR = path.resolve(/* turbopackIgnore: true */
    process.env.UPLOAD_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), 'storage', 'uploads')
);

/** Read-only fallback for files written before the move (old `public/uploads`). */
export const LEGACY_UPLOAD_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'public', 'uploads');

export const FILES_URL_PREFIX = '/api/files/';
const LEGACY_URL_PREFIX = '/uploads/';

/** Extension -> Content-Type. Also the allow-list for new uploads. */
export const CONTENT_TYPES: Record<string, string> = {
    // documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',
    rtf: 'application/rtf',
    txt: 'text/plain; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    zip: 'application/zip',
    // images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    // audio / video (meeting recordings)
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    heic: 'image/heic',
    // mail / archives
    eml: 'message/rfc822',
    msg: 'application/vnd.ms-outlook',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
};

/** Types that can execute script when rendered on our origin. Served with `CSP: sandbox`. */
export const ACTIVE_CONTENT_EXTENSIONS = new Set(['html', 'htm', 'svg']);

export class UploadError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
        this.name = 'UploadError';
    }
}

export function extensionOf(name: string): string {
    const ext = path.posix.extname(name).slice(1).toLowerCase();
    return ext;
}

export function contentTypeFor(name: string): string {
    return CONTENT_TYPES[extensionOf(name)] || 'application/octet-stream';
}

export function isAllowedUploadName(originalName: string): boolean {
    const ext = extensionOf(originalName || '');
    return !!ext && Object.prototype.hasOwnProperty.call(CONTENT_TYPES, ext);
}

/**
 * Validate a key and return its normalized segments, or null if unsafe.
 * Rejects: empty, absolute paths, backslashes, NUL/control chars, `.`/`..`
 * segments, hidden (dot-prefixed) segments and empty segments (`a//b`).
 */
function keySegments(key: unknown): string[] | null {
    if (typeof key !== 'string' || key.length === 0 || key.length > 1024) return null;
    if (key.includes('\\')) return null;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(key)) return null;
    if (key.startsWith('/') || path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) return null;
    const segments = key.split('/');
    for (const seg of segments) {
        if (seg === '' || seg === '.' || seg === '..' || seg.startsWith('.')) return null;
    }
    return segments;
}

export function isValidKey(key: unknown): key is string {
    return keySegments(key) !== null;
}

function resolveInside(root: string, key: string): string | null {
    const segments = keySegments(key);
    if (!segments) return null;
    const resolved = path.resolve(/* turbopackIgnore: true */ root, ...segments);
    if (!resolved.startsWith(root + path.sep)) return null;
    return resolved;
}

/**
 * Absolute path for a key inside UPLOAD_DIR. Throws UploadError(400) if the key
 * is unsafe. Does not check existence.
 */
export function resolveUploadPath(key: string): string {
    const resolved = resolveInside(UPLOAD_DIR, key);
    if (!resolved) throw new UploadError('Invalid file path', 400);
    return resolved;
}

/**
 * Path of an existing regular file for `key`: UPLOAD_DIR first, then the
 * legacy `public/uploads` folder (read-only, transition period).
 * Returns null if the key is unsafe or nothing exists. Symlinks escaping the
 * root are rejected.
 */
export async function findUploadFile(key: string): Promise<string | null> {
    for (const root of [UPLOAD_DIR, LEGACY_UPLOAD_DIR]) {
        const candidate = resolveInside(root, key);
        if (!candidate) return null;
        try {
            const real = await fsp.realpath(/* turbopackIgnore: true */ candidate);
            const realRoot = await fsp.realpath(/* turbopackIgnore: true */ root).catch(() => root);
            if (!real.startsWith(realRoot + path.sep)) continue;
            const st = await fsp.stat(/* turbopackIgnore: true */ real);
            if (st.isFile()) return real;
        } catch {
            /* not found in this root */
        }
    }
    return null;
}

/** `/api/files/<key>` with each segment URL-encoded. */
export function uploadUrl(key: string): string {
    const segments = keySegments(key);
    if (!segments) throw new UploadError('Invalid file key', 400);
    return FILES_URL_PREFIX + segments.map(encodeURIComponent).join('/');
}

/**
 * Extract the storage key from `/api/files/<key>` or legacy `/uploads/<key>`.
 * Query strings and fragments are ignored; segments are URL-decoded once.
 * Returns null for anything else (absolute URLs, unsafe keys, bad encoding).
 */
export function keyFromUrl(url: string | null | undefined): string | null {
    if (typeof url !== 'string') return null;
    const p = url.trim().split(/[?#]/, 1)[0];
    let rest: string;
    if (p.startsWith(FILES_URL_PREFIX)) rest = p.slice(FILES_URL_PREFIX.length);
    else if (p.startsWith(LEGACY_URL_PREFIX)) rest = p.slice(LEGACY_URL_PREFIX.length);
    else return null;
    let decoded: string[];
    try {
        // decode per segment so an encoded "/" (%2F) cannot create new segments
        decoded = rest.split('/').map((s) => decodeURIComponent(s));
    } catch {
        return null;
    }
    if (decoded.some((s) => s.includes('/'))) return null;
    const key = decoded.join('/');
    return isValidKey(key) ? key : null;
}

function sanitizeBaseName(originalName: string): string {
    const base = path.posix.basename(String(originalName || '').replace(/\\/g, '/'));
    const withoutExt = base.slice(0, base.length - path.posix.extname(base).length);
    const cleaned = withoutExt
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, 60);
    return cleaned || 'file';
}

/**
 * Save a file under `<UPLOAD_DIR>/<area>/` with a generated, collision-free name:
 * `<timestamp>-<random>-<sanitized base>.<allow-listed ext>`.
 * Throws UploadError(400) when the extension is not allowed.
 */
/** Max size of one uploaded file (N42). `UPLOAD_MAX_BYTES` env, default 25 MB. */
export const DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export function maxUploadBytes(): number {
    const n = Number(process.env.UPLOAD_MAX_BYTES);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_UPLOAD_MAX_BYTES;
}

/** Throw a 413 UploadError when `size` bytes exceeds the configured cap. */
export function assertUploadSize(size: number): void {
    const max = maxUploadBytes();
    if (size > max) {
        throw new UploadError(`File too large (max ${Math.round(max / (1024 * 1024))} MB)`, 413);
    }
}

export async function saveUpload(
    area: UploadArea,
    originalName: string,
    data: Buffer | string
): Promise<{ key: string; url: string; fileName: string }> {
    if (area !== 'meetings' && area !== 'pvs') throw new UploadError('Invalid upload area', 400);
    const ext = extensionOf(originalName || '');
    if (!isAllowedUploadName(originalName)) {
        throw new UploadError(`File type not allowed${ext ? `: .${ext}` : ''}`, 400);
    }
    assertUploadSize(typeof data === 'string' ? Buffer.byteLength(data) : data.length);
    const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${sanitizeBaseName(originalName)}.${ext}`;
    const key = `${area}/${fileName}`;
    const target = resolveUploadPath(key);
    await fsp.mkdir(/* turbopackIgnore: true */ path.dirname(target), { recursive: true });
    await fsp.writeFile(/* turbopackIgnore: true */ target, data, { flag: 'wx' });
    return { key, url: uploadUrl(key), fileName };
}

/**
 * Delete a stored file by key, `/api/files/...` URL or legacy `/uploads/...` URL.
 * Only ever touches files inside UPLOAD_DIR (legacy `public/uploads` is read-only).
 * Never throws for missing/unsafe input; returns true if a file was removed.
 */
export async function deleteUpload(keyOrUrl: string | null | undefined): Promise<boolean> {
    if (!keyOrUrl) return false;
    const key = keyFromUrl(keyOrUrl) ?? (isValidKey(keyOrUrl) ? keyOrUrl : null);
    if (!key) return false;
    const target = resolveInside(UPLOAD_DIR, key);
    if (!target) return false;
    try {
        const st = await fsp.lstat(/* turbopackIgnore: true */ target);
        if (!st.isFile()) return false;
        await fsp.unlink(/* turbopackIgnore: true */ target);
        return true;
    } catch (err: any) {
        if (err?.code !== 'ENOENT') console.error('deleteUpload failed:', err?.message || err);
        return false;
    }
}

/**
 * Read a local asset referenced by a logo/branding value (used by PV export).
 * Accepts `/api/files/<key>`, `/uploads/<key>`, bare upload keys, or a path
 * under `public/` (e.g. `/images/x.png`, `/AxiaMeetings.svg`), all guarded.
 */
export async function readLocalAsset(ref: string | null | undefined): Promise<Buffer | null> {
    if (!ref) return null;
    const value = ref.trim();
    const key = keyFromUrl(value) ?? (isValidKey(value) ? value : null);
    if (key) {
        const file = await findUploadFile(key);
        if (file) return fsp.readFile(/* turbopackIgnore: true */ file);
    }
    const publicRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'public');
    // Bare static image name (public/images, see STATIC_IMAGE_NAMES in lib/utils)
    const relative = value.startsWith('/') ? value.split(/[?#]/, 1)[0].slice(1) : value === 'AxiaMeetings.svg' ? 'AxiaMeetings.svg' : key && !key.includes('/') ? `images/${key}` : null;
    if (relative) {
        const file = resolveInside(publicRoot, relative);
        if (file && fs.existsSync(/* turbopackIgnore: true */ file) && fs.statSync(/* turbopackIgnore: true */ file).isFile()) return fsp.readFile(/* turbopackIgnore: true */ file);
    }
    return null;
}
