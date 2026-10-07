import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createLog } from '@/lib/logger';
import { requireRole, canManageUser, assignableRoles, httpErrorResponse, toPositiveInt, type Role } from '@/lib/authz';
import { USER_PUBLIC_SELECT, redactSecrets } from '@/lib/safe-select';
import bcrypt from 'bcryptjs';
import { BCRYPT_COST, checkPassword, passwordErrorResponse } from '@/lib/password-policy';
import { BUMP_TOKEN_VERSION, readTokenVersion, setAuthCookie, signJwt, TOKEN_VERSION_SELECT } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/users
 * Method: GET
 *
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/users`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 *
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `users`
 * - Model: `companies`

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
const ALL_ROLES: Role[] = ['DEVELOPER', 'ADMIN', 'PARTICIPANT'];

/** Emails are stored trimmed + lowercase (N44); undefined/null pass through (= unchanged / cleared). */
function normaliseEmail(value: unknown): string | null | undefined {
    if (value === undefined || value === null) return value;
    const e = String(value).trim().toLowerCase();
    return e === '' ? null : e;
}

function errorResponse(label: string, error: unknown) {
    const r = httpErrorResponse(error);
    if (r) return r;
    console.error(label, error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
}

export async function GET(req: NextRequest) {
    try {
        const actor = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { searchParams } = new URL(req.url);
        const companyId = toPositiveInt(searchParams.get('companyId'));

        const whereClause: Prisma.usersWhereInput = {};
        if (actor.role === 'ADMIN') {
            // An ADMIN only sees his own company, and never DEVELOPER accounts.
            whereClause.company_id = actor.companyId;
            whereClause.role = { not: 'DEVELOPER' };
        } else if (companyId) {
            whereClause.company_id = companyId;
        }

        const users = await prisma.users.findMany({
            where: whereClause,
            select: { ...USER_PUBLIC_SELECT, company: { select: { id: true, name: true } } },
            orderBy: { id: 'asc' },
        });
        return NextResponse.json({ status: true, data: users });
    } catch (error) {
        return errorResponse('Error fetching users:', error);
    }
}

export async function POST(req: NextRequest) {
    try {
        const actor = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const body = await req.json();
        const { fullname, username, password, company_id, phone, identifiant_extern } = body;
        const email = normaliseEmail(body.email);
        if (!username || !password) {
            return NextResponse.json({ status: false, message: 'Username and password are required' }, { status: 400 });
        }
        const pwError = checkPassword(password, { email, username });
        if (pwError) return passwordErrorResponse(pwError);
        const role = (body.role || 'PARTICIPANT') as Role;
        if (!ALL_ROLES.includes(role) || !assignableRoles(actor).includes(role)) {
            return NextResponse.json({ status: false, message: 'You are not allowed to assign this role' }, { status: 403 });
        }
        // ADMIN always creates inside his own company; only a DEVELOPER may pick the company.
        const targetCompanyId = actor.role === 'ADMIN' ? actor.companyId : toPositiveInt(company_id);
        if (role !== 'DEVELOPER' && !targetCompanyId) {
            return NextResponse.json({ status: false, message: 'A company is required for this role' }, { status: 400 });
        }

        // Enforce user limit for the company
        if (targetCompanyId) {
            const company = await prisma.companies.findUnique({
                where: { id: targetCompanyId },
                select: { users_number_limit: true, _count: { select: { users: true } } }
            });
            if (!company) {
                return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
            }
            if (company.users_number_limit !== null && company._count.users >= company.users_number_limit) {
                return NextResponse.json({
                    status: false,
                    message: `User limit reached for this company (${company.users_number_limit}). Please contact support to upgrade your plan.`
                }, { status: 403 });
            }
        }

        const hashed = await bcrypt.hash(password, BCRYPT_COST);
        const newUser = await prisma.users.create({
            data: { fullname, email, username, password: hashed, role, company_id: targetCompanyId, phone: phone || null, identifiant_extern: identifiant_extern ? Number(identifiant_extern) : null },
            select: USER_PUBLIC_SELECT,
        });

        await createLog({
            userId: actor.userId,
            companyId: actor.companyId,
            message: `Created user: ${username}`,
            payload: redactSecrets({ fullname, email, username, role, company_id: targetCompanyId }),
            response: { id: newUser.id, username: newUser.username }
        });

        return NextResponse.json({ status: true, data: newUser }, { status: 201 });
    } catch (error) {
        return errorResponse('Error creating user:', error);
    }
}

export async function PUT(req: NextRequest) {
    try {
        const actor = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const body = await req.json();
        const { fullname, username, password, company_id, phone, identifiant_extern } = body;
        const email = normaliseEmail(body.email);
        const id = toPositiveInt(body.id);
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });

        const existing = await prisma.users.findUnique({ where: { id }, select: { id: true, role: true, company_id: true, email: true, username: true } });
        if (!existing) return NextResponse.json({ status: false, message: 'User not found' }, { status: 404 });
        if (!canManageUser(actor, existing)) {
            return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
        }

        if (password) {
            const pwError = checkPassword(password, { email: email ?? existing.email, username: username ?? existing.username });
            if (pwError) return passwordErrorResponse(pwError);
        }

        const updateData: Prisma.usersUncheckedUpdateInput = { fullname, email, username, phone: phone || null };

        // Role change: only to a role the actor may assign; a non-DEVELOPER never changes his own role.
        if (body.role !== undefined && body.role !== null && body.role !== '' && body.role !== existing.role) {
            const role = body.role as Role;
            const selfEdit = existing.id === actor.userId;
            const allowed = ALL_ROLES.includes(role)
                && assignableRoles(actor).includes(role)
                && (actor.role === 'DEVELOPER' || !selfEdit);
            if (!allowed) {
                return NextResponse.json({ status: false, message: 'You are not allowed to assign this role' }, { status: 403 });
            }
            updateData.role = role;
        }
        if (identifiant_extern !== undefined) updateData.identifiant_extern = identifiant_extern ? Number(identifiant_extern) : null;
        // Only a DEVELOPER may move a user to another company (an ADMIN never changes company_id, not even his own).
        if (actor.role === 'DEVELOPER') {
            const newCompanyId = toPositiveInt(company_id);
            if (newCompanyId) updateData.company_id = newCompanyId;
        }
        if (password) updateData.password = await bcrypt.hash(password, BCRYPT_COST);

        // Password, role or company change revokes the user's existing sessions (N41).
        const revoke = Boolean(password)
            || (updateData.role !== undefined && updateData.role !== existing.role)
            || (updateData.company_id !== undefined && updateData.company_id !== existing.company_id);

        const updated = await prisma.users.update({
            where: { id },
            data: revoke ? { ...updateData, ...BUMP_TOKEN_VERSION } : updateData,
            select: { ...USER_PUBLIC_SELECT, ...TOKEN_VERSION_SELECT },
        });
        const { token_version: _tv, ...publicUser } = updated as typeof updated & { token_version?: number };

        await createLog({
            userId: actor.userId,
            companyId: actor.companyId,
            message: `Updated user: ${username}`,
            payload: redactSecrets(body),
            response: { id: updated.id, username: updated.username }
        });

        const response = NextResponse.json({ status: true, data: publicUser });
        // Editing yourself must not log you out: re-issue your own cookie with the new version.
        if (revoke && updated.id === actor.userId && updated.role) {
            setAuthCookie(response, signJwt({
                userId: updated.id,
                email: updated.email ?? null,
                role: updated.role,
                companyId: updated.company_id ?? null,
                tv: readTokenVersion(updated),
            }));
        }
        return response;
    } catch (error) {
        return errorResponse('Error updating user:', error);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const actor = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const body = await req.json();
        const id = toPositiveInt(body?.id);
        if (!id) return NextResponse.json({ status: false, message: 'ID is required' }, { status: 400 });

        const existing = await prisma.users.findUnique({ where: { id }, select: { id: true, role: true, company_id: true, username: true } });
        if (!existing) return NextResponse.json({ status: false, message: 'User not found' }, { status: 404 });

        // Prevent self-deletion
        if (existing.id === actor.userId) {
            return NextResponse.json({ status: false, message: 'You cannot delete your own account' }, { status: 403 });
        }

        // ADMIN may delete only PARTICIPANT users of his own company — only a DEVELOPER can delete admin accounts.
        if (!canManageUser(actor, existing)) {
            const message = existing.role === 'ADMIN' || existing.role === 'DEVELOPER'
                ? 'Only a Developer can delete admin accounts'
                : 'Forbidden';
            return NextResponse.json({ status: false, message }, { status: 403 });
        }

        await prisma.users.delete({ where: { id } });

        await createLog({
            userId: actor.userId,
            companyId: actor.companyId,
            message: `Deleted user: ${existing.username}`,
            payload: { id, username: existing.username }
        });

        return NextResponse.json({ status: true, message: 'User deleted' });
    } catch (error) {
        return errorResponse('Error deleting user:', error);
    }
}
