import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies/my
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies/my`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `companies`
 * RELATIONS INCLUDED: 
 * companies_apis_list: true, login_endpoint: true, users_endpoint: true, notifications_service_endpoint: true, messages_service_endpoint: true, sms_service_endpoint: true, _count: { select: { users: true, meetings: true

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
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    if (!user.companyId && user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'No company associated with this user' }, { status: 404 });
    }

    try {
        const companyId = user.companyId!;
        const company = await prisma.companies.findUnique({
            where: { id: companyId },
            include: {
                companies_apis_list: true,
                login_endpoint: true,
                users_endpoint: true,
                notifications_service_endpoint: true,
                messages_service_endpoint: true,
                sms_service_endpoint: true,
                _count: { select: { users: true, meetings: true } },
            },
        });

        if (!company) {
            return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
        }

        return NextResponse.json({ status: true, data: company });
    } catch (error) {
        console.error('Error fetching company details:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
