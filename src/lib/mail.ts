import nodemailer from 'nodemailer';
import { prisma } from './prisma';
import { escapeHtml } from './html';

// Simple send helper used by new code (forgot-password, etc.)
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
    try {
        const settings = await prisma.app_settings.findFirst();
        if (!settings || !settings.host) {
            console.error('SMTP settings not configured');
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: settings.host,
            port: Number(settings.port) || 587,
            secure: settings.ssl ?? false,
            auth: {
                user: settings.email || '',
                pass: settings.email_password || '',
            },
        });

        const info = await transporter.sendMail({
            from: `"${settings.from_name || 'AxiaMeetings'}" <${settings.from_email || settings.email}>`,
            to,
            subject,
            html,
        });

        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email: ', error);
        return false;
    }
}

// Legacy helpers used across the existing codebase
export async function getMailTransporter() {
    const settings = await prisma.app_settings.findFirst();
    if (!settings) {
        console.error('SMTP settings not found in database');
        return null;
    }

    // Gmail & many modern providers use port 587 with STARTTLS.
    // In nodemailer, 'secure: true' is ONLY for port 465 (Implicit TLS).
    // For 587, 'secure' must be false.
    const isSecure = settings.port === 465;

    console.log(`[Mail] Configuring transporter: ${settings.host}:${settings.port} (secure: ${isSecure})`);

    const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: isSecure,
        auth: {
            user: settings.email,
            pass: settings.email_password,
        },
        tls: {
            // Do not fail on invalid certs
            rejectUnauthorized: false,
        },
        debug: true,
        logger: true,
    } as any);

    return { transporter, settings };
}

/**
 * Wrap trusted email body HTML (`content`) in the platform layout.
 * `title` and `companyName` are plain text and are escaped here; callers must pass them raw.
 */
export function getEmailTemplate(content: string, rawTitle: string, rawCompanyName: string) {
    const title = escapeHtml(rawTitle);
    const companyName = escapeHtml(rawCompanyName);
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f7fa; padding: 40px 0;">
        <tr>
            <td align="center">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #002B5B 0%, #004c8c 100%); padding: 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">${companyName}</h1>
                            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">${title}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px; background-color: #ffffff; line-height: 1.6;">
                            ${content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f8fafc; border-top: 1px solid #edf2f7; text-align: center;">
                            <p style="margin: 0; font-size: 13px; color: #94a3b8;">
                                Ceci est un message automatique de la plateforme <strong>Axia Meetings</strong>.
                            </p>
                            <p style="margin: 10px 0 0; font-size: 12px; color: #cbd5e1;">
                                &copy; ${new Date().getFullYear()} Axia Agile. Tous droits réservés.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
}