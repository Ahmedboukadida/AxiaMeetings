import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { getOrSetCache, redis } from '@/lib/redis';

// Public GET + developer POST
/**
 * @description AI Agent Documentation
 * Endpoint: /api/packs
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/packs`.
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
export async function GET() {
    try {
        const packs = await getOrSetCache('packs:all', 3600, async () => {
            return prisma.packs.findMany({
                include: { packs_lines: true },
                orderBy: { price_month: 'asc' },
            });
        });
        return NextResponse.json({ status: true, data: packs });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { name, price_month, price_year, packs_lines } = body;
        if (!name || price_month === undefined || price_year === undefined) {
            return NextResponse.json({ status: false, message: 'name, price_month, price_year are required' }, { status: 400 });
        }
        const pack = await prisma.packs.create({
            data: {
                name,
                price_month: Number(price_month),
                price_year: Number(price_year),
                packs_lines: {
                    create: (packs_lines || []).map((t: string) => ({ title: t })),
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
            message: `Created pack: ${name}`,
            payload: body,
            response: pack
        });

        return NextResponse.json({ status: true, data: pack });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
