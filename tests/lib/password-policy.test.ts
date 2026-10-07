import { describe, expect, it } from 'vitest';
import { BCRYPT_COST, checkPassword, passwordErrorResponse, PASSWORD_ERROR_MESSAGES } from '@/lib/password-policy';

describe('checkPassword', () => {
    it('accepts a long password with letters and digits', () => {
        expect(checkPassword('blue-Horse7-battery')).toBeNull();
        expect(checkPassword('été2026réunion')).toBeNull(); // unicode letters count
    });

    it('requires a string', () => {
        for (const v of [undefined, null, '', 123456789012, { not: '' }]) {
            expect(checkPassword(v)).toBe('PASSWORD_REQUIRED');
        }
    });

    it('enforces 10..128 characters', () => {
        expect(checkPassword('abc123def')).toBe('PASSWORD_TOO_SHORT');
        expect(checkPassword('abc123defg')).toBeNull();
        expect(checkPassword('a1'.repeat(64))).toBeNull();
        expect(checkPassword('a1'.repeat(64) + 'x')).toBe('PASSWORD_TOO_LONG');
    });

    it('needs at least one letter and one digit', () => {
        expect(checkPassword('abcdefghijkl')).toBe('PASSWORD_TOO_WEAK');
        expect(checkPassword('123456789012')).toBe('PASSWORD_TOO_WEAK');
        expect(checkPassword('!!!!!!!!!!!!')).toBe('PASSWORD_TOO_WEAK');
    });

    it('refuses a password containing the username or the email local part', () => {
        expect(checkPassword('Jdupont2026!', { username: 'jdupont' })).toBe('PASSWORD_CONTAINS_IDENTITY');
        expect(checkPassword('x9-MARIE.CURIE-x9', { email: 'Marie.Curie@lab.test' })).toBe('PASSWORD_CONTAINS_IDENTITY');
        // too-short identities are ignored
        expect(checkPassword('ab-horse-77-x', { username: 'ab', email: 'x@y.z' })).toBeNull();
    });

    it('refuses the most common passwords, case-insensitively', () => {
        expect(checkPassword('password123')).toBe('PASSWORD_TOO_COMMON');
        expect(checkPassword('Azerty123456')).toBe('PASSWORD_TOO_COMMON');
        expect(checkPassword('1Q2W3E4R5T')).toBe('PASSWORD_TOO_COMMON');
    });

    it('uses bcrypt cost 12', () => {
        expect(BCRYPT_COST).toBe(12);
    });
});

describe('passwordErrorResponse', () => {
    it('returns 400 with the code and a message', async () => {
        const res = passwordErrorResponse('PASSWORD_TOO_SHORT');
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            status: false,
            code: 'PASSWORD_TOO_SHORT',
            message: PASSWORD_ERROR_MESSAGES.PASSWORD_TOO_SHORT,
        });
    });
});
