import { executeExternalApiAction } from '../externalApiEngine';
import { getMailTransporter, getEmailTemplate } from '../mail';
import { prisma } from '../prisma';
import { escapeHtml } from '../html';

export async function sendPushMail(companyId: number, title: string, content: string, participantExternalIds: number[], participantsEmails: string[], joinUrlMap: Record<string, string>, meetingId: number) {
    // Check if company prefers internal SMTP
    const company = await prisma.companies.findUnique({
        where: { id: companyId },
        select: { mail_is_active: true, name: true }
    });

    if (company?.mail_is_active) {
        // Fallback to internal SMTP
        const mailer = await getMailTransporter();
        if (mailer) {
            const { transporter, settings } = mailer;
            
            // Fetch meeting details for email template
            const meeting = await prisma.meetings.findUnique({
                where: { id: meetingId },
                select: { subject: true, date: true, time: true }
            });
            
            for (const email of participantsEmails) {
                const joinUrl = escapeHtml(joinUrlMap[email] || '#');
                const meetingDetails = meeting ? `
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;"><strong>Subject:</strong> ${escapeHtml(meeting.subject)}</p>
                        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;"><strong>Date:</strong> ${escapeHtml(meeting.date)}</p>
                        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;"><strong>Time:</strong> ${escapeHtml(meeting.time)}</p>
                    </div>
                ` : '';
                
                const html = getEmailTemplate(`
                    <div style="text-align: center; padding: 20px 0;">
                        ${meetingDetails}
                        <p style="color:#334155;font-size:16px;line-height:1.7;margin:0 0 24px;">
                            ${escapeHtml(content)}
                        </p>
                        <div style="text-align:center;margin:30px 0;">
                            <a href="${joinUrl}" style="display:inline-block;background:#002B5B;color:white;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:600;letter-spacing:0.5px;">
                                Join Meeting / Accéder à la réunion
                            </a>
                        </div>
                        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:24px 0 0;">
                            If the button above doesn't work, please copy and paste the link below into your browser:<br>
                            <a href="${joinUrl}" style="color:#002B5B;text-decoration:underline;">${joinUrl}</a>
                        </p>
                    </div>
                `, title, company.name || 'Axia Meetings');

                transporter.sendMail({
                    from: `"${settings.from_name}" <${settings.from_email}>`,
                    to: email,
                    subject: `📩 ${title}`,
                    html: html,
                }).catch(err => console.error(`[PushMail] Internal SMTP send failed for ${email}:`, err));
            }
        }
        return { success: true, message: 'Dispatched via internal SMTP' };
    }

    // External API
    const promises = participantExternalIds.map((id, index) => {
        const email = participantsEmails[index];
        return executeExternalApiAction({
            companyId,
            actionType: 'push_mails',
            payload: {
                title,
                body: content,
                identifiant_extern: id,
                emails: email, // Send singular email
                join_urls: joinUrlMap[email] || '', // Send singular join URL
                meeting: meetingId
            }
        });
    });
    return Promise.allSettled(promises);
}
