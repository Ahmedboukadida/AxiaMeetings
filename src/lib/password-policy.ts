/**
 * Password policy (N45), applied wherever a password is set: users POST/PUT,
 * companies/admins POST/PUT, signup, reset-password.
 *
 *   const code = checkPassword(password, { email, username });
 *   if (code) return passwordErrorResponse(code);
 */
import { NextResponse } from 'next/server';

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt only uses the first 72 bytes; also caps hashing cost on huge inputs. */
export const PASSWORD_MAX_LENGTH = 128;
/** One cost for every new hash. */
export const BCRYPT_COST = 12;

export type PasswordErrorCode =
    | 'PASSWORD_REQUIRED'
    | 'PASSWORD_TOO_SHORT'
    | 'PASSWORD_TOO_LONG'
    | 'PASSWORD_TOO_WEAK'
    | 'PASSWORD_CONTAINS_IDENTITY'
    | 'PASSWORD_TOO_COMMON';

export const PASSWORD_ERROR_MESSAGES: Record<PasswordErrorCode, string> = {
    PASSWORD_REQUIRED: 'A password is required.',
    PASSWORD_TOO_SHORT: `The password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
    PASSWORD_TOO_LONG: `The password must be at most ${PASSWORD_MAX_LENGTH} characters long.`,
    PASSWORD_TOO_WEAK: 'The password must contain at least one letter and one digit.',
    PASSWORD_CONTAINS_IDENTITY: 'The password must not contain your username or email address.',
    PASSWORD_TOO_COMMON: 'This password is too common. Choose another one.',
};

// The most common leaked passwords that would otherwise pass the length/letter+digit rules
// (plus a few short classics kept for completeness). Compared case-insensitively.
const COMMON_PASSWORDS = new Set([
    'password1', 'password12', 'password123', 'password1234', 'password12345', 'passw0rd123',
    'qwerty123', 'qwerty1234', 'qwerty12345', 'qwerty123456', 'azerty123', 'azerty1234',
    'azerty12345', 'azerty123456', '1q2w3e4r5t', '1q2w3e4r5t6y', 'q1w2e3r4t5', 'a1b2c3d4e5',
    'abc1234567', 'abcd123456', 'abc123456789', '123456789a', '1234567890a', 'a123456789',
    'iloveyou123', 'welcome123', 'welcome1234', 'admin12345', 'admin123456', 'administrator1',
    'letmein123', 'monkey12345', 'dragon12345', 'football123', 'baseball123', 'sunshine123',
    'princess123', 'superman123', 'starwars123', 'trustno1234', 'master12345', 'changeme123',
    'motdepasse1', 'motdepasse123', 'bonjour1234', 'soleil12345', 'p@ssw0rd123', 'p@ssword123',
    'zaq12wsxcde3', '1qaz2wsx3edc', 'qazwsx12345', 'test123456', 'user123456', 'secret12345',
    'axiameetings1', 'axiameetings123', 'meetings123',
]);

/**
 * Null when the password is acceptable, else an error code.
 * Rules: 10..128 chars, at least one letter and one digit, must not contain the username
 * or the email local part (3+ chars, case-insensitive), not one of the most common passwords.
 */
export function checkPassword(
    password: unknown,
    identity: { email?: string | null; username?: string | null } = {},
): PasswordErrorCode | null {
    if (typeof password !== 'string' || password.length === 0) return 'PASSWORD_REQUIRED';
    if (password.length < PASSWORD_MIN_LENGTH) return 'PASSWORD_TOO_SHORT';
    if (password.length > PASSWORD_MAX_LENGTH) return 'PASSWORD_TOO_LONG';
    if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) return 'PASSWORD_TOO_WEAK';

    const lower = password.toLowerCase();
    const localPart = typeof identity.email === 'string' ? identity.email.trim().toLowerCase().split('@')[0] : '';
    const username = typeof identity.username === 'string' ? identity.username.trim().toLowerCase() : '';
    for (const part of [localPart, username]) {
        if (part.length >= 3 && lower.includes(part)) return 'PASSWORD_CONTAINS_IDENTITY';
    }
    if (COMMON_PASSWORDS.has(lower)) return 'PASSWORD_TOO_COMMON';
    return null;
}

/** 400 `{ status:false, code, message }` for a rejected password. */
export function passwordErrorResponse(code: PasswordErrorCode): NextResponse {
    return NextResponse.json({ status: false, code, message: PASSWORD_ERROR_MESSAGES[code] }, { status: 400 });
}
