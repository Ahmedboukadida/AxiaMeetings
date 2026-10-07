import { sendPushNotification } from './notifications';
import { escapeHtml } from '@/lib/html';
import { sendSMS } from './sms';
import { getMailTransporter, getEmailTemplate } from './mail';

interface NotifierOptions {
    companyId: number;
    meeting: any;
    type: 'INVITATION' | 'UPDATE' | 'CANCEL' | 'START' | 'FINISHED';
    subject: string;
    body: string;
    participants: { email: string; token: string }[];
}

export async function notifyParticipants(options: NotifierOptions) {
    const { companyId, meeting, type, subject, body, participants } = options;
    const emails = participants.map(p => p.email);

    console.log(`[Notifier] Processing ${type} for ${emails.length} participants in company ${companyId}`);
    console.log(`[Notifier] Emails:`, emails);

    // 1. Send Push Notifications
    let expired = false;
    let pushMessage = '';
    const pushResult = await sendPushNotification(companyId, {
        title: subject,
        body: body,
        meeting_id: meeting.id,
        type: type === 'INVITATION' ? 'INVITATION' : 
              type === 'CANCEL' ? 'CANCEL' : 
              type === 'START' ? 'START' : 
              type === 'FINISHED' ? 'FINISHED' : 'UPDATE',
        participants: emails
    }).catch((err: any) => {
        console.error('Push Notify Error:', err);
        return null;
    });

    if (pushResult && (pushResult as any).expired) {
        expired = true;
        if ((pushResult as any).pushMessage) {
            pushMessage = (pushResult as any).pushMessage;
        }
    }

    // 2. Send SMS
    sendSMS(companyId, {
        body: `${subject}: ${body}`,
        participants: emails
    }).catch(err => console.error('SMS Notify Error:', err));

    // 3. Send Email
    try {
        const mailer = await getMailTransporter();
        if (mailer) {
            const { transporter, settings } = mailer;
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
            if (!siteUrl) { console.error('[Notifier] NEXT_PUBLIC_SITE_URL is not configured'); return { expired, pushMessage }; }
            
            for (const participant of participants) {
                const joinUrl = `${siteUrl}/meetings/${meeting.id}/join?token=${participant.token}&email=${encodeURIComponent(participant.email)}`;
                
                const html = getEmailTemplate(`
                    <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
                        ${escapeHtml(body)}
                    </p>
                    <div style="text-align:center;margin:24px 0;">
                        <a href="${escapeHtml(joinUrl)}" style="display:inline-block;background:#002B5B;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">
                            Cliquez ici pour accéder à la réunion
                        </a>
                    </div>
                `, subject, meeting.company?.name || 'Axia Meetings');

                transporter.sendMail({
                    from: `"${settings.from_name}" <${settings.from_email}>`,
                    to: participant.email,
                    subject: `📩 ${subject}`,
                    html: html,
                }).catch(err => console.error(`Email send failed for ${participant.email}:`, err));
            }
        }
    } catch (err) {
        console.error('Email Transporter Error:', err);
    }

    return { expired, pushMessage };
}
