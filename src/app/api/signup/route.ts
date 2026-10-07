import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { BCRYPT_COST, checkPassword, passwordErrorResponse } from '@/lib/password-policy';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { toPositiveInt } from '@/lib/authz';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 255;

/**
 * Same answer whether the email is new, already has an account or already has a pending
 * request (N44: no account enumeration). Duplicates are silently ignored.
 */
function received() {
    return NextResponse.json(
        { status: true, message: 'Your registration request has been received. You will be notified by email once it is reviewed.' },
        { status: 202 },
    );
}

export async function POST(req: NextRequest) {
    if (!await rateLimit(`signup:${getIp(req)}`, 5, 15 * 60 * 1000)) {
        return NextResponse.json({ status: false, message: 'Too many requests. Please try again later.' }, { status: 429 });
    }
    try {
        const body = await req.json().catch(() => null);
        const { fullname, password, company_name, company_url, pack_id } = body ?? {};
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const packId = toPositiveInt(pack_id);

        if (typeof fullname !== 'string' || !fullname.trim() || !email || typeof password !== 'string' || !password
            || typeof company_name !== 'string' || !company_name.trim() || !packId) {
            return NextResponse.json({ status: false, message: 'All fields (fullname, email, password, company_name, pack_id) are required' }, { status: 400 });
        }
        if (!EMAIL_RE.test(email) || email.length > MAX_LEN || fullname.length > MAX_LEN || company_name.length > MAX_LEN
            || (company_url != null && (typeof company_url !== 'string' || company_url.length > 2048))) {
            return NextResponse.json({ status: false, message: 'Invalid request' }, { status: 400 });
        }

        const pwError = checkPassword(password, { email });
        if (pwError) return passwordErrorResponse(pwError);

        // Hash first so the duplicate and the new-request paths cost about the same time.
        const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

        const [existingUser, existingRequest] = await Promise.all([
            prisma.users.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }),
            prisma.signup_requests.findFirst({
                where: { email: { equals: email, mode: 'insensitive' }, status: 'PENDING' },
                select: { id: true },
            }),
        ]);
        if (existingUser || existingRequest) return received();

        await prisma.signup_requests.create({
            data: {
                fullname: fullname.trim(),
                email,
                password: hashedPassword,
                company_name: company_name.trim(),
                company_url: company_url || null,
                pack_id: packId,
            },
        });

        return received();
    } catch (error) {
        console.error('Error submitting signup request:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
