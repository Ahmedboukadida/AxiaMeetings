/**
 * AI Token Usage Tracker
 * Records each AI API call against the token used in ia_token_usage table.
 */
import { prisma } from '@/lib/prisma';

export async function trackAiUsage(
    tokenId: number,
    feature: string,
    success: boolean = true
): Promise<void> {
    try {
        await prisma.ia_token_usage.create({
            data: { token_id: tokenId, feature, success },
        });
    } catch { /* non-critical — never block AI calls */ }
}

/**
 * Get active Gemini keys from DB (provider = 'gemini'), ordered by id.
 * Falls back to .env keys if DB has none.
 */
export async function getActiveGeminiKeys(): Promise<{ id: number; key: string }[]> {
    try {
        const tokens = await prisma.ia_tokens_keys.findMany({
            where: { provider: 'gemini', is_active: true },
            orderBy: { id: 'asc' },
            select: { id: true, api_key: true },
        });
        if (tokens.length > 0) {
            return tokens.map(t => ({ id: t.id, key: t.api_key }));
        }
    } catch { /* ignore */ }

    // Fallback to .env
    const envKeys: { id: number; key: string }[] = [];
    if (process.env.GEMINI_API_KEY) envKeys.push({ id: -1, key: process.env.GEMINI_API_KEY });
    for (let i = 2; i <= 10; i++) {
        const k = process.env[`GEMINI_API_KEY_${i}`];
        if (k) envKeys.push({ id: -(i), key: k });
    }
    return envKeys;
}

/**
 * Get active Groq key from DB (provider = 'groq').
 * Falls back to .env GROQ_API_KEY.
 */
export async function getActiveGroqKey(): Promise<{ id: number; key: string } | null> {
    try {
        const token = await prisma.ia_tokens_keys.findFirst({
            where: { provider: 'groq', is_active: true },
            orderBy: { id: 'asc' },
            select: { id: true, api_key: true },
        });
        if (token) return { id: token.id, key: token.api_key };
    } catch { /* ignore */ }

    const envKey = process.env.GROQ_API_KEY;
    return envKey ? { id: -99, key: envKey } : null;
}
