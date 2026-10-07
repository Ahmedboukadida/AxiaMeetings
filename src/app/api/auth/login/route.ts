import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { signJwt, setAuthCookie, readTokenVersion } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { clearLoginFailures, getLoginLock, LOGIN_ACCOUNT_MAX_FAILURES, normaliseLoginId, recordLoginFailure } from '@/lib/login-guard';
import { BCRYPT_COST } from '@/lib/password-policy';

/**
 * Compared against when the account does not exist (or has no password), so an unknown
 * username costs the same bcrypt work as a wrong password (N44: no timing enumeration).
 * Hash of a random value nobody knows, at the current cost.
 */
const DUMMY_HASH = '$2b$12$hRChH4tsuDPWPB2/sjQuE.SRwu1hB5.0ReegupjCk713yCpOOotFW';
const MAX_FIELD_LENGTH = 256;

const invalidCredentials = () =>
    NextResponse.json({ status: false, message: 'Invalid credentials' }, { status: 401 });

function lockedResponse(retryAfterSeconds: number) {
    return NextResponse.json(
        { status: false, code: 'LOCKED', message: 'Too many failed login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
}

export async function POST(req: NextRequest) {
    const ip = getIp(req);
    if (!await rateLimit(`login:${ip}`, 10, 60000)) {
        return NextResponse.json({ status: false, message: 'Too many login attempts. Please try again later.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const username: unknown = body?.username;
    const password: unknown = body?.password;

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        return NextResponse.json({ status: false, message: 'Username and password are required' }, { status: 400 });
    }
    if (username.length > MAX_FIELD_LENGTH || password.length > MAX_FIELD_LENGTH) {
        return invalidCredentials();
    }

    // Lockout (works the same for unknown accounts):
    // - strict: 5 failures per (account, client IP) -> that pair waits 15 min;
    // - account-wide: 50 failures from anywhere -> the account waits 15 min.
    // A stranger therefore cannot lock the real owner out from another address.
    const loginId = normaliseLoginId(username);
    const pairId = `${loginId}|${getIp(req)}`;
    const accountId = `account:${loginId}`;
    for (const id of [pairId, accountId]) {
        const lock = await getLoginLock(id);
        if (lock.locked) return lockedResponse(lock.retryAfterSeconds);
    }

    try {
        // Login by username (exact) or email (case-insensitive, trimmed).
        const user = await prisma.users.findFirst({
            where: { OR: [{ username: username.trim() }, { email: { equals: loginId, mode: 'insensitive' } }] },
            include: { company: { select: { ai_is_active: true, meeting_time_limit: true, users_number_limit: true } } },
            orderBy: { id: 'asc' },
        });

        const isPasswordValid = await bcrypt.compare(password, user?.password || DUMMY_HASH);
        if (!user || !user.password || !isPasswordValid) {
            const pair = await recordLoginFailure(pairId);
            const account = await recordLoginFailure(accountId, LOGIN_ACCOUNT_MAX_FAILURES);
            const after = pair.locked ? pair : account;
            return after.locked ? lockedResponse(after.retryAfterSeconds) : invalidCredentials();
        }
        await clearLoginFailures(pairId);
        await clearLoginFailures(accountId);

        // Upgrade old cost-10 hashes on a successful login so every account ends up at the same cost.
        try {
            if (bcrypt.getRounds(user.password) < BCRYPT_COST) {
                await prisma.users.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, BCRYPT_COST) } });
            }
        } catch (rehashError) {
            console.error('Password rehash failed:', rehashError);
        }

        // Only a DEVELOPER works without a company. An ADMIN or PARTICIPANT without one has no scope:
        // refuse the login instead of opening an empty dashboard (owner decision 2026-10-06).
        if (!user.role || (user.role !== 'DEVELOPER' && user.company_id == null)) {
            return NextResponse.json({
                status: false,
                code: 'NO_COMPANY',
                message: 'Your account is not linked to a company. Contact your administrator.',
            }, { status: 403 });
        }

        const token = signJwt({ userId: user.id, email: user.email, role: user.role, companyId: user.company_id, tv: readTokenVersion(user) });

        const userData = {
            id: user.id,
            fullname: user.fullname,
            email: user.email,
            username: user.username,
            role: user.role,
            company_id: user.company_id,
            ai_is_active: user.company?.ai_is_active ?? false,
            meeting_time_limit: user.company?.meeting_time_limit ?? 'ONE_HOUR',
            users_number_limit: user.company?.users_number_limit ?? 10,
        };

        const response = NextResponse.json({
            status: true,
            message: 'Login successful',
            user: userData,
            token: token, // Added for mobile app compatibility
        });

        setAuthCookie(response, token);

        await createLog({
            message: `User logged in: ${user.username || user.email}`,
            userId: user.id,
            companyId: user.company_id,
            payload: { username },
            response: { success: true, role: user.role }
        });

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
