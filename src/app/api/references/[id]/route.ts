import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { redis } from '@/lib/redis';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/references/[id]
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/references/[id]`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `references`

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
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const ref = await prisma.references.findUnique({ where: { id: Number(id) } });
        if (!ref) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ status: true, data: ref });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const body = await req.json();
        const { name, logo_file_name, website } = body;
        const ref = await prisma.references.update({
            where: { id: Number(id) },
            data: { name, logo_file_name, website },
        });

        // Invalidate cache
        if (redis) {
            await redis.del('references:all').catch(() => {});
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated reference: ${ref.name}`,
            payload: body,
            response: ref
        });

        return NextResponse.json({ status: true, data: ref });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    try {
        const existing = await prisma.references.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

        await prisma.references.delete({ where: { id: Number(id) } });

        // Invalidate cache
        if (redis) {
            await redis.del('references:all').catch(() => {});
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted reference: ${existing.name}`,
            payload: { id, name: existing.name }
        });

        return NextResponse.json({ status: true });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
