import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AxiaJwtPayload } from './auth';

/**
 * Checks if the authenticated user's company has AI features enabled.
 * DEVELOPERS always pass (for testing purposes).
 * Returns a 403 NextResponse if denied, or null if allowed.
 */
export async function checkAiAccess(user: AxiaJwtPayload): Promise<NextResponse | null> {
    // Developers always have access
    if (user.role === 'DEVELOPER') return null;

    // For all other roles, check the company's ai_is_active flag
    if (!user.companyId) {
        return NextResponse.json(
            { status: false, message: 'AI features are not available for your account.' },
            { status: 403 }
        );
    }

    const company = await prisma.companies.findUnique({
        where: { id: user.companyId },
        select: { ai_is_active: true },
    });

    if (!company?.ai_is_active) {
        return NextResponse.json(
            { status: false, message: 'AI features are not enabled for your company. Please contact your administrator.' },
            { status: 403 }
        );
    }

    return null; // Access granted
}
