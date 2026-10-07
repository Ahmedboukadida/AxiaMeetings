import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
    throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not defined!");
}

export const AUTH_COOKIE = 'axia_meetings_token';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/** Claims put in every session JWT. `tv` = users.token_version at sign time (session revocation). */
export interface AxiaJwtClaims {
    userId: number;
    email: string | null;
    role: string;
    companyId: number | null;
    tv: number;
}

export interface AxiaJwtPayload extends Omit<AxiaJwtClaims, 'tv'> {
    /** Missing on tokens issued before token_version existed: treated as 0. */
    tv?: number;
    iat?: number;
    exp?: number;
}

export function signJwt(payload: AxiaJwtClaims) {
    return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: SESSION_MAX_AGE_SECONDS });
}

export function verifyJwt(token: string): AxiaJwtPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as unknown as AxiaJwtPayload;
    } catch {
        return null;
    }
}

/**
 * True when the token's `tv` claim matches the user's current token_version.
 * A token without `tv` (issued before the column existed) counts as version 0, so it keeps
 * working until the first bump; any non-integer `tv` is refused.
 */
export function tokenVersionMatches(claim: unknown, current: number | null | undefined): boolean {
    const tv = claim === undefined ? 0 : claim;
    return typeof tv === 'number' && Number.isInteger(tv) && tv === (current ?? 0);
}

/*
 * users.token_version helpers. Spread into Prisma `select` / `data` objects and read through
 * readTokenVersion() so this compiles against a client generated before the column existed
 * (the Docker build always runs `prisma generate` against schema.prisma).
 */
export const TOKEN_VERSION_SELECT = { token_version: true } as const;
export const BUMP_TOKEN_VERSION = { token_version: { increment: 1 } } as const;
export function readTokenVersion(row: object | null | undefined): number {
    const v = (row as { token_version?: unknown } | null | undefined)?.token_version;
    return typeof v === 'number' && Number.isInteger(v) ? v : 0;
}

/** Session token from the cookie (web) or the Authorization: Bearer header (mobile). */
export function readAuthToken(req: NextRequest): string | null {
    const cookie = req.cookies.get(AUTH_COOKIE)?.value;
    if (cookie) return cookie;
    const header = req.headers.get('Authorization');
    if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim() || null;
    return null;
}

/** Signature/expiry check only (no DB). Prefer getAuthenticatedUser or authz.getStaffActor. */
export function getJwtPayload(req: NextRequest): AxiaJwtPayload | null {
    const token = readAuthToken(req);
    return token ? verifyJwt(token) : null;
}

/**
 * Verified JWT whose user still exists and whose token_version still matches (a password
 * reset / role or company change revokes older tokens). Role, company and email come from
 * the DB, not from the token. Routes that need the full scope rules use authz.getStaffActor.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<AxiaJwtPayload | null> {
    const payload = getJwtPayload(req);
    const userId = payload?.userId;
    if (!payload || typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) return null;
    const row = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true, role: true, company_id: true, email: true, ...TOKEN_VERSION_SELECT },
    });
    if (!row || !row.role || !tokenVersionMatches(payload.tv, readTokenVersion(row))) return null;
    return { ...payload, userId: row.id, role: row.role, companyId: row.company_id, email: row.email };
}

/** Put a freshly signed session token in the httpOnly cookie. */
export function setAuthCookie(response: NextResponse, token: string) {
    response.cookies.set(AUTH_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
    });
}
