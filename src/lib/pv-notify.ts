/**
 * Email every participant of a meeting a personal, signed link to the PV page
 * (/meetings/<id>/pv?t=<pvToken>), once a PV has been generated.
 *
 * Channel per recipient (owner decision): the company's own mail API when it is
 * configured (have_mail_service + push_mails endpoint, platform SMTP not forced via
 * mail_is_active) and the recipient is a known company user with an external id;
 * otherwise the platform SMTP settings.
 *
 * Never throws. Tokens/URLs are never written to logs.
 */
import { prisma } from './prisma';
import { getMailTransporter, getEmailTemplate } from './mail';
import { executeExternalApiAction } from './externalApiEngine';
import { createLog } from './logger';
import { escapeHtml } from './html';
import { signPvToken, buildPvUrl, pvLinkTtlDays } from './pv-link';
import frMessages from '../messages/fr.json';

// Emails are sent in French (platform default, consistent with existing templates).
// Strings live in messages/fr.json → PvView.emails so they are translated alongside the PV page.
type EmailKey = keyof typeof frMessages.PvView.emails;
function te(key: EmailKey, values: Record<string, string | number> = {}): string {
    const template = String(frMessages.PvView.emails[key] ?? key);
    return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in values ? String(values[name]) : m));
}

export interface PvNotifyResult {
    sent: number;
    failed: number;
}

const TZ = 'Africa/Tunis';

/** "lundi 6 octobre 2026" from a stored YYYY-MM-DD date (noon UTC avoids any day shift). */
export function formatMeetingDateFr(date: string): string {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function errorText(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err ?? 'unknown error');
    // Defensive: never let a signed token end up in the logs.
    return msg.replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted]').slice(0, 300);
}

function buildPvEmailHtml(opts: {
    subject: string;
    dateLabel: string;
    time: string;
    companyName: string;
    pvUrl: string;
    ttlDays: number;
}): string {
    const subject = escapeHtml(opts.subject);
    const company = escapeHtml(opts.companyName);
    const url = escapeHtml(opts.pvUrl);
    const label = (k: EmailKey) => escapeHtml(te(k));
    const content = `
        <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 20px;">
            ${label('greeting')}<br>
            ${label('intro')}
        </p>
        <div style="background-color:#f8fafc;padding:20px;border-radius:8px;margin-bottom:24px;">
            <p style="margin:0 0 8px 0;color:#64748b;font-size:14px;"><strong>${label('labelSubject')} :</strong> ${subject}</p>
            <p style="margin:0 0 8px 0;color:#64748b;font-size:14px;"><strong>${label('labelDate')} :</strong> ${escapeHtml(opts.dateLabel)}</p>
            <p style="margin:0 0 8px 0;color:#64748b;font-size:14px;"><strong>${label('labelTime')} :</strong> ${escapeHtml(opts.time)}</p>
            <p style="margin:0;color:#64748b;font-size:14px;"><strong>${label('labelOrganization')} :</strong> ${company}</p>
        </div>
        <div style="text-align:center;margin:30px 0;">
            <a href="${url}" style="display:inline-block;background:#002B5B;color:white;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:600;">
                ${label('button')}
            </a>
        </div>
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 12px;">
            ${escapeHtml(te('note', { days: opts.ttlDays }))}
        </p>
        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">
            ${label('fallback')}<br>
            <a href="${url}" style="color:#002B5B;text-decoration:underline;word-break:break-all;">${url}</a>
        </p>`;
    // getEmailTemplate escapes title and company name itself: pass them raw.
    return getEmailTemplate(content, te('title'), opts.companyName);
}

const SENT_LOG_PREFIX = 'PV links emailed for meeting ';

/** Participant ids that already received a PV link for this meeting (read from earlier runs' logs). */
async function alreadyNotifiedIds(meetingId: number): Promise<Set<number>> {
    const rows = await prisma.logs.findMany({
        where: { message: { startsWith: `${SENT_LOG_PREFIX}${meetingId}:` } },
        select: { payload: true },
    });
    const ids = new Set<number>();
    for (const r of rows) {
        const sentIds = (r.payload as { sentIds?: unknown } | null)?.sentIds;
        if (Array.isArray(sentIds)) for (const id of sentIds) if (typeof id === 'number') ids.add(id);
    }
    return ids;
}

/**
 * Send one PV link per participant (sequentially). Returns counts; never throws.
 * Each participant gets the link once per meeting: the link always shows the latest PV,
 * so regenerating a PV (AI or Word, overwrite) only emails participants who never got it.
 * Pass `resend: true` to email everyone again.
 */
