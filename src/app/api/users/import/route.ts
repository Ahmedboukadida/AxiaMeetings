import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { executeExternalApiAction } from '@/lib/externalApiEngine';

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    const urlObj = new URL(req.url);
    const queryCompanyId = urlObj.searchParams.get('companyId');
    const targetCompanyId = user.role === 'DEVELOPER' && queryCompanyId ? parseInt(queryCompanyId) : user.companyId;

    if (!targetCompanyId) {
        return NextResponse.json({ status: false, message: 'No company specified' }, { status: 400 });
    }

    let targetUserId = user.userId;
    if (user.role === 'DEVELOPER') {
        const queryAdminId = urlObj.searchParams.get('adminId');
        if (!queryAdminId) return NextResponse.json({ status: false, message: 'Admin ID required for developers' }, { status: 400 });
        targetUserId = parseInt(queryAdminId);
    }

    try {
        // Get the company to check users limit
        const company = await prisma.companies.findUnique({
            where: { id: targetCompanyId },
            include: { _count: { select: { users: true } } },
        });

        if (!company) {
            return NextResponse.json({ status: false, message: 'Company not found' }, { status: 404 });
        }

        const engineResult = await executeExternalApiAction({
            companyId: targetCompanyId,
            actionType: 'get_users'
        });

        if (!engineResult.success) {
            return NextResponse.json({
                status: false,
                message: engineResult.message || 'Failed to fetch users from external API'
            }, { status: engineResult.status || 400 });
        }

        const rawUsers: any[] = Array.isArray(engineResult.data)
            ? engineResult.data
            : (engineResult.data?.data || engineResult.data?.users || engineResult.data?.results || engineResult.data?.items || []);

        if (rawUsers.length === 0) {
            return NextResponse.json({
                status: true,
                data: { imported: 0 },
                message: 'No users found in external API response. Check the endpoint or format mappings.',
            });
        }

        let imported = 0;
        let currentCount = company._count.users;
        const limit = company.users_number_limit ?? 10;

        for (const u of rawUsers) {
            const email: string | null = u.email || u.mail || null;
            const username: string | null = u.username || u.login || u.user_name || (email ? email.split('@')[0] : null);
            if (!username) continue;

            const phone: string | null = u.phone || u.telephone || u.phone_number || u.mobile || null;
            
            let identifiant_extern: number | null = null;
            if (u.identifiant_extern !== undefined && u.identifiant_extern !== null) {
                identifiant_extern = Number(u.identifiant_extern);
            } else if (u.id !== undefined && u.id !== null) {
                identifiant_extern = Number(u.id);
            }

            // Skip if already exists in this company
            const exists = await prisma.users.findFirst({
                where: {
                    company_id: targetCompanyId,
                    OR: [
                        { username },
                        ...(email ? [{ email }] : []),
                        ...(identifiant_extern ? [{ identifiant_extern }] : []),
                    ],
                },
            });

            if (exists) {
                // Optionally update the existing user's phone/external ID if they were missing
                await prisma.users.update({
                    where: { id: exists.id },
                    data: {
                        ...(phone && !exists.phone ? { phone } : {}),
                        ...(identifiant_extern && !exists.identifiant_extern ? { identifiant_extern } : {}),
                    }
                });
                continue;
            }

            // Check limit before creating a new user
            if (currentCount >= limit) continue;

            const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            await prisma.users.create({
                data: {
                    fullname: u.fullname || u.full_name || u.name || u.display_name || null,
                    email,
                    username,
                    password: tempPassword,
                    phone,
                    identifiant_extern: isNaN(identifiant_extern as number) ? null : identifiant_extern,
                    role: 'PARTICIPANT',
                    company_id: targetCompanyId,
                },
            });
            imported++;
            currentCount++;
        }

        return NextResponse.json({
            status: true,
            data: { imported },
            message: `${imported} users imported successfully`,
        });
    } catch (error) {
        console.error('Error importing users:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
