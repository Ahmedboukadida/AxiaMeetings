import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

// POST: save/replace format mappings for an API endpoint
export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { endpoint_id, mappings } = await req.json();
        if (!endpoint_id) {
            return NextResponse.json({ status: false, message: 'endpoint_id is required' }, { status: 400 });
        }

        // Delete existing mappings and recreate
        await prisma.formated_response.deleteMany({ where: { endpoint_id: Number(endpoint_id) } });

        if (mappings && mappings.length > 0) {
            await prisma.formated_response.createMany({
                data: mappings
                    .filter((m: any) => m.response_key && m.formated_response_key)
                    .map((m: any) => ({
                        endpoint_id: Number(endpoint_id),
                        response_key: m.response_key,
                        formated_response_key: m.formated_response_key,
                        format_for: m.format_for || 'RESPONSE',
                    })),
            });
        }

        return NextResponse.json({ status: true, message: 'Mappings saved' });
    } catch (error) {
        console.error('Error saving format mappings:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// GET: fetch format mappings for an endpoint
/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies/apis/format
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies/apis/format`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `formated_response`

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
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { searchParams } = new URL(req.url);
        const endpointId = searchParams.get('endpointId');
        if (!endpointId) {
            return NextResponse.json({ status: false, message: 'endpointId is required' }, { status: 400 });
        }
        const mappings = await prisma.formated_response.findMany({
            where: { endpoint_id: Number(endpointId) },
        });
        return NextResponse.json({ status: true, data: mappings });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
