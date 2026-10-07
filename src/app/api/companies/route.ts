import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `companies`
 * RELATIONS INCLUDED: 
 * companies_apis_list: { select: { id: true, endpoint: true, method: true

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
        const companies = await prisma.companies.findMany({
            include: {
                companies_apis_list: { select: { id: true, endpoint: true, method: true } },
                login_endpoint: { select: { id: true, endpoint: true, method: true } },
                users_endpoint: { select: { id: true, endpoint: true, method: true } },
                notifications_service_endpoint: { select: { id: true, endpoint: true, method: true } },
                messages_service_endpoint: { select: { id: true, endpoint: true, method: true } },
                sms_service_endpoint: { select: { id: true, endpoint: true, method: true } },
                _count: { select: { users: true, meetings: true } },
            },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: companies });
    } catch (error) {
        console.error('Error fetching companies:', error);
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
        const { name, logo_url, url, database_schema, meeting_time_limit, users_number_limit } = body;
        if (!name || !url) {
            return NextResponse.json({ status: false, message: 'Name and URL are required' }, { status: 400 });
        }
        const company = await prisma.companies.create({
            data: { 
                name, 
                logo_url: logo_url || '', 
                url, 
                database_schema: database_schema || '',
                meeting_time_limit: meeting_time_limit || 'ONE_HOUR',
                users_number_limit: users_number_limit !== undefined ? Number(users_number_limit) : 10
            },
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created company: ${name}`,
            payload: body,
            response: company
        });

        return NextResponse.json({ status: true, data: company }, { status: 201 });
    } catch (error) {
        console.error('Error creating company:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
