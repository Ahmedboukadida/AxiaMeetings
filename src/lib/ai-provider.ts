/**
 * AI Provider Utility — Multi-provider, DB-first key management
 *
 * Supported providers (ia_tokens_keys.provider — case-insensitive):
 *   "gemini" / "Gemini"           → Google Gemini API
 *   "groq"   / "Groq"             → Groq API
 *   "openrouter" / "Open Router"  → OpenRouter API
 *
 * Priority orders:
 *   Chat (streaming/fallback) : Gemini → Groq → OpenRouter
 *   Generation (text)         : Groq   → Gemini → OpenRouter
 *
 * All keys loaded from ia_tokens_keys where is_active = true.
 * Usage tracked in ia_token_usage per call.
 *
 * Models per provider: see AI_MODEL_DEFAULTS / getAiModels() (env AI_*_MODELS).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import { prisma } from '@/lib/prisma';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DbKey {
    id: number;
    provider: string;
    key: string;
    websocket_url?: string | null;
}

// ─── Load active keys from DB (case-insensitive provider match) ───────────────
// Cached in memory for AI_KEYS_CACHE_TTL_SECONDS (default 30, 0 = off) so a chat
// message or AI action does not query ia_tokens_keys once per provider every time.
// The AI Tokens API calls invalidateAiKeyCache() after every create/update/delete.
// Lives on globalThis so every bundled copy of this module shares one cache.
type KeyCacheEntry = { expires: number; keys: Promise<DbKey[]> };
const keyCacheGlobal = globalThis as typeof globalThis & { __axiaAiKeyCache?: Map<string, KeyCacheEntry> };
const keyCache: Map<string, KeyCacheEntry> = keyCacheGlobal.__axiaAiKeyCache ?? (keyCacheGlobal.__axiaAiKeyCache = new Map());

function aiKeyCacheTtlMs(): number {
    const raw = Number.parseInt(process.env.AI_KEYS_CACHE_TTL_SECONDS ?? '', 10);
    return (Number.isFinite(raw) && raw >= 0 ? raw : 30) * 1000;
}

/** Drop cached AI keys (call after ia_tokens_keys changes). */
export function invalidateAiKeyCache(): void {
    keyCache.clear();
}

async function queryActiveKeys(provider: string): Promise<DbKey[]> {
    const rows = await prisma.ia_tokens_keys.findMany({
        where: {
            is_active: true,
            provider: { equals: provider, mode: 'insensitive' },
        },
        orderBy: { id: 'asc' },
        select: { id: true, api_key: true, websocket_url: true },
    });
    return rows.map(r => ({ id: r.id, provider, key: r.api_key, websocket_url: r.websocket_url }));
}

async function loadActiveKeys(provider: string): Promise<DbKey[]> {
    const ttl = aiKeyCacheTtlMs();
    const cacheKey = provider.toLowerCase();
    const now = Date.now();
    try {
        let entry = ttl > 0 ? keyCache.get(cacheKey) : undefined;
        if (!entry || entry.expires <= now) {
            const keys = queryActiveKeys(provider);
            entry = { expires: now + ttl, keys };
            if (ttl > 0) {
                keyCache.set(cacheKey, entry);
                // Never cache a failed lookup.
                keys.catch(() => { if (keyCache.get(cacheKey) === entry) keyCache.delete(cacheKey); });
            }
        }
        // Same DbKey objects for every caller: copy so a caller can never mutate the cache.
        return (await entry.keys).map(k => ({ ...k, provider }));
    } catch (err: any) {
        console.error(`[AI] loadActiveKeys(${provider}) error:`, err?.message);
        return [];
    }
}

// ─── Usage tracking ───────────────────────────────────────────────────────────
export async function trackUsage(tokenId: number, feature: string, success: boolean, count: number = 1): Promise<void> {
    if (tokenId < 0) return;
    try {
        const records = Array.from({ length: count }, () => ({
            token_id: tokenId,
            feature,
            success,
        }));
        await prisma.ia_token_usage.createMany({
            data: records,
        });
    } catch { /* non-critical */ }
}

// ─── Model configuration (central, env-overridable) ──────────────────────────
// Defaults reviewed 2026-10-02 against the providers' deprecation pages:
//  - Groq retired llama-3.3-70b-versatile / llama-3.1-8b-instant (shutdown 2026-08-16),
//    so they stay only as the LAST fallback.
//  - Gemini shut down gemini-2.0-flash (2026-06-01); gemini-2.5-flash is restricted to past users.
// Override per deployment with comma-separated env vars:
//   AI_GROQ_MODELS, AI_GEMINI_MODELS, AI_OPENROUTER_MODELS
export type AiProviderName = 'groq' | 'gemini' | 'openrouter';

