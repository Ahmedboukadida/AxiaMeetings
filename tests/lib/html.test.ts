import { describe, expect, it } from 'vitest';
import { escapeHtml, sanitizeHtml } from '@/lib/html';

describe('sanitizeHtml', () => {
    it('keeps basic formatting and tables', () => {
        const out = sanitizeHtml('<h2>PV</h2><p><strong>OK</strong></p><table><tr><td colspan="2">x</td></tr></table>');
        expect(out).toContain('<h2>PV</h2>');
        expect(out).toContain('<strong>OK</strong>');
        expect(out).toContain('colspan="2"');
    });

    it('removes scripts, handlers and javascript: urls', () => {
        const out = sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a><iframe src="//e"></iframe>');
        expect(out).not.toMatch(/script|onerror|onclick|javascript:|iframe|<img/i);
        expect(out).toContain('<p>a</p>');
    });

    it('handles null/empty', () => {
        expect(sanitizeHtml(null)).toBe('');
        expect(sanitizeHtml('')).toBe('');
    });
});

describe('escapeHtml', () => {
    it('escapes special characters', () => {
        expect(escapeHtml(`<b a="1">'&'</b>`)).toBe('&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;');
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(42)).toBe('42');
    });
});
