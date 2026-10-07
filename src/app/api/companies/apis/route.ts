import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies/apis
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies/apis`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `companies_apis`
 * RELATIONS INCLUDED: 
 * company: { select: { id: true, name: true

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
        const companyId = searchParams.get('companyId');
        const apis = await prisma.companies_apis.findMany({
            where: companyId ? { company_id: Number(companyId) } : {},
            include: {
                company: { select: { id: true, name: true } },
                formated_responses: true,
            },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: apis });
    } catch (error) {
        console.error('Error fetching APIs:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { endpoint, method, payload_example, response_example, company_id } = await req.json();
        if (!endpoint || !method || !company_id) {
            return NextResponse.json({ status: false, message: 'Endpoint, method and company are required' }, { status: 400 });
        }
        const api = await prisma.companies_apis.create({
            data: { endpoint, method, payload_example, response_example, company_id: Number(company_id) },
        });
        return NextResponse.json({ status: true, data: api }, { status: 201 });
    } catch (error) {
        console.error('Error creating API:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id, endpoint, method, payload_example, response_example } = await req.json();
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        const api = await prisma.companies_apis.update({
            where: { id: Number(id) },
            data: { endpoint, method, payload_example, response_example },
        });
        return NextResponse.json({ status: true, data: api });
    } catch (error) {
        console.error('Error updating API:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        await prisma.companies_apis.delete({ where: { id: Number(id) } });
        return NextResponse.json({ status: true, message: 'API deleted' });
    } catch (error) {
        console.error('Error deleting API:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