export const AI_MODEL_DEFAULTS: Readonly<Record<AiProviderName, readonly string[]>> = Object.freeze({
    groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'],
    gemini: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'],
    openrouter: ['openai/gpt-oss-120b', 'google/gemini-3.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
});

const AI_MODEL_ENV: Record<AiProviderName, string> = {
    groq: 'AI_GROQ_MODELS',
    gemini: 'AI_GEMINI_MODELS',
    openrouter: 'AI_OPENROUTER_MODELS',
};

/** Ordered model list for a provider (env override wins when it lists at least one model). */
export function getAiModels(provider: AiProviderName): string[] {
    const raw = process.env[AI_MODEL_ENV[provider]];
    const fromEnv = (raw || '').split(',').map(m => m.trim()).filter(Boolean);
    return fromEnv.length > 0 ? fromEnv : [...AI_MODEL_DEFAULTS[provider]];
}

/** Extra Groq request params per model (gpt-oss reasoning models: keep reasoning short). */
export function groqModelParams(model: string): { reasoning_effort?: 'low' } {
    return model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {};
}

// ─── Error helpers ────────────────────────────────────────────────────────────
function errMsg(err: any): string {
    return String(err?.message ?? err ?? '');
}
function isQuotaExhausted(msg: string): boolean {
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('limit: 0') || msg.includes('PerDay') || msg.includes('quota') ||
        msg.includes('rate_limit');
}
/** The requested model is gone / unknown / not usable with this key → try the next model. */
export function isModelUnavailable(msg: string): boolean {
    const m = msg.toLowerCase();
    return m.includes('404') || m.includes('not found') || m.includes('model_not_found') ||
        m.includes('decommissioned') || m.includes('does not exist') || m.includes('not supported') ||
        m.includes('not a valid model') || m.includes('no endpoints found');
}
/** The key itself is rejected → no point trying more models with it. */
export function isAuthError(msg: string): boolean {
    const m = msg.toLowerCase();
    return /\b(401|403)\b/.test(m) || m.includes('invalid api key') || m.includes('api key not valid') ||
        m.includes('api_key_invalid') || m.includes('invalid_api_key') || m.includes('unauthorized') ||
        m.includes('permission_denied') || m.includes('forbidden');
}
function isServiceUnavailable(msg: string): boolean {
    return msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('Internal error');
}

type FailureKind = 'model' | 'auth' | 'quota' | 'unavailable' | 'other';
function classifyError(msg: string): FailureKind {
    if (msg.includes('_ALL_MODELS_FAILED')) return 'model';
    if (isAuthError(msg)) return 'auth';
    if (isQuotaExhausted(msg)) return 'quota';
    if (isModelUnavailable(msg)) return 'model';
    if (isServiceUnavailable(msg)) return 'unavailable';
    return 'other';
}
function shortReason(msg: string): string {
    return msg.replace(/\s+/g, ' ').substring(0, 160);
}

const ALL_MODELS_FAILED = '_ALL_MODELS_FAILED';

/**
 * Runs `attempt(model)` for each model in order. Model-gone errors (404, decommissioned, …)
 * and empty answers move on to the next model; any other error (bad key, quota, network)
 * is re-thrown at once so the caller can rotate to the next key/provider.
 * After every model failed, throws `<PROVIDER>_ALL_MODELS_FAILED: <last provider message>`.
 */
export async function withModelFallback<T>(
    providerLabel: string,
    models: string[],
    attempt: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
    let lastMsg = 'no models configured';
    for (const model of models) {
        try {
            return { result: await attempt(model), model };
        } catch (err: any) {
            const msg = errMsg(err);
            const modelProblem = !isAuthError(msg) && !isQuotaExhausted(msg) &&
                (isModelUnavailable(msg) || msg.startsWith('EMPTY_RESPONSE'));
            if (!modelProblem) throw err;
            lastMsg = msg;
            console.warn(`[AI] ${providerLabel} model ${model} -> unavailable: ${shortReason(msg)}`);
        }
    }
    throw new Error(`${providerLabel.toUpperCase()}${ALL_MODELS_FAILED}: ${shortReason(lastMsg)}`);
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function tryGeminiKey(dbKey: DbKey, prompt: string, maxOutputTokens?: number): Promise<{ text: string; model: string }> {
    const client = new GoogleGenerativeAI(dbKey.key);
    const { result, model } = await withModelFallback('gemini', getAiModels('gemini'), async (modelName) => {
        const model = client.getGenerativeModel({
            model: modelName,
            ...(maxOutputTokens ? { generationConfig: { maxOutputTokens } } : {}),
        });
        const res = await model.generateContent(prompt);
        const text = res.response.text().trim();
        if (!text) throw new Error('EMPTY_RESPONSE from Gemini');
        return text;
    });
    return { text: result, model };
}

// ─── Groq ─────────────────────────────────────────────────────────────────────
async function tryGroqKey(dbKey: DbKey, prompt: string, maxOutputTokens?: number): Promise<{ text: string; model: string }> {
    const client = new Groq({ apiKey: dbKey.key });
    const { result, model } = await withModelFallback('groq', getAiModels('groq'), async (model) => {
        const completion = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxOutputTokens ?? 4096,
            temperature: 0.7,
            ...groqModelParams(model),
        });
        // Only the final answer (`content`); gpt-oss reasoning lives in a separate field.
        const text = completion.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error('EMPTY_RESPONSE from Groq');
        return text;
    });
    return { text: result, model };
}

