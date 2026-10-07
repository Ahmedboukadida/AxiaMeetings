'use client';

/**
 * Shared client-side loader for GET /api/public (packs, references, settings).
 *
 * The public layout and the page inside it both need this payload, so a single
 * page view used to request it twice. Concurrent and back-to-back callers now
 * share one request; the result is reused for a few seconds only, so edits made
 * in the dashboard still show up on the next navigation.
 */
const REUSE_MS = 10_000;

let inflight: Promise<any> | null = null;
let fetchedAt = 0;

export function fetchPublicData(): Promise<any> {
    const now = Date.now();
    if (inflight && now - fetchedAt < REUSE_MS) return inflight;
    fetchedAt = now;
    const p = fetch('/api/public').then(res => res.json());
    inflight = p;
    // Never keep a failed request around.
    p.catch(() => { if (inflight === p) inflight = null; });
    return p;
}
