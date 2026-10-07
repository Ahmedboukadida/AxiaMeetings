/**
 * Document / link URL guard (N36). Client- and server-safe (no Node imports).
 *
 * A stored document `file_path` may be opened only when it is:
 * - a same-origin storage URL produced by saveUpload (`/api/files/...`), or the
 *   legacy `/uploads/...` form (rewritten to /api/files by next.config.ts), or
 * - an absolute `https:` URL.
 * Everything else (javascript:, data:, vbscript:, blob:, http:, protocol-relative
 * `//host`, backslash tricks, relative paths) is refused.
 */
export function isSafeDocumentUrl(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const v = value.trim();
    if (!v || v.length > 2048) return false;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f\\]/.test(v)) return false;
    if (v.startsWith('/')) {
        if (v.startsWith('//')) return false;
        if (!(v.startsWith('/api/files/') || v.startsWith('/uploads/'))) return false;
        return !v.split(/[?#]/, 1)[0].split('/').some((seg) => seg === '..' || seg === '.');
    }
    try {
        return new URL(v).protocol === 'https:';
    } catch {
        return false;
    }
}
