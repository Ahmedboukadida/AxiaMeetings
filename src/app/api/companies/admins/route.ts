import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, httpErrorResponse, toPositiveInt, type StaffActor } from '@/lib/authz';
import { BUMP_TOKEN_VERSION } from '@/lib/auth';
import { USER_PUBLIC_SELECT, redactSecrets } from '@/lib/safe-select';
import bcrypt from 'bcryptjs';
import { BCRYPT_COST, checkPassword, passwordErrorResponse } from '@/lib/password-policy';
import { createLog } from '@/lib/logger';

/** Emails are stored trimmed + lowercase (N44); undefined/null pass through (= unchanged / cleared). */
function normaliseEmail(value: unknown): string | null | undefined {
    if (value === undefined || value === null) return value;
    const e = String(value).trim().toLowerCase();
    return e === '' ? null : e;
}

/** Developer-only route: DB-checked role. */
async function requireDeveloper(req: NextRequest): Promise<StaffActor | NextResponse> {
    try {
        return await requireRole(req, 'DEVELOPER');
    } catch (e) {
        const r = httpErrorResponse(e);
        if (r) return r;
        console.error('Authorization check failed:', e);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

/**
 * @description AI Agent Documentation
 * Endpoint: /api/companies/admins
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/companies/admins`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `users`
 * - Model: `companies_admins_login`
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
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;
    try {
        const { searchParams } = new URL(req.url);
        const companyId = searchParams.get('companyId');
        const admins = await prisma.users.findMany({
            where: {
                role: 'ADMIN',
                ...(companyId ? { company_id: Number(companyId) } : {}),
            },
            select: {
                ...USER_PUBLIC_SELECT,
                company: { select: { id: true, name: true } },
                companies_admins_login: { select: { id: true, token_id: true, company_id: true, identifiant_extern: true } },
            },
            orderBy: { id: 'asc' },
        });
        // Never send the external token: only whether the admin is linked.
        const data = admins.map(({ companies_admins_login, ...a }) => ({
            ...a,
            companies_admins_login: companies_admins_login.map(({ token_id, ...l }) => ({ ...l, linked: !!token_id })),
        }));
        return NextResponse.json({ status: true, data });
    } catch (error) {
        console.error('Error fetching admins:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;
    try {
        const { fullname, email: rawEmail, username, password, company_id, identifiant_extern } = await req.json();
        const email = normaliseEmail(rawEmail);
        if (!username || !password || !company_id) {
            return NextResponse.json({ status: false, message: 'Username, password and company are required' }, { status: 400 });
        }
        const pwError = checkPassword(password, { email, username });
        if (pwError) return passwordErrorResponse(pwError);
        const hashed = await bcrypt.hash(password, BCRYPT_COST);
        const admin = await prisma.users.create({
            data: { fullname, email, username, password: hashed, role: 'ADMIN', company_id: Number(company_id), identifiant_extern: identifiant_extern ? Number(identifiant_extern) : null },
            select: USER_PUBLIC_SELECT,
        });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Created company admin: ${username}`,
            payload: redactSecrets({ fullname, email, username, company_id }),
            response: { id: admin.id, username: admin.username }
        });

        return NextResponse.json({ status: true, data: admin }, { status: 201 });
    } catch (error) {
        console.error('Error creating admin:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;
    try {
        const { id, fullname, email: rawEmail, username, password, company_id, identifiant_extern } = await req.json();
        const email = normaliseEmail(rawEmail);
        const userId = toPositiveInt(id);
        if (!userId) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        const existing = await prisma.users.findUnique({ where: { id: userId }, select: { id: true, company_id: true, email: true, username: true } });
        if (!existing) return NextResponse.json({ status: false, message: 'Admin not found' }, { status: 404 });
        if (password) {
            const pwError = checkPassword(password, { email: email ?? existing.email, username: username ?? existing.username });
            if (pwError) return passwordErrorResponse(pwError);
        }
        const updateData: any = { fullname, email, username };
        const newCompanyId = toPositiveInt(company_id);
        if (newCompanyId) updateData.company_id = newCompanyId;
        if (identifiant_extern !== undefined) updateData.identifiant_extern = identifiant_extern ? Number(identifiant_extern) : null;
        if (password) updateData.password = await bcrypt.hash(password, BCRYPT_COST);
        // Password or company change revokes the admin's existing sessions (N41).
        if (password || (newCompanyId && newCompanyId !== existing.company_id)) Object.assign(updateData, BUMP_TOKEN_VERSION);
        const admin = await prisma.users.update({ where: { id: userId }, data: updateData, select: USER_PUBLIC_SELECT });
        
        // Also update identifiant_extern in companies_admins_login if it exists
        if (identifiant_extern !== undefined) {
            await prisma.companies_admins_login.updateMany({
                where: { user_id: userId },
                data: { identifiant_extern: identifiant_extern ? Number(identifiant_extern) : null }
            });
        }

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Updated company admin: ${username}`,
            payload: redactSecrets({ id, fullname, email, username, company_id }),
            response: { id: admin.id, username: admin.username }
        });

        return NextResponse.json({ status: true, data: admin });
    } catch (error) {
        console.error('Error updating admin:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });
        const existing = await prisma.users.findUnique({ where: { id: Number(id) }, select: { id: true, username: true } });
        if (!existing) return NextResponse.json({ status: false, message: 'Admin not found' }, { status: 404 });

        await prisma.users.delete({ where: { id: Number(id) } });

        await createLog({
            userId: user.userId,
            companyId: user.companyId,
            message: `Deleted company admin: ${existing.username}`,
            payload: { id, username: existing.username }
        });

        return NextResponse.json({ status: true, message: 'Admin deleted' });
    } catch (error) {
        console.error('Error deleting admin:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