export async function sendPvLinks(
    meetingId: number,
    opts: { pvDocumentId?: number | null; triggeredByUserId?: number | null; resend?: boolean } = {},
): Promise<PvNotifyResult> {
    const result: PvNotifyResult = { sent: 0, failed: 0 };
    const sentIds: number[] = [];
    const failures: { participantId: number; channel: string; error: string }[] = [];
    let companyId: number | null = null;

    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            select: {
                id: true,
                subject: true,
                date: true,
                time: true,
                company_id: true,
                company: {
                    select: { name: true, mail_is_active: true, have_mail_service: true, push_mails_endpoint_id: true },
                },
                meetings_participants: { select: { id: true, email: true }, orderBy: { id: 'asc' } },
            },
        });
        if (!meeting) return result;
        companyId = meeting.company_id;

        const skip = opts.resend ? new Set<number>() : await alreadyNotifiedIds(meetingId);
        const participants = meeting.meetings_participants.filter(
            (p) => typeof p.email === 'string' && p.email.includes('@') && !skip.has(p.id),
        );
        if (participants.length === 0) return result;

        if (!(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim()) {
            result.failed = participants.length;
            failures.push({ participantId: 0, channel: 'none', error: 'NEXT_PUBLIC_SITE_URL is not configured' });
            return result;
        }

        const company = meeting.company;
        const companyName = company?.name || 'Axia Meetings';
        const useApi = !!company && company.have_mail_service && company.push_mails_endpoint_id != null && !company.mail_is_active;

        // External ids of known company users (only needed for the company mail API).
        const externalIds = new Map<string, number>();
        if (useApi) {
            const users = await prisma.users.findMany({
                where: { company_id: meeting.company_id, email: { in: participants.map((p) => p.email) } },
                select: { email: true, identifiant_extern: true },
            });
            for (const u of users) if (u.email && u.identifiant_extern != null) externalIds.set(u.email, u.identifiant_extern);
        }

        const ttlDays = pvLinkTtlDays();
        const dateLabel = formatMeetingDateFr(meeting.date);
        const title = te('subject', { subject: meeting.subject });
        let mailer: Awaited<ReturnType<typeof getMailTransporter>> | undefined;

        for (const p of participants) {
            let channel = 'smtp';
            try {
                const token = signPvToken({ meetingId: meeting.id, participantId: p.id, email: p.email });
                const pvUrl = buildPvUrl(meeting.id, token);
                const html = buildPvEmailHtml({ subject: meeting.subject, dateLabel, time: meeting.time, companyName, pvUrl, ttlDays });

                const externalId = useApi ? externalIds.get(p.email) : undefined;
                if (externalId != null) {
                    channel = 'api';
                    const res: any = await executeExternalApiAction({
                        companyId: meeting.company_id,
                        actionType: 'push_mails',
                        payload: {
                            title,
                            body: html,
                            identifiant_extern: externalId,
                            emails: p.email,
                            join_urls: pvUrl,
                            pv_url: pvUrl,
                            meeting: meeting.id,
                            type: 'PV',
                        },
                    });
                    if (!res?.success) throw new Error(res?.message || 'Company mail API failed');
                } else {
                    if (mailer === undefined) mailer = await getMailTransporter().catch(() => null);
                    if (!mailer || !mailer.settings?.host) throw new Error('SMTP settings not configured');
                    const { transporter, settings } = mailer;
                    await transporter.sendMail({
                        from: `"${String(settings.from_name || 'AxiaMeetings').replace(/["\r\n]/g, '')}" <${settings.from_email || settings.email}>`,
                        to: p.email,
                        subject: `📄 ${title}`.replace(/[\r\n]+/g, ' '),
                        html,
                    });
                }
                result.sent++;
                sentIds.push(p.id);
            } catch (err) {
                result.failed++;
                failures.push({ participantId: p.id, channel, error: errorText(err) });
            }
        }
    } catch (err) {
        failures.push({ participantId: 0, channel: 'none', error: errorText(err) });
    } finally {
        if (failures.length > 0) console.error(`[PvNotify] meeting ${meetingId}: ${result.failed} PV link email(s) failed`);
        await createLog({
            message: `${SENT_LOG_PREFIX}${meetingId}: ${result.sent} sent, ${result.failed} failed`,
            userId: opts.triggeredByUserId ?? null,
            companyId,
            payload: { meetingId, pvDocumentId: opts.pvDocumentId ?? null, sent: result.sent, failed: result.failed, sentIds },
            response: failures.length ? { failures } : null,
        }).catch(() => undefined);
    }
    return result;
}
