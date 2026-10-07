import { NextRequest, NextResponse } from 'next/server';
import { escapeHtml } from '@/lib/html';
import { prisma } from '@/lib/prisma';
import { requireRole, httpErrorResponse, type StaffActor } from '@/lib/authz';
import { createLog } from '@/lib/logger';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';

/** Developer-only route: DB-checked role, no email-based bypass. */
async function requireDeveloper(req: NextRequest): Promise<StaffActor | NextResponse> {
    try {
        return await requireRole(req, 'DEVELOPER');
    } catch (e) {
        const r = httpErrorResponse(e);
        if (r) return r;
        console.error('Authorization check failed:', e);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;

    try {
        // Never send the stored password hash to the browser.
        const requests = await prisma.signup_requests.findMany({
            omit: { password: true },
            orderBy: { created_at: 'desc' },
        });
        return NextResponse.json({ status: true, data: requests });
    } catch (error) {
        console.error('Error fetching signup requests:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const authUser = await requireDeveloper(req);
    if (authUser instanceof NextResponse) return authUser;

    try {
        const body = await req.json();
        const { requestId, action, rejection_reason } = body;

        if (!requestId || !action) {
            return NextResponse.json({ status: false, message: 'requestId and action are required' }, { status: 400 });
        }

        if (!['APPROVE', 'REJECT'].includes(action)) {
            return NextResponse.json({ status: false, message: 'action must be APPROVE or REJECT' }, { status: 400 });
        }

        const signupRequest = await prisma.signup_requests.findUnique({
            where: { id: Number(requestId) },
        });

        if (!signupRequest) {
            return NextResponse.json({ status: false, message: 'Signup request not found' }, { status: 404 });
        }

        if (signupRequest.status !== 'PENDING') {
            return NextResponse.json({ status: false, message: `Request is already ${signupRequest.status.toLowerCase()}` }, { status: 400 });
        }

        if (action === 'REJECT') {
            const updated = await prisma.signup_requests.update({
                omit: { password: true },
                where: { id: signupRequest.id },
                data: {
                    status: 'REJECTED',
                    rejection_reason: rejection_reason || null,
                    reviewed_at: new Date(),
                },
            });

            // Send rejection email to notify the requester
            try {
                const mailer = await getMailTransporter();
                if (mailer) {
                    const { transporter, settings } = mailer;
                    const emailHtml = getEmailTemplate(`
                        <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 16px;">
                            Bonjour ${escapeHtml(signupRequest.fullname)},
                        </p>
                        <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;">
                            Nous avons examiné votre demande de création d'espace pour l'entreprise <strong>${escapeHtml(signupRequest.company_name)}</strong> sur notre plateforme <strong>Axia Meetings</strong>.
                        </p>
                        <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;">
                            Malheureusement, votre demande n'a pas pu être acceptée pour le motif suivant :
                        </p>
                        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 0 0 24px; border-radius: 4px;">
                            <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 500;">
                                ${escapeHtml(rejection_reason || "Non spécifié.")}
                            </p>
                        </div>
                        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
                            Si vous pensez qu'il s'agit d'une erreur ou si vous souhaitez soumettre de nouvelles informations, n'hésitez pas à nous contacter à nouveau via notre formulaire de contact.
                        </p>
                    `, "Demande d'inscription refusée", settings.from_name || 'Support Axia Meetings');

                    await transporter.sendMail({
                        from: `"${settings.from_name}" <${settings.from_email}>`,
                        to: signupRequest.email,
                        subject: `Votre demande d'inscription - Axia Meetings`,
                        html: emailHtml,
                    });
                    console.log(`[Mail] Rejection email successfully sent to ${signupRequest.email}`);
                }
            } catch (mailError) {
                console.error('[Mail] Failed to send rejection email:', mailError);
            }

            await createLog({
                userId: authUser.userId,
                companyId: authUser.companyId,
                message: `Rejected signup request from ${signupRequest.email}`,
                payload: { requestId, rejection_reason },
            });

            return NextResponse.json({ status: true, data: updated });
        }

        // APPROVE: provision the company and admin user. Signup answers the same for a known
        // email (N44), so a request may duplicate an existing account: refuse it here.
        const emailTaken = await prisma.users.findFirst({
            where: { email: { equals: signupRequest.email.trim(), mode: 'insensitive' } },
            select: { id: true },
        });
        if (emailTaken) {
            return NextResponse.json({ status: false, code: 'EMAIL_TAKEN', message: 'An account with this email address already exists. Reject this request instead.' }, { status: 409 });
        }

        const company = await prisma.companies.create({
            data: {
                name: signupRequest.company_name,
                logo_url: '',
                url: signupRequest.company_url || '',
                database_schema: '',
                meeting_time_limit: 'ONE_HOUR',
                users_number_limit: 10,
            },
        });

        // Generate a unique username from email
        const baseUsername = signupRequest.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const existingUser = await prisma.users.findFirst({ where: { username: baseUsername } });
        const username = existingUser ? `${baseUsername}_${company.id}` : baseUsername;

        await prisma.users.create({
            data: {
                fullname: signupRequest.fullname,
                email: signupRequest.email.trim().toLowerCase(),
                username,
                password: signupRequest.password, // already hashed at signup time
                role: 'ADMIN',
                company_id: company.id,
            },
        });

        const updated = await prisma.signup_requests.update({
            omit: { password: true },
            where: { id: signupRequest.id },
            data: {
                status: 'APPROVED',
                reviewed_at: new Date(),
                provisioned_company_id: company.id,
            },
        });

        // Send approval email to notify the requester
        try {
            const mailer = await getMailTransporter();
            if (mailer) {
                const { transporter, settings } = mailer;
                const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
                if (!siteUrl) return NextResponse.json({ status: false, message: 'Error find domain url.' });
                const emailHtml = getEmailTemplate(`
                    <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 16px;">
                        Bonjour ${escapeHtml(signupRequest.fullname)},
                    </p>
                    <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;">
                        Nous avons le plaisir de vous annoncer que votre demande de création d'espace pour l'entreprise <strong>${escapeHtml(signupRequest.company_name)}</strong> a été <strong>approuvée</strong> !
                    </p>
                    <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 16px;">
                        Votre compte Administrateur a été créé avec succès. Voici vos informations de connexion :
                    </p>
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 0 0 24px;">
                        <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 14px; color: #475569;">
                            <tr>
                                <td width="35%" style="font-weight: bold; padding: 4px 0;">Lien de connexion :</td>
                                <td style="padding: 4px 0;"><a href="${siteUrl}/auth/login" style="color: #002B5B; text-decoration: underline; font-weight: bold;">${siteUrl}/auth/login</a></td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold; padding: 4px 0;">Nom d'utilisateur :</td>
                                <td style="font-family: monospace; font-size: 15px; color: #002B5B; font-weight: bold; padding: 4px 0;">${escapeHtml(username)}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold; padding: 4px 0;">Adresse Email :</td>
                                <td style="padding: 4px 0;">${escapeHtml(signupRequest.email)}</td>
                            </tr>
                        </table>
                    </div>
                    <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;">
                        Vous pouvez dès à présent vous connecter, configurer vos équipes, inviter des collaborateurs et commencer à organiser vos réunions.
                    </p>
                    <div style="text-align:center;margin:32px 0;">
                        <a href="${siteUrl}/auth/login" style="display:inline-block;background:#002B5B;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;box-shadow:0 4px 6px rgba(0,43,91,0.15);">
                            Se connecter à mon espace
                        </a>
                    </div>
                `, "Espace de réunion activé", settings.from_name || 'Support Axia Meetings');

                await transporter.sendMail({
                    from: `"${settings.from_name}" <${settings.from_email}>`,
                    to: signupRequest.email,
                    subject: `Votre espace Axia Meetings est prêt !`,
                    html: emailHtml,
                });
                console.log(`[Mail] Approval email successfully sent to ${signupRequest.email}`);
            }
        } catch (mailError) {
            console.error('[Mail] Failed to send approval email:', mailError);
        }

        await createLog({
            userId: authUser.userId,
            companyId: authUser.companyId,
            message: `Approved signup request from ${signupRequest.email} — provisioned company ${company.name} (ID: ${company.id})`,
            payload: { requestId, companyId: company.id },
        });

        return NextResponse.json({ status: true, data: updated, company });
    } catch (error) {
        console.error('Error processing signup request:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const user = await requireDeveloper(req);
    if (user instanceof NextResponse) return user;
    try {
        const body = await req.json().catch(() => ({}));
        const { id, ids } = body;
        
        if (id) {
            await prisma.signup_requests.delete({ where: { id: Number(id) } });
            await createLog({
                userId: user.userId,
                companyId: user.companyId,
                message: `Deleted signup request ID ${id}`,
                payload: { id }
            });
        } else if (ids && Array.isArray(ids)) {
            const numericIds = ids.map(Number);
            await prisma.signup_requests.deleteMany({ where: { id: { in: numericIds } } });
            await createLog({
                userId: user.userId,
                companyId: user.companyId,
                message: `Bulk deleted signup requests: ${numericIds.join(', ')}`,
                payload: { ids: numericIds }
            });
        } else {
            return NextResponse.json({ status: false, message: 'ID or IDs required' }, { status: 400 });
        }
        return NextResponse.json({ status: true });
    } catch (error) {
        console.error('Error deleting signup requests:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

