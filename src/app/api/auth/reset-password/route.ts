import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { BCRYPT_COST, checkPassword, passwordErrorResponse } from '@/lib/password-policy';
import { BUMP_TOKEN_VERSION } from '@/lib/auth';
import { clearLoginFailures, normaliseLoginId } from '@/lib/login-guard';
import { rateLimit, getIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
    const ip = getIp(req);
    if (!await rateLimit(`reset-password:${ip}`, 5, 60000)) {
        return NextResponse.json({ status: false, message: 'Too many attempts. Please try again later.' }, { status: 429 });
    }
    try {
        const { token, password } = await req.json();

        // Strings only: an object here would become a Prisma filter ({ not: null } matches any pending reset).
        if (!token || !password || typeof token !== 'string' || typeof password !== 'string') {
            return NextResponse.json({ status: false, message: 'Token and password are required' }, { status: 400 });
        }

        const user = await prisma.users.findFirst({
            where: {
                reset_token: token,
                reset_token_expiry: { gte: new Date() },
            },
        });

        if (!user) {
            return NextResponse.json({ status: false, message: 'Invalid or expired reset link' }, { status: 400 });
        }

        const pwError = checkPassword(password, { email: user.email, username: user.username });
        if (pwError) return passwordErrorResponse(pwError);

        const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

        await prisma.users.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                reset_token: null,
                reset_token_expiry: null,
                // Revoke every session opened with the old password.
                ...BUMP_TOKEN_VERSION,
            },
        });

        // A successful reset proves ownership: lift any login lock on this account.
        const ip = getIp(req);
        for (const raw of [user.email, user.username]) {
            if (!raw) continue;
            const id = normaliseLoginId(raw);
            await clearLoginFailures(`account:${id}`);
            await clearLoginFailures(`${id}|${ip}`);
        }

        return NextResponse.json({ status: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}