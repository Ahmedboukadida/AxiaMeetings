import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

// GET: fetch current link status for the authenticated admin
/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies/link
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies/link`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `companies_admins_login`
 * - Model: `companies`
 * - Model: `users`
 * RELATIONS INCLUDED: 
 * login_endpoint: { include: { formated_responses: true

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
    const urlObj = new URL(req.url);
    const queryCompanyId = urlObj.searchParams.get('companyId');
    const targetCompanyId = user.role === 'DEVELOPER' && queryCompanyId ? parseInt(queryCompanyId) : user.companyId;

    let targetUserId = user.userId;
    if (user.role === 'DEVELOPER') {
        const queryAdminId = urlObj.searchParams.get('adminId');
        if (!queryAdminId) return NextResponse.json({ status: false, message: 'Admin ID required for developers' }, { status: 400 });
        targetUserId = parseInt(queryAdminId);
    }

    if (!targetCompanyId) {
        return NextResponse.json({ status: false, message: 'No company specified' }, { status: 400 });
    }

    try {
        const link = await prisma.companies_admins_login.findFirst({
            where: { user_id: targetUserId, company_id: targetCompanyId },
            select: { id: true, username: true, token_id: true, company_id: true },
        });
        return NextResponse.json({ status: true, data: link });
    } catch (error) {
        console.error('Error fetching link:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// POST: admin logs into their external application using the company's configured login endpoint
export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const { username, password, companyId, adminId } = await req.json();
        if (!username || !password) {
            return NextResponse.json({ status: false, message: 'Username and password are required' }, { status: 400 });
        }

        const targetCompanyId = user.role === 'DEVELOPER' && companyId ? parseInt(companyId) : user.companyId;
        
        let targetUserId = user.userId;
        if (user.role === 'DEVELOPER') {
            if (!adminId) return NextResponse.json({ status: false, message: 'Admin ID required for developers' }, { status: 400 });
            targetUserId = parseInt(adminId);
        }

        if (!targetCompanyId) {
            return NextResponse.json({ status: false, message: 'No company specified' }, { status: 400 });
        }

        // Fetch the company with its configured login endpoint and format mappings
        const company = await prisma.companies.findUnique({
            where: { id: targetCompanyId },
            include: {
                login_endpoint: { include: { formated_responses: true } },
            },
        });

        if (!company) {
            return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
        }

        if (!company.login_endpoint) {
            return NextResponse.json({
                status: false,
                message: 'No login endpoint configured for this company. Ask your developer to configure it in Companies → Configure Services.',
            }, { status: 400 });
        }

        const loginEndpoint = company.login_endpoint;

        // Build the full login URL
        const loginUrl = loginEndpoint.endpoint.startsWith('http')
            ? loginEndpoint.endpoint
            : `${company.url}${loginEndpoint.endpoint}`;

        // Build the payload using format mappings if available
        // Format mappings: response_key = their field name, formated_response_key = our field name
        // So to send: find mapping where formated_response_key = 'username' → use response_key as their field name
        let loginPayload: Record<string, string> = {};

        const payloadMappings = loginEndpoint.formated_responses.filter((m: any) => m.format_for === 'PAYLOAD');

        if (payloadMappings.length > 0) {
            // Map our field names → their field names
            const ourToTheir: Record<string, string> = {};
            for (const m of payloadMappings) {
                ourToTheir[m.formated_response_key] = m.response_key;
            }
            // Use mapped field names, fall back to standard names
            loginPayload[ourToTheir['username'] || 'username'] = username;
            loginPayload[ourToTheir['password'] || 'password'] = password;
        } else {
            loginPayload = { username, password };
        }

        // Call the external login endpoint
        let externalToken: string | null = null;
        let externalResponseData: any = null;

        try {
            const externalRes = await fetch(loginUrl, {
                method: loginEndpoint.method || 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(loginPayload),
            });

            if (!externalRes.ok) {
                let errorDetail = '';
                try {
                    const errJson = await externalRes.json();
                    errorDetail = errJson.message || errJson.error || JSON.stringify(errJson);
                } catch {
                    try {
                        errorDetail = await externalRes.text();
                    } catch {
                        errorDetail = 'Unknown error';
                    }
                }
                return NextResponse.json({
                    status: false,
                    message: `External API Error (${externalRes.status}): ${errorDetail.substring(0, 200)}`,
                }, { status: externalRes.status });
            }

            externalResponseData = await externalRes.json();
        } catch (fetchError) {
            console.error('External login failed:', fetchError);
            return NextResponse.json({
                status: false,
                message: 'Failed to connect to external application. Check the company URL and login endpoint.',
            }, { status: 502 });
        }

        // Extract token from response using format mappings
        const responseMappings = loginEndpoint.formated_responses.filter((m: any) => m.format_for === 'RESPONSE');
        if (responseMappings.length > 0) {
            // Find mapping where formated_response_key = 'token'
            const tokenMapping = responseMappings.find(
                (m: any) => m.formated_response_key === 'token'
            );
            if (tokenMapping) {
                // Support nested paths like "data.token" using dot notation
                const keys = tokenMapping.response_key.split('.');
                let val: any = externalResponseData;
                for (const k of keys) {
                    val = val?.[k];
                }
                externalToken = val || null;
            }
        }

        // Fallback: try common token field names
        if (!externalToken) {
            externalToken = externalResponseData?.token
                || externalResponseData?.access_token
                || externalResponseData?.accessToken
                || externalResponseData?.jwt
                || externalResponseData?.data?.token
                || externalResponseData?.data?.access_token
                || externalResponseData?.result?.token
                || null;
        }

        if (!externalToken) {
            return NextResponse.json({
                status: false,
                message: 'External login succeeded but no token was found in the response. Add a format mapping with formated_response_key="token" pointing to the token field in the response.',
            }, { status: 401 });
        }

        // Extract identifiant_extern (external user ID)
        let identifiantExtern: number | null = null;
        if (responseMappings.length > 0) {
            const idMapping = responseMappings.find(
                (m: any) => m.formated_response_key === 'identifiant_extern' || m.formated_response_key === 'id'
            );
            if (idMapping) {
                const keys = idMapping.response_key.split('.');
                let val: any = externalResponseData;
                for (const k of keys) {
                    val = val?.[k];
                }
                if (val !== undefined && val !== null) identifiantExtern = Number(val);
            }
        }

        if (identifiantExtern === null || isNaN(identifiantExtern)) {
            const fallbackId = externalResponseData?.identifiant_extern
                || externalResponseData?.id
                || externalResponseData?.user?.id
                || externalResponseData?.data?.id
                || externalResponseData?.result?.id;
            identifiantExtern = fallbackId ? Number(fallbackId) : null;
        }

        if (identifiantExtern !== null && isNaN(identifiantExtern)) {
            identifiantExtern = null;
        }

        // Upsert the link record
        const existing = await prisma.companies_admins_login.findFirst({
            where: { user_id: targetUserId, company_id: targetCompanyId },
        });

        let link;
        if (existing) {
            link = await prisma.companies_admins_login.update({
                where: { id: existing.id },
                data: { username, password, token_id: externalToken, identifiant_extern: identifiantExtern },
            });
        } else {
            link = await prisma.companies_admins_login.create({
                data: { username, password, token_id: externalToken, user_id: targetUserId, company_id: targetCompanyId, identifiant_extern: identifiantExtern },
            });
        }

        // Also sync it to the main users table for the admin
        if (identifiantExtern !== null) {
            await prisma.users.update({
                where: { id: targetUserId },
                data: { identifiant_extern: identifiantExtern },
            });
        }

        return NextResponse.json({ status: true, data: { id: link.id, token_id: link.token_id } });
    } catch (error) {
        console.error('Error linking account:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// DELETE: unlink / remove stored token
export async function DELETE(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    const urlObj = new URL(req.url);
    const queryCompanyId = urlObj.searchParams.get('companyId');
    const targetCompanyId = user.role === 'DEVELOPER' && queryCompanyId ? parseInt(queryCompanyId) : user.companyId;

    let targetUserId = user.userId;
    if (user.role === 'DEVELOPER') {
        const queryAdminId = urlObj.searchParams.get('adminId');
        if (!queryAdminId) return NextResponse.json({ status: false, message: 'Admin ID required for developers' }, { status: 400 });
        targetUserId = parseInt(queryAdminId);
    }

    try {
        await prisma.companies_admins_login.deleteMany({
            where: { user_id: targetUserId, ...(targetCompanyId ? { company_id: targetCompanyId } : {}) },
        });
        return NextResponse.json({ status: true, message: 'Account unlinked' });
    } catch (error) {
        console.error('Error unlinking account:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
