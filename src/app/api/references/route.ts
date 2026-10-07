import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';
import { getOrSetCache, redis } from '@/lib/redis';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/references
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/references`.
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
export async function GET(req: NextRequest) {
    try {
        const references = await getOrSetCache('references:all', 3600, async () => {
            return prisma.references.findMany({ orderBy: { name: 'asc' } });
        });
        return NextResponse.json({ status: true, data: references });
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
        const { name, logo_file_name, website } = body;
        if (!name || !logo_file_name || !website) {
            return NextResponse.json({ status: false, message: 'All fields are required' }, { status: 400 });
        }
        const ref = await prisma.references.create({ data: { name, logo_file_name, website } });

        // Invalidate cache
        if (redis) {
            await redis.del('references:all').catch(() => {});
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created reference: ${name}`,
            payload: body,
            response: ref
        });

        return NextResponse.json({ status: true, data: ref });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