// ─── OpenRouter ───────────────────────────────────────────────────────────────
async function tryOpenRouterKey(dbKey: DbKey, prompt: string, maxOutputTokens?: number): Promise<{ text: string; model: string }> {
    const baseURL = dbKey.websocket_url || 'https://openrouter.ai/api/v1';
    const { result, model } = await withModelFallback('openrouter', getAiModels('openrouter'), async (model) => {
        const res = await fetch(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${dbKey.key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://axia-meetings.com',
                'X-Title': 'Axia Meetings',
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxOutputTokens ?? 4096,
                temperature: 0.7,
            }),
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`OpenRouter ${res.status}: ${errText}`);
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error('EMPTY_RESPONSE from OpenRouter');
        return text;
    });
    return { text: result, model };
}

// ─── Generic try-provider helper ──────────────────────────────────────────────
async function tryProvider(dbKey: DbKey, prompt: string, maxOutputTokens?: number): Promise<{ text: string; model: string }> {
    const p = dbKey.provider.toLowerCase().replace(/\s+/g, '');
    if (p === 'gemini') return tryGeminiKey(dbKey, prompt, maxOutputTokens);
    if (p === 'groq') return tryGroqKey(dbKey, prompt, maxOutputTokens);
    if (p === 'openrouter') return tryOpenRouterKey(dbKey, prompt, maxOutputTokens);
    throw new Error(`Unknown provider: ${dbKey.provider}`);
}

// ─── Final error when every key/provider failed ──────────────────────────────
export class AiProvidersFailedError extends Error {
    readonly kind: FailureKind | 'mixed' | 'no-keys';
    readonly failures: { provider: string; keyId: number; kind: FailureKind; reason: string }[];
    constructor(failures: { provider: string; keyId: number; kind: FailureKind; reason: string }[]) {
        const kinds = new Set(failures.map(f => f.kind));
        const kind: AiProvidersFailedError['kind'] =
            failures.length === 0 ? 'no-keys' : kinds.size === 1 ? failures[0].kind : 'mixed';
        const detail = failures.map(f => `${f.provider} key#${f.keyId}: ${f.kind}`).join('; ');
        super(`ALL_PROVIDERS_FAILED[${kind}]${detail ? ` ${detail}` : ''}`);
        this.name = 'AiProvidersFailedError';
        this.kind = kind;
        this.failures = failures;
    }
}

// ─── Run through a list of providers in order ─────────────────────────────────
// Every failure (model gone, bad key, quota, outage, …) rotates to the next key and then
// to the next provider; we only give up once everything has been tried.
async function runProviders(
    providerOrder: string[],
    prompt: string,
    feature: string,
    maxOutputTokens?: number,
): Promise<string> {
    const failures: { provider: string; keyId: number; kind: FailureKind; reason: string }[] = [];
    for (const provider of providerOrder) {
        const keys = await loadActiveKeys(provider);
        for (const dbKey of keys) {
            try {
                console.log(`[AI:${feature}] trying ${provider} key#${dbKey.id}`);
                const { text, model } = await tryProvider(dbKey, prompt, maxOutputTokens);
                console.log(`[AI:${feature}] ${provider} key#${dbKey.id} ${model} SUCCEEDED`);
                await trackUsage(dbKey.id, feature, true, 1);
                return text;
            } catch (err: any) {
                const msg = errMsg(err);
                const kind = classifyError(msg);
                const reason = shortReason(msg);
                failures.push({ provider, keyId: dbKey.id, kind, reason });
                // Never log the key itself — only provider, key id, and a short reason.
                console.error(`[AI:${feature}] ${provider} key#${dbKey.id} -> ${kind}: ${reason}`);
                await trackUsage(dbKey.id, feature, false, 1);
            }
        }
    }
    throw new AiProvidersFailedError(failures);
}

