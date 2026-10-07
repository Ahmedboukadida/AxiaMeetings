import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint: returns packs, references, and app settings (contact/social only)
/**
 * @description AI Agent Documentation
 * Endpoint: /api/public
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/public`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `packs`
 * - Model: `references`
 * - Model: `app_settings`
 * RELATIONS INCLUDED: 
 * packs_lines: true

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
export async function GET() {
    try {
        const [packs, references, settings] = await Promise.all([
            prisma.packs.findMany({ include: { packs_lines: true }, orderBy: { price_month: 'asc' } }),
            prisma.references.findMany({ orderBy: { id: 'desc' } }),
            prisma.app_settings.findFirst({
                select: {
                    contact_phone: true,
                    contact_email: true,
                    contact_adress: true,
                    facebook: true,
                    linkedin: true,
                    tiktok: true,
                    from_name: true,
                    term_of_use: true,
                    privacy_policy: true,
                    logo_file_name: true,
                    favicon_file_name: true,
                },
            }),
        ]);
        return NextResponse.json({ status: true, data: { packs, references, settings } });
    } catch {
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
