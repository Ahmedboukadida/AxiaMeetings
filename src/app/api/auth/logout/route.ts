import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (user) {
        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `User logged out`,
            payload: { method: 'POST' }
        });
    }
    const response = NextResponse.json({ status: true, message: 'Logged out successfully' });
    response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
    return response;
}

/**
 * Logout changes state (clears the session cookie), so it is POST only (N49): a GET
 * (link, <img>, prefetch) must never log anyone out.
 */
export function GET() {
    return NextResponse.json(
        { status: false, message: 'Method Not Allowed' },
        { status: 405, headers: { Allow: 'POST' } },
    );
}
