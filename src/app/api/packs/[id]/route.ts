import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { redis } from '@/lib/redis';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/packs/[id]
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/packs/[id]`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `packs`
 * RELATIONS INCLUDED: 
 * packs_lines: true | packs_lines: true
 
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
        const pack = await prisma.packs.findUnique({
            where: { id: Number(id) },
            include: { packs_lines: true },
        });
        if (!pack) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });
        return NextResponse.json({ status: true, data: pack });
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
    const packId = Number(id);

    try {
        const body = await req.json();
        const { name, price_month, price_year, packs_lines } = body;

        // Atomic nested update for maximum stability and to resolve P2002
        const pack = await prisma.packs.update({
            where: { id: packId },
            data: {
                name,
                price_month: Number(price_month),
                price_year: Number(price_year),
                packs_lines: {
                    deleteMany: {},
                    create: packs_lines.map((t: string) => ({ 
                        title: t 
                    })),
                },
            },
            include: { packs_lines: true },
        });

        // Invalidate cache
        if (redis) {
            await redis.del('packs:all').catch(() => {});
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated pack: ${name}`,
            payload: body,
            response: pack
        });

        return NextResponse.json({ status: true, data: pack });
    } catch (e) {
        console.error("Failed to update pack", e);
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
        const existing = await prisma.packs.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Not found' }, { status: 404 });

        await prisma.packs.delete({ where: { id: Number(id) } });

        // Invalidate cache
        if (redis) {
            await redis.del('packs:all').catch(() => {});
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted pack: ${existing.name}`,
            payload: { id, name: existing.name }
        });

        return NextResponse.json({ status: true });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
