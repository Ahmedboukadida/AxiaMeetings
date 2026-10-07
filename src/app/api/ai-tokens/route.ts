import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { invalidateAiKeyCache } from '@/lib/ai-provider';
import { requireRole, httpErrorResponse, toPositiveInt } from '@/lib/authz';
import { maskSecret } from '@/lib/safe-select';

/**
 * Secrets never leave the server (H5/N48): api_key is returned masked (last 4 chars),
 * api_secret only as a boolean `api_secret_set`. DEVELOPER only.
 */
async function requireDeveloper(req: NextRequest): Promise<NextResponse | null> {
    try {
        await requireRole(req, 'DEVELOPER');
        return null;
    } catch (error) {
        return httpErrorResponse(error) ?? NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
}

function toPublicToken<T extends { api_key: string; api_secret: string | null }>(t: T) {
    const { api_key, api_secret, ...rest } = t;
    return { ...rest, api_key: maskSecret(api_key), api_secret_set: !!api_secret };
}

/** Empty, missing or still-masked (contains '*') input means "keep the stored value". */
function secretUpdate(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const v = value.trim();
    if (!v || v.includes('*')) return undefined;
    return v;
}

// ─── GET: list all tokens with today's usage stats ─────────────────────────
/**
 * @description AI Agent Documentation
 * Endpoint: /api/ai-tokens
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/ai-tokens`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `ia_tokens_keys`
 * RELATIONS INCLUDED: 
 * usage: { where: { used_at: { gte: todayStart

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
    const denied = await requireDeveloper(req);
    if (denied) return denied;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tokens = await prisma.ia_tokens_keys.findMany({
        orderBy: { id: 'asc' },
        include: {
            usage: {
                where: { used_at: { gte: todayStart } },
                select: { feature: true, success: true, used_at: true },
            },
        },
    });

    // Compute stats per token
    const result = tokens.map(t => {
        const todayUsage = t.usage;
        const byFeature: Record<string, number> = {};
        todayUsage.forEach(u => {
            byFeature[u.feature] = (byFeature[u.feature] || 0) + 1;
        });
        const todayTotal = todayUsage.length;
        const todaySuccess = todayUsage.filter(u => u.success).length;
        const creditLimit = t.credit_limit ? parseInt(t.credit_limit) : null;
        const remaining = creditLimit !== null ? Math.max(0, creditLimit - todayTotal) : null;
        const isExhausted = creditLimit !== null && remaining === 0;

        return {
            id: t.id,
            provider: t.provider,
            name: t.name,
            credit_limit: t.credit_limit,
            expiration: t.expiration,
            websocket_url: t.websocket_url,
            api_key: maskSecret(t.api_key),
            api_secret_set: !!t.api_secret,
            project_name: t.project_name,
            project_number: t.project_number,
            is_active: t.is_active,
            created_at: t.created_at,
            stats: {
                todayTotal,
                todaySuccess,
                todayFailed: todayTotal - todaySuccess,
                remaining,
                creditLimit,
                isExhausted,
                byFeature,
            },
        };
    });

    return NextResponse.json({ status: true, data: result });
}

// ─── POST: create token ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const denied = await requireDeveloper(req);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const apiKey = secretUpdate(body?.api_key);
    if (!apiKey) {
        return NextResponse.json({ status: false, message: 'api_key is required' }, { status: 400 });
    }
    const token = await prisma.ia_tokens_keys.create({
        data: {
            provider: body.provider || null,
            name: body.name || null,
            credit_limit: body.credit_limit || null,
            expiration: body.expiration ? new Date(body.expiration) : null,
            websocket_url: body.websocket_url || null,
            api_key: apiKey,
            api_secret: secretUpdate(body.api_secret) ?? null,
            project_name: body.project_name || null,
            project_number: body.project_number || null,
            is_active: body.is_active !== false,
        },
    });
    invalidateAiKeyCache();
    return NextResponse.json({ status: true, data: toPublicToken(token) }, { status: 201 });
}

// ─── PUT: update token ──────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
    const denied = await requireDeveloper(req);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const id = toPositiveInt(body?.id);
    if (!id) return NextResponse.json({ status: false, message: 'id required' }, { status: 400 });
    const exists = await prisma.ia_tokens_keys.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ status: false, message: 'Token not found' }, { status: 404 });

    const token = await prisma.ia_tokens_keys.update({
        where: { id },
        data: {
            provider: body.provider ?? undefined,
            name: body.name ?? undefined,
            credit_limit: body.credit_limit ?? undefined,
            // Absent = unchanged (a toggle must not wipe the expiration); '' = cleared.
            expiration: body.expiration === undefined ? undefined : body.expiration ? new Date(body.expiration) : null,
            websocket_url: body.websocket_url ?? undefined,
            api_key: secretUpdate(body.api_key),
            api_secret: secretUpdate(body.api_secret),
            project_name: body.project_name ?? undefined,
            project_number: body.project_number ?? undefined,
            is_active: body.is_active !== undefined ? body.is_active : undefined,
        },
    });
    invalidateAiKeyCache();
    return NextResponse.json({ status: true, data: toPublicToken(token) });
}

// ─── DELETE: remove token ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const denied = await requireDeveloper(req);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const id = toPositiveInt(body?.id);
    if (!id) return NextResponse.json({ status: false, message: 'id required' }, { status: 400 });
    await prisma.ia_tokens_keys.deleteMany({ where: { id } });
    invalidateAiKeyCache();
    return NextResponse.json({ status: true });
}
