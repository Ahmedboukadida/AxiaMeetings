import { describe, expect, it } from 'vitest';
import {
    COMPANY_PUBLIC_SELECT,
    PARTICIPANT_PUBLIC_SELECT,
    USER_PUBLIC_SELECT,
    isSecretKey,
    maskSecret,
    redactSecrets,
} from '@/lib/safe-select';

describe('public select shapes', () => {
    it('USER_PUBLIC_SELECT never selects password or reset_token', () => {
        const keys = Object.keys(USER_PUBLIC_SELECT);
        expect(keys).not.toContain('password');
        expect(keys).not.toContain('reset_token');
        expect(keys).toEqual(expect.arrayContaining(['id', 'email', 'role', 'company_id']));
    });

    it('PARTICIPANT_PUBLIC_SELECT never selects the join token', () => {
        expect(Object.keys(PARTICIPANT_PUBLIC_SELECT)).not.toContain('token');
        expect(PARTICIPANT_PUBLIC_SELECT).toEqual({ id: true, email: true, meeting_id: true });
    });

    it('COMPANY_PUBLIC_SELECT has no secrets or wiring fields', () => {
        const keys = Object.keys(COMPANY_PUBLIC_SELECT);
        for (const k of keys) expect(k).not.toMatch(/key|secret|password|token|schema|endpoint/i);
    });
});

describe('redactSecrets', () => {
    it('masks nested password/token/api_key and leaves other fields', () => {
        const input = {
            fullname: 'Ann',
            password: 'p@ss',
            profile: { token: 'abc', api_key: 'k-123', city: 'Tunis' },
            list: [{ reset_token: 'r1', name: 'x' }, 'plain', 3],
            count: 2,
            nothing: null,
        };
        const out = redactSecrets(input);
        expect(out).toEqual({
            fullname: 'Ann',
            password: '***',
            profile: { token: '***', api_key: '***', city: 'Tunis' },
            list: [{ reset_token: '***', name: 'x' }, 'plain', 3],
            count: 2,
            nothing: null,
        });
    });

    it('matches keys case-insensitively and covers the other secret names', () => {
        const out = redactSecrets({
            Password: 'a',
            API_KEY: 'b',
            Authorization: 'Bearer x',
            confirmPassword: 'c',
            new_password: 'd',
            email_password: 'e',
            api_secret: 'f',
            token_id: 'g',
            secret: 'h',
        });
        for (const v of Object.values(out)) expect(v).toBe('***');
    });

    it('does not mutate the input and passes primitives through', () => {
        const input = { password: 'x', nested: { token: 'y' } };
        redactSecrets(input);
        expect(input).toEqual({ password: 'x', nested: { token: 'y' } });
        expect(redactSecrets('str')).toBe('str');
        expect(redactSecrets(null)).toBeNull();
        expect(redactSecrets(undefined)).toBeUndefined();
    });

    it('masks a secret key even when its value is an object', () => {
        expect(redactSecrets({ token: { value: 'abc' } })).toEqual({ token: '***' });
    });
});

describe('redactSecrets pattern matching', () => {
    it('masks any key containing a secret fragment, whatever the casing or separators', () => {
        const out = redactSecrets({
            accessToken: 'a',
            refresh_token: 'b',
            apiKey: 'c',
            'x-api-key': 'c2',
            smtp_password: 'd',
            livekit_api_secret: 'e',
            client_secret: 'f',
            passwd: 'g',
            'Set-Cookie': 'h',
            cookie: 'i',
            proxyAuthorization: 'j',
            jwtToken: 'k',
        });
        for (const v of Object.values(out)) expect(v).toBe('***');
    });

    it('keeps numeric AI token counters but masks the same keys holding strings', () => {
        expect(
            redactSecrets({ tokens_count: 12, max_tokens: 1024, totalTokens: 50, prompt_tokens: 3, tokens: 7 }),
        ).toEqual({ tokens_count: 12, max_tokens: 1024, totalTokens: 50, prompt_tokens: 3, tokens: 7 });
        expect(redactSecrets({ tokens_count: 'abc', max_tokens: 'sk-x' })).toEqual({ tokens_count: '***', max_tokens: '***' });
    });

    it('still masks a numeric bare token (OTP-like) and non-counter numeric secrets', () => {
        expect(redactSecrets({ token: 123456, api_key: 42, password: 1234 })).toEqual({
            token: '***',
            api_key: '***',
            password: '***',
        });
    });

    it('keeps boolean flags such as email_password_set', () => {
        expect(redactSecrets({ email_password_set: true, has_token: false })).toEqual({
            email_password_set: true,
            has_token: false,
        });
    });

    it('does not touch unrelated keys', () => {
        const input = { subject: 'Board', email: 'a@b.c', description: 'token talk', keyDecisions: ['x'] };
        expect(redactSecrets(input)).toEqual(input);
        expect(isSecretKey('keyDecisions')).toBe(false);
        expect(isSecretKey('monkey')).toBe(false);
    });

    it('keeps Date values and truncates structures too deep to inspect', () => {
        const d = new Date('2026-01-01T00:00:00Z');
        expect(redactSecrets({ at: d }).at).toBe(d);
        let deep: any = { password: 'leak' };
        for (let i = 0; i < 12; i++) deep = { n: deep };
        expect(JSON.stringify(redactSecrets(deep))).not.toContain('leak');
    });
});

describe('maskSecret', () => {
    it('returns empty string for missing values', () => {
        expect(maskSecret(null)).toBe('');
        expect(maskSecret(undefined)).toBe('');
        expect(maskSecret('')).toBe('');
    });

    it('fully masks short secrets', () => {
        expect(maskSecret('abc')).toBe('****');
        expect(maskSecret('abcd')).toBe('****');
    });

    it('shows only the last 4 characters, at most 12 stars', () => {
        expect(maskSecret('abcde')).toBe('*bcde');
        expect(maskSecret('sk-1234567890')).toBe('*********7890');
        const long = 'x'.repeat(40) + 'WXYZ';
        expect(maskSecret(long)).toBe('*'.repeat(12) + 'WXYZ');
        expect(maskSecret(long)).not.toContain('x');
    });
});
