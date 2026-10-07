/**
 * HTML safety helpers.
 * - sanitizeHtml: for AI-generated or user-provided rich text that is stored or
 *   rendered with dangerouslySetInnerHTML (summaries, PVs). Removes scripts,
 *   event handlers, javascript: URLs, iframes, forms, styles with expressions.
 * - escapeHtml: for plain values interpolated into email/PV HTML templates.
 */
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
    'a', 'b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'small', 'sub', 'sup', 'mark',
];

const ALLOWED_ATTR = ['href', 'title', 'colspan', 'rowspan', 'align', 'class', 'style', 'target', 'rel'];

export function sanitizeHtml(dirty: string | null | undefined): string {
    if (!dirty) return '';
    const clean = DOMPurify.sanitize(String(dirty), {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math'],
    });
    return String(clean);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
