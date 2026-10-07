import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';
import crypto from 'crypto';
import { escapeHtml } from '@/lib/html';
import { rateLimit, getIp } from '@/lib/rate-limit';

const UNIFORM_MESSAGE = 'If an account exists, a reset email has been sent.';

export async function POST(req: NextRequest) {
    const ip = getIp(req);
    if (!await rateLimit(`forgot-password:${ip}`, 5, 60000)) {
        return NextResponse.json({ status: false, message: 'Too many reset requests. Please try again later.' }, { status: 429 });
    }
    try {
        const body = await req.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email) {
            return NextResponse.json({ status: false, message: 'Email is required' }, { status: 400 });
        }

        const user = await prisma.users.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            orderBy: { id: 'asc' },
        });

        // Always respond the same way to prevent user enumeration
        if (!user) {
            return NextResponse.json({ status: true, message: UNIFORM_MESSAGE });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.users.update({
            where: { id: user.id },
            data: { reset_token: token, reset_token_expiry: expiry },
        });

        let baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
        if (!baseUrl && process.env.NODE_ENV !== 'production') {
            // Dev convenience only: in production the Host / X-Forwarded-Host headers are
            // attacker-controlled (reset-link poisoning), so NEXT_PUBLIC_SITE_URL is required.
            const host = req.headers.get('host') || '';
            if (host) baseUrl = `http://${host}`;
        }
        if (!baseUrl) {
            // Configuration problem: log it, but answer like every other case (no enumeration).
            console.error('Forgot password: NEXT_PUBLIC_SITE_URL is not set; reset email not sent.');
            return NextResponse.json({ status: true, message: UNIFORM_MESSAGE });
        }
        const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

        // Send in the background: awaiting SMTP would make known emails measurably slower (N44).
        void sendResetMail(user, resetUrl).catch((err) => console.error('Forgot password mail error:', err));

        return NextResponse.json({ status: true, message: UNIFORM_MESSAGE });
    } catch (error) {
        console.error('Forgot password error:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

async function sendResetMail(user: { fullname: string | null; email: string | null }, resetUrl: string) {
    const mail = await getMailTransporter();
    if (mail) {
        const { transporter, settings } = mail;
        const companyName = settings.from_name || 'Axia Meetings';

        const content = `
            <p style="font-size:16px; color:#334155; margin:0 0 16px;">Bonjour <strong>${escapeHtml(user.fullname || user.email || '')}</strong>,</p>
            <p style="font-size:15px; color:#64748b; margin:0 0 24px; line-height:1.6;">
                Nous avons reçu une demande de réinitialisation du mot de passe pour votre compte <strong>${companyName}</strong>.
                Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe. Ce lien expire dans <strong>1 heure</strong>.
            </p>
            <div style="text-align:center; margin: 32px 0;">
                <a href="${resetUrl}"
                   style="display:inline-block; background:linear-gradient(135deg,#002B5B 0%,#004c8c 100%); color:#fff;
                          text-decoration:none; font-weight:700; font-size:15px; padding:16px 36px;
                          border-radius:12px; letter-spacing:0.3px;">
                    Réinitialiser mon mot de passe
                </a>
            </div>
            <p style="font-size:13px; color:#94a3b8; margin:24px 0 0; line-height:1.6;">
                Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email — votre mot de passe ne sera pas modifié.
            </p>
            <p style="font-size:12px; color:#cbd5e1; margin:12px 0 0;">
                Ou copiez ce lien dans votre navigateur :<br/>
                <span style="color:#002B5B; word-break:break-all;">${resetUrl}</span>
            </p>
        `;

        const html = getEmailTemplate(content, 'Réinitialisation du mot de passe', companyName);

        await transporter.sendMail({
            from: `"${settings.from_name}" <${settings.from_email || settings.email}>`,
            to: user.email!,
            subject: `${companyName} — Réinitialisation du mot de passe`,
            html,
        });
    }
}
