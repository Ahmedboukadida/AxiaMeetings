import { sendPushNotification } from './push_notifications';
import { sendPushMessage } from './push_messages';
import { sendPushMail } from './push_mails';
import { sendPushSMS } from './push_sms';
import { prisma } from '../prisma';
import { escapeHtml } from '../html';

interface PushOptions {
    companyId: number;
    meetingId: number;
    action: 'CREATE' | 'UPDATE' | 'RESCHEDULE' | 'CANCEL' | 'START' | 'FINISHED';
    adminLocale?: string;
}

export async function dispatchMeetingPush(options: PushOptions) {
    const { companyId, meetingId, action, adminLocale = 'en' } = options;
    console.log(`[PushDispatcher] Dispatching ${action} for meeting ${meetingId} in company ${companyId}`);

    // Fetch meeting details
    const meeting = await prisma.meetings.findUnique({
        where: { id: meetingId },
        include: {
            meetings_participants: {
                include: {
                    // We need user emails/phones/external ids. 
                    // Usually meeting_participants has email and token, but we might need to link to users table
                }
            }
        }
    });

    if (!meeting) return;

    // Resolve participants details from `users` table via email
    const emails = meeting.meetings_participants.map(p => p.email);
    const users = await prisma.users.findMany({
        where: { 
            company_id: companyId,
            email: { in: emails } 
        }
    });

    // We only push to those with an external ID
    const participantExternalIds: number[] = [];
    const participantPhones: string[] = [];
    const validEmails: string[] = [];
    const joinUrlMap: Record<string, string> = {};

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    if (!siteUrl) { console.error('[PushDispatcher] NEXT_PUBLIC_SITE_URL is not configured'); return; }

    for (const p of meeting.meetings_participants) {
        const u = users.find(user => user.email === p.email);
        if (u && u.identifiant_extern) {
            participantExternalIds.push(u.identifiant_extern);
        }
        if (u && u.phone) {
            participantPhones.push(u.phone);
        }
        validEmails.push(p.email);
        joinUrlMap[p.email] = `${siteUrl}/meetings/${meeting.id}/join?token=${p.token}&email=${encodeURIComponent(p.email)}`;
    }
    
    // Create a map of externalId to join URL for push notifications/messages/SMS
    const externalIdJoinUrlMap: Record<number, string> = {};
    for (const p of meeting.meetings_participants) {
        const u = users.find(user => user.email === p.email);
        if (u && u.identifiant_extern) {
            externalIdJoinUrlMap[u.identifiant_extern] = `${siteUrl}/meetings/${meeting.id}/join?token=${p.token}&email=${encodeURIComponent(p.email)}`;
        }
    }

    if (participantExternalIds.length === 0 && validEmails.length === 0) {
        console.log(`[PushDispatcher] No valid participants with external IDs or emails to notify.`);
        return;
    }

    // Determine the content based on action and locale
    let title = '';
    let contentTemplate = '';

    const locale = adminLocale.toLowerCase().startsWith('fr') || adminLocale.toLowerCase().startsWith('ar') ? 'fr' : 'en';

    if (locale === 'fr') {
        switch (action) {
            case 'CREATE':
                title = `Nouv: ${meeting.subject}`;
                contentTemplate = `Prévue le ${meeting.date} à ${meeting.time}.`;
                break;
            case 'UPDATE':
                title = `MAJ: ${meeting.subject}`;
                contentTemplate = `Détails mis à jour.`;
                break;
            case 'RESCHEDULE':
                title = `Report: ${meeting.subject}`;
                contentTemplate = `Reporté au ${meeting.date} à ${meeting.time}.`;
                break;
            case 'CANCEL':
                title = `Annulé: ${meeting.subject}`;
                contentTemplate = `Réunion annulée.`;
                break;
            case 'START':
                title = `En cours: ${meeting.subject}`;
                contentTemplate = `La réunion a commencé.`;
                break;
            case 'FINISHED':
                title = `Terminé: ${meeting.subject}`;
                contentTemplate = `Réunion clôturée.`;
                break;
        }
    } else {
        switch (action) {
            case 'CREATE':
                title = `New: ${meeting.subject}`;
                contentTemplate = `Scheduled for ${meeting.date} at ${meeting.time}.`;
                break;
            case 'UPDATE':
                title = `Updated: ${meeting.subject}`;
                contentTemplate = `Details updated.`;
                break;
            case 'RESCHEDULE':
                title = `Rescheduled: ${meeting.subject}`;
                contentTemplate = `Moved to ${meeting.date} at ${meeting.time}.`;
                break;
            case 'CANCEL':
                title = `Cancelled: ${meeting.subject}`;
                contentTemplate = `Meeting cancelled.`;
                break;
            case 'START':
                title = `Started: ${meeting.subject}`;
                contentTemplate = `Meeting has begun.`;
                break;
            case 'FINISHED':
                title = `Finished: ${meeting.subject}`;
                contentTemplate = `Meeting concluded.`;
                break;
        }
    }

    // Check company configuration for which services are enabled
    const company = await prisma.companies.findUnique({
        where: { id: companyId },
        select: { 
            have_notifications_service: true,
            have_messages_service: true,
            have_sms_service: true,
            have_mail_service: true,
            mail_is_active: true,
            push_mails_endpoint_id: true
        }
    });

    if (!company) return;

    const promises = [];

    // Push Notifications
    if (company.have_notifications_service && participantExternalIds.length > 0) {
        const notificationPromises = participantExternalIds.map((id, index) => {
            const participantEmail = validEmails[index] || '';
            const participantJoinUrl = externalIdJoinUrlMap[id] || `${siteUrl}/meetings/${meeting.id}/join`;
            const joinText = locale === 'en' ? 'Click here' : 'Cliquez ici';
            const pushContent = `${escapeHtml(contentTemplate)} <a href="${escapeHtml(participantJoinUrl)}">${joinText}</a>`;
            return sendPushNotification(companyId, title, pushContent, [id], meeting.id, {});
        });
        promises.push(...notificationPromises);
    }

    // Push Messages
    if (company.have_messages_service && participantExternalIds.length > 0) {
        const messagePromises = participantExternalIds.map((id, index) => {
            const participantEmail = validEmails[index] || '';
            const participantJoinUrl = externalIdJoinUrlMap[id] || `${siteUrl}/meetings/${meeting.id}/join`;
            const joinText = locale === 'en' ? 'Click here' : 'Cliquez ici';
            const pushContent = `${escapeHtml(contentTemplate)} <a href="${escapeHtml(participantJoinUrl)}">${joinText}</a>`;
            return sendPushMessage(companyId, title, pushContent, [id], meeting.id, {});
        });
        promises.push(...messagePromises);
    }

    // Push Mails
    if (company.mail_is_active || (company.have_mail_service && company.push_mails_endpoint_id)) {
        // Mail handles per-user join links internally for SMTP, or passes map for external API
        promises.push(sendPushMail(companyId, title, contentTemplate, participantExternalIds, validEmails, joinUrlMap, meeting.id));
    }

    // Push SMS
    if (company.have_sms_service && participantPhones.length > 0) {
        const smsPromises = participantExternalIds.map((id, index) => {
            const participantEmail = validEmails[index] || '';
            const participantJoinUrl = externalIdJoinUrlMap[id] || `${siteUrl}/meetings/${meeting.id}/join`;
            const joinText = locale === 'en' ? 'Click here' : 'Cliquez ici';
            const pushContent = `${escapeHtml(contentTemplate)} <a href="${escapeHtml(participantJoinUrl)}">${joinText}</a>`;
            return sendPushSMS(companyId, title, pushContent, [id], [participantPhones[index]], meeting.id, {});
        });
        promises.push(...smsPromises);
    }

    await Promise.allSettled(promises);
    console.log(`[PushDispatcher] Finished dispatching pushes for meeting ${meetingId}.`);
}
