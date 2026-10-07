import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

// GET: list all newsletters (developer only) | POST: subscribe (public)
/**
 * @description AI Agent Documentation
 * Endpoint: /api/newsletters
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/newsletters`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `newsletters`

 * AI AGENT DATA ACCESS & ROLE RULES:
 * 1. UNAUTHENTICATED: Only provide general AxiaMeetings info (total companies, users, references, guides).
 * 2. ADMIN: Restrict all answers to data where companyId matches the admin's company. They can query specific meetings, users, etc., within their company.
 * 3. PARTICIPANT (Token): Restrict all answers strictly to the single meeting associated with their token.
 * 4. DEVELOPER: Full access to all data.
 * 
 * INSTRUCTIONS FOR AI:
 * - Read `prisma/schema.prisma` first to understand the exact fields and relations available for the models listed above.
 * - Call this GET endpoint to fetch the JSON data.
 * - Parse the JSON, filter it according to the ROLE RULES above, and return the exact properties the user asked for.
 */
export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') { return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 }); }
    try {
        const newsletters = await prisma.newsletters.findMany({ orderBy: { created_at: 'desc' } });
        return NextResponse.json({ status: true, data: newsletters });
    } catch { return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { email } = body;
        if (!email || !email.includes('@')) { return NextResponse.json({ status: false, message: 'Valid email is required' }, { status: 400 }); }
        const existing = await prisma.newsletters.findFirst({ where: { email } });
        if (existing) { return NextResponse.json({ status: false, message: 'Email already subscribed' }, { status: 409 }); }
        const newsletter = await prisma.newsletters.create({ data: { email } });

        await createLog({
            message: `New newsletter subscription: ${email}`,
            payload: { email },
            response: newsletter
        });

        return NextResponse.json({ status: true, data: newsletter });
    } catch { return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') { return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 }); }
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ status: false, message: 'ID required' }, { status: 400 });
        const existing = await prisma.newsletters.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

        await prisma.newsletters.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted newsletter subscription: ${existing.email}`,
            payload: { id, email: existing.email }
        });

        return NextResponse.json({ status: true });
    } catch { return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 }); }
}
