import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * @description AI Agent Documentation
 * Endpoint: /api/ai-status
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/ai-status`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED: None or custom query.

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

    // Collect Gemini keys (mask all but first/last 4 chars)
    const geminiKeys: { index: number; masked: string; configured: boolean }[] = [];
    const rawKeys: string[] = [];

    if (process.env.GEMINI_API_KEY) rawKeys.push(process.env.GEMINI_API_KEY);
    for (let i = 2; i <= 10; i++) {
        const k = process.env[`GEMINI_API_KEY_${i}`];
        if (k) rawKeys.push(k);
    }

    rawKeys.forEach((key, i) => {
        geminiKeys.push({
            index: i + 1,
            masked: key.length > 8 ? `${key.slice(0, 6)}${'•'.repeat(key.length - 10)}${key.slice(-4)}` : '••••••••',
            configured: true,
        });
    });

    // Show empty slots up to 5
    for (let i = rawKeys.length + 1; i <= 5; i++) {
        geminiKeys.push({ index: i, masked: 'Not configured', configured: false });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const groq = {
        configured: !!groqKey,
        masked: groqKey
            ? `${groqKey.slice(0, 6)}${'•'.repeat(Math.max(0, groqKey.length - 10))}${groqKey.slice(-4)}`
            : 'Not configured',
    };

    // Quotas info (static — from documentation)
    const quotas = {
        gemini_2_0_flash: { perKeyPerDay: 200, unit: 'req/day' },
        gemini_2_5_flash: { perKeyPerDay: 20, unit: 'req/day' },
        groq_llama_70b: { perDay: 14400, unit: 'req/day' },
    };

    const totalGeminiDaily = rawKeys.length * quotas.gemini_2_0_flash.perKeyPerDay;
    const totalCapacity = totalGeminiDaily + (groqKey ? quotas.groq_llama_70b.perDay : 0);

    return NextResponse.json({
        status: true,
        data: {
            geminiKeys,
            groq,
            quotas,
            summary: {
                geminiKeyCount: rawKeys.length,
                totalGeminiDaily,
                groqConfigured: !!groqKey,
                totalCapacity,
            },
        },
    });
}
