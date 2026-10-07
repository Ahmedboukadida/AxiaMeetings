import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, requireRole, httpErrorResponse, toPositiveInt, HttpError } from '@/lib/authz';
import { redactSecrets } from '@/lib/safe-select';

function errorResponse(label: string, error: unknown) {
    const handled = httpErrorResponse(error);
    if (handled) return handled;
    console.error(label, error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
}

function toLogJson(value: unknown) {
    if (value === null || value === undefined) return undefined;
    return redactSecrets(JSON.parse(JSON.stringify(value)));
}

/**
 * @description AI Agent Documentation
 * Endpoint: /api/logs
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/logs`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `logs`
 * RELATIONS INCLUDED: 
 * user: { select: { fullname: true, username: true, email: true, role: true

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
        // DEVELOPER: all logs (optional ?companyId=). ADMIN: only his own company, the filter is forced.
        const user = await requireRole(req, 'DEVELOPER', 'ADMIN');
        const { searchParams } = new URL(req.url);
        const limit = Math.min(toPositiveInt(searchParams.get('limit')) ?? 50, 200);
        const offsetRaw = Number(searchParams.get('offset') || '0');
        const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

        let where: { company_id?: number };
        if (user.role === 'DEVELOPER') {
            const companyParam = searchParams.get('companyId');
            const companyId = companyParam ? toPositiveInt(companyParam) : null;
            if (companyParam && !companyId) throw new HttpError(400, 'Invalid companyId');
            where = companyId ? { company_id: companyId } : {};
        } else {
            if (user.companyId == null) throw new HttpError(403, 'Forbidden');
            where = { company_id: user.companyId };
        }

        const [logs, total] = await Promise.all([
            prisma.logs.findMany({
                where,
                include: {
                    user: { select: { fullname: true, username: true, email: true, role: true } },
                    company: { select: { name: true } },
                },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.logs.count({ where }),
        ]);

        // Older rows may predate central redaction: redact again on the way out.
        const data = logs.map((l) => ({
            ...l,
            request: redactSecrets(l.request),
            payload: redactSecrets(l.payload),
            response: redactSecrets(l.response),
        }));
        return NextResponse.json({ status: true, data, pagination: { total, limit, offset } });
    } catch (error) {
        return errorResponse('Error fetching logs:', error);
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requireUser(req);
        const body = await req.json().catch(() => ({}));
        const { message, request, payload, response, company_id } = body ?? {};
        if (typeof message !== 'string' || !message.trim()) throw new HttpError(400, 'message is required');

        // Scope always comes from the actor. Only a DEVELOPER may file a log against another company.
        let companyId: number | null = user.companyId;
        if (user.role === 'DEVELOPER' && company_id !== undefined && company_id !== null && company_id !== '') {
            companyId = toPositiveInt(company_id);
            if (!companyId) throw new HttpError(400, 'Invalid company_id');
            const exists = await prisma.companies.findUnique({ where: { id: companyId }, select: { id: true } });
            if (!exists) throw new HttpError(400, 'Invalid company_id');
        }

        const log = await prisma.logs.create({
            data: {
                message: message.slice(0, 2000),
                request: toLogJson(request),
                payload: toLogJson(payload),
                response: toLogJson(response),
                user_id: user.userId,
                company_id: companyId,
            },
        });
        return NextResponse.json({ status: true, data: log }, { status: 201 });
    } catch (error) {
        return errorResponse('Error creating log:', error);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        await requireRole(req, 'DEVELOPER');
        const body = await req.json().catch(() => ({}));
        const id = toPositiveInt(body?.id);
        const ids = Array.isArray(body?.ids) ? body.ids.map(toPositiveInt) : null;
        if (id) {
            await prisma.logs.deleteMany({ where: { id } });
        } else if (ids && ids.length > 0 && ids.every((x: number | null) => x !== null)) {
            await prisma.logs.deleteMany({ where: { id: { in: ids as number[] } } });
        } else {
            return NextResponse.json({ status: false, message: 'ID or IDs required' }, { status: 400 });
        }
        return NextResponse.json({ status: true });
    } catch (error) {
        return errorResponse('Error deleting logs:', error);
    }
}