// ─── generateWithRetry — text generation ─────────────────────────────────────
// Priority: Groq → Gemini → OpenRouter
export async function generateWithRetry(
    prompt: string,
    options?: { maxOutputTokens?: number; feature?: string },
): Promise<string> {
    return runProviders(
        ['groq', 'gemini', 'openrouter', 'open router'],
        prompt,
        options?.feature || 'unknown',
        options?.maxOutputTokens,
    );
}

// ─── getChatResponse — chat fallback (non-streaming) ─────────────────────────
// Priority: Groq → Gemini → OpenRouter
export async function getChatResponse(
    prompt: string,
    options?: { maxOutputTokens?: number },
): Promise<string> {
    return runProviders(
        ['groq', 'gemini', 'openrouter', 'open router'],
        prompt,
        'chat',
        options?.maxOutputTokens,
    );
}

// ─── getStreamingClients — Groq streaming for chat ───────────────────────────
// Returns all active Groq keys in order
export async function getStreamingClients(): Promise<{ client: Groq; tokenId: number }[]> {
    const keys = await loadActiveKeys('groq');
    return keys.map(k => ({
        client: new Groq({ apiKey: k.key }),
        tokenId: k.id
    }));
}

// ─── Groq chat completion with per-model fallback (chat routes) ──────────────
// Tries the configured Groq models in order with one client/key; the first model that
// answers wins and is returned so a follow-up (e.g. streaming) request can reuse it.
// Bad key / quota errors are re-thrown so the caller rotates to the next key.
export async function groqChatWithModelFallback(
    client: Groq,
    params: Omit<ChatCompletionCreateParamsNonStreaming, 'model'>,
): Promise<{ completion: ChatCompletion; model: string }> {
    const { result, model } = await withModelFallback('groq', getAiModels('groq'), async (model) => {
        const completion = await client.chat.completions.create({ ...params, model, ...groqModelParams(model) });
        const msg = completion.choices?.[0]?.message;
        if (!msg?.content?.trim() && !(msg?.tool_calls && msg.tool_calls.length > 0)) {
            throw new Error(`EMPTY_RESPONSE from Groq (${model})`);
        }
        return completion;
    });
    return { completion: result, model };
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function parseJsonResponse<T = any>(text: string): T {
    const clean = text
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/\s*```$/m, '')
        .trim();
    return JSON.parse(clean) as T;
}

export function aiErrorMessage(error: any): string {
    if (error instanceof AiProvidersFailedError || errMsg(error).startsWith('ALL_PROVIDERS_FAILED')) {
        const kind = error instanceof AiProvidersFailedError
            ? error.kind
            : (errMsg(error).match(/^ALL_PROVIDERS_FAILED\[([a-z-]+)\]/)?.[1] ?? 'mixed');
        switch (kind) {
            case 'no-keys': return 'No active AI key configured. Add a Groq, Gemini or OpenRouter key in AI Tokens.';
            case 'model': return 'No working AI model: all configured models were rejected by the providers. Update the model list (AI_*_MODELS) or check the keys in AI Tokens.';
            case 'auth': return 'All AI keys were rejected as invalid or unauthorized. Check the keys in AI Tokens.';
            case 'quota': return 'AI quota exhausted on all providers. Retry later or add more keys in AI Tokens.';
            case 'unavailable': return 'AI providers are temporarily unavailable — please retry in a moment.';
            default: return 'All AI providers failed (models, keys or quota). Check the keys in AI Tokens and the model list (AI_*_MODELS); see server logs for details.';
        }
    }
    const msg = errMsg(error);
    if (msg === 'ALL_PROVIDERS_EXHAUSTED') return 'AI quota exhausted on all providers. Add more keys in AI Tokens settings.';
    if (msg.includes(ALL_MODELS_FAILED)) return 'No working AI model: all configured models were rejected by the providers. Update the model list (AI_*_MODELS) or check the keys in AI Tokens.';
    if (isAuthError(msg) || msg.includes('API_KEY')) return 'AI API key not configured or invalid';
    if (isQuotaExhausted(msg)) return 'AI service temporarily overloaded — please retry in a moment';
    if (msg.includes('503')) return 'AI service temporarily unavailable — please retry';
    if (isModelUnavailable(msg)) return 'No AI model available for this API key';
    return 'AI request failed — please try again';
}

export const geminiErrorMessage = aiErrorMessage;
