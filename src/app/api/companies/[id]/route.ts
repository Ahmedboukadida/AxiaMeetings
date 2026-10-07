import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { createLog } from '@/lib/logger';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies/[id]
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies/[id]`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `companies`
 * RELATIONS INCLUDED: 
 * companies_apis_list: { include: { formated_responses: true

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
    try {
        const { id } = await params;
        const company = await prisma.companies.findUnique({
            where: { id: Number(id) },
            include: {
                companies_apis_list: { include: { formated_responses: true } },
                login_endpoint: true,
                users_endpoint: true,
                notifications_service_endpoint: true,
                messages_service_endpoint: true,
                sms_service_endpoint: true,
            },
        });
        if (!company) return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
        return NextResponse.json({ status: true, data: company });
    } catch (error) {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const body = await req.json();
        const {
            name, logo_url, url, database_schema,
            login_endpoint_id, users_endpoint_id,
            have_notifications_service, notifications_service_endpoint_id,
            have_messages_service, messages_service_endpoint_id,
            have_sms_service, sms_service_endpoint_id,
            have_mail_service, push_mails_endpoint_id,
            ai_is_active, mail_is_active, meeting_time_limit, users_number_limit,
        } = body;

        // Build data object dynamically to support partial updates (e.g., just ai_is_active toggle)
        const data: Record<string, any> = {};
        if (name !== undefined) data.name = name;
        if (logo_url !== undefined) data.logo_url = logo_url;
        if (url !== undefined) data.url = url;
        if (database_schema !== undefined) data.database_schema = database_schema;
        if (login_endpoint_id !== undefined) data.login_endpoint_id = login_endpoint_id ? Number(login_endpoint_id) : null;
        if (users_endpoint_id !== undefined) data.users_endpoint_id = users_endpoint_id ? Number(users_endpoint_id) : null;
        if (have_notifications_service !== undefined) data.have_notifications_service = !!have_notifications_service;
        if (notifications_service_endpoint_id !== undefined) data.notifications_service_endpoint_id = notifications_service_endpoint_id ? Number(notifications_service_endpoint_id) : null;
        if (have_messages_service !== undefined) data.have_messages_service = !!have_messages_service;
        if (messages_service_endpoint_id !== undefined) data.messages_service_endpoint_id = messages_service_endpoint_id ? Number(messages_service_endpoint_id) : null;
        if (have_sms_service !== undefined) data.have_sms_service = !!have_sms_service;
        if (sms_service_endpoint_id !== undefined) data.sms_service_endpoint_id = sms_service_endpoint_id ? Number(sms_service_endpoint_id) : null;
        if (have_mail_service !== undefined) data.have_mail_service = !!have_mail_service;
        if (push_mails_endpoint_id !== undefined) data.push_mails_endpoint_id = push_mails_endpoint_id ? Number(push_mails_endpoint_id) : null;
        if (ai_is_active !== undefined) data.ai_is_active = !!ai_is_active;
        if (mail_is_active !== undefined) data.mail_is_active = !!mail_is_active;
        if (meeting_time_limit !== undefined) data.meeting_time_limit = meeting_time_limit;
        if (users_number_limit !== undefined) data.users_number_limit = users_number_limit !== null ? Number(users_number_limit) : null;

        const company = await prisma.companies.update({
            where: { id: Number(id) },
            data,
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated company: ${company.name}`,
            payload: body,
            response: company
        });

        return NextResponse.json({ status: true, data: company });
    } catch (error) {
        console.error('Error updating company:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const existing = await prisma.companies.findUnique({ where: { id: Number(id) } });
        if (!existing) return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });

        await prisma.companies.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted company: ${existing.name}`,
            payload: { id, name: existing.name }
        });

        return NextResponse.json({ status: true, message: 'Company deleted' });
    } catch (error) {
        console.error('Error deleting company:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
