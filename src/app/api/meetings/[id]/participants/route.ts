import { NextRequest, NextResponse } from 'next/server';
import { escapeHtml } from '@/lib/html';
import { prisma } from '@/lib/prisma';
import { requireUser, assertMeetingAccess, httpErrorResponse, toPositiveInt, HttpError } from '@/lib/authz';
import { PARTICIPANT_PUBLIC_SELECT } from '@/lib/safe-select';
import { getMailTransporter, getEmailTemplate } from '@/lib/mail';
import { createLog } from '@/lib/logger';

function errorResponse(label: string, error: unknown) {
    const r = httpErrorResponse(error);
    if (r) return r;
    console.error(label, error);
    return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
}

async function resolveMeetingId(params: Promise<{ id: string }>): Promise<number> {
    const { id } = await params;
    const meetingId = toPositiveInt(id);
    if (!meetingId) throw new HttpError(404, 'Meeting not found');
    return meetingId;
}

// GET list of participants for a meeting
/**
 * @description AI Agent Documentation
 * Endpoint: /api/meetings/[id]/participants
 * Method: GET
 * 
 * PURPOSE:
 * Use this endpoint to retrieve data for `/api/meetings/[id]/participants`.
 * Before calling, map the user's request to the properties available in the Prisma schema for the models listed below.
 * 
 * PRISMA MODELS ACCESSED IN THIS ENDPOINT:
 * - Model: `meetings_participants`
 * - Model: `meetings`
 * RELATIONS INCLUDED: 
 * None
 * 
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
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireUser(req);
        const id = await resolveMeetingId(params);
        await assertMeetingAccess(user, id, 'read');

        // Join tokens are never listed — each invitee only gets his own by email.
        const participants = await prisma.meetings_participants.findMany({
            where: { meeting_id: id },
            select: PARTICIPANT_PUBLIC_SELECT,
            orderBy: { id: 'asc' }
        });

        return NextResponse.json({ status: true, data: participants });
    } catch (error) {
        return errorResponse('Error fetching participants:', error);
    }
}

// POST add participant(s) and send invitation
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireUser(req);
        const id = await resolveMeetingId(params);
        await assertMeetingAccess(user, id, 'manage');
        const { emails } = await req.json(); // array of email strings
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return NextResponse.json({ status: false, message: 'emails array is required' }, { status: 400 });
        }

        const meeting = await prisma.meetings.findUnique({
            where: { id: id },
            select: { id: true, subject: true, date: true, time: true, company_id: true },
        });
        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        const created = [];
        for (const email of emails) {
            if (typeof email !== 'string') continue;
            const trimmed = email.trim().toLowerCase();
            if (!trimmed) continue;
            // Skip if already a participant
            const existing = await prisma.meetings_participants.findFirst({
                where: { meeting_id: id, email: trimmed },
            });
            if (existing) continue;

            const participant = await prisma.meetings_participants.create({
                data: { email: trimmed, meeting_id: id, token: crypto.randomUUID() },
            });
            created.push(participant);
        }

        // Send invitation emails
        if (created.length > 0) {
            try {
                const mailer = await getMailTransporter();
                if (mailer) {
                    const { transporter, settings } = mailer;
                    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
                    if (!siteUrl) return NextResponse.json({ status: false, message: 'Error find domain url.' });
                    const companyName = 'Axia Meetings'; // Could fetch from DB if needed

                    for (const participant of created) {
                        const joinUrl = `${siteUrl}/meetings/${id}/join?token=${participant.token}&email=${encodeURIComponent(participant.email)}`;
                        
                        const html = getEmailTemplate(`
                            <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
                                Vous avez été invité à participer à une réunion. Veuillez consulter les détails ci-dessous et confirmer votre présence.
                            </p>

                            <h2 style="color:#0f172a;font-size:20px;font-weight:700;margin:0 0 8px;">${escapeHtml(meeting.subject)}</h2>

                            <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:28px;">
                                <table style="width:100%;border-collapse:collapse;">
                                <tr>
                                    <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;width:100px;">📅 Date</td>
                                    <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(meeting.date)}</td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">⏰ Heure</td>
                                    <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(meeting.time)}</td>
                                </tr>
                                </table>
                            </div>

                            <div style="text-align:center;margin-bottom:28px;">
                                <a href="${escapeHtml(joinUrl)}" style="display:inline-block;background:#002B5B;color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
                                    Voir la réunion & Répondre
                                </a>
                            </div>
                        `, `Nouvelle Invitation à une Réunion`, companyName);

                        await transporter.sendMail({
                            from: `"${settings.from_name}" <${settings.from_email}>`,
                            to: participant.email,
                            subject: `📩 Invitation: ${meeting.subject}`,
                            html: html,
                        });
                    }
                }
            } catch (emailError) {
                console.error('Email sending failed:', emailError);
            }
        }

        if (created.length > 0) {
            await createLog({
                message: `Added ${created.length} participant(s) to meeting: ${meeting.subject}`,
                userId: user.userId,
                companyId: meeting.company_id,
                payload: { emails },
                response: { success: true, count: created.length }
            });
        }

        // Tokens stay server-side (they were only needed for the invitation emails above).
        const data = created.map(({ id: pid, email, meeting_id }) => ({ id: pid, email, meeting_id }));
        return NextResponse.json({ status: true, data, message: `${created.length} participant(s) added` }, { status: 201 });
    } catch (error) {
        return errorResponse('Error adding participants:', error);
    }
}

// DELETE remove a participant
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireUser(req);
        const id = await resolveMeetingId(params);
        await assertMeetingAccess(user, id, 'manage');
        const body = await req.json();
        const participant_id = toPositiveInt(body?.participant_id);
        if (!participant_id) return NextResponse.json({ status: false, message: 'participant_id is required' }, { status: 400 });

        // The participant must belong to this meeting (no cross-meeting / cross-company deletes).
        const target = await prisma.meetings_participants.findFirst({
            where: { id: participant_id, meeting_id: id },
            select: { id: true },
        });
        if (!target) return NextResponse.json({ status: false, message: 'Participant not found' }, { status: 404 });

        // Delete related records first
        await prisma.meetings_votes.deleteMany({ where: { meetings_participant_id: participant_id } });
        await prisma.meetings_attendances.deleteMany({ where: { meetings_participant_id: participant_id, meeting_id: id } });
        await prisma.meetings_invitations.deleteMany({ where: { meetings_participant_id: participant_id, meeting_id: id } });
        await prisma.meetings_turn_requests.deleteMany({ where: { meetings_participant_id: participant_id } });
        const deletedParticipant = await prisma.meetings_participants.delete({ where: { id: participant_id } });

        const meeting = await prisma.meetings.findUnique({
            where: { id: id },
            select: { company_id: true, subject: true }
        });

        if (meeting) {
            await createLog({
                message: `Removed participant (${deletedParticipant.email}) from meeting: ${meeting.subject}`,
                userId: user.userId,
                companyId: meeting.company_id,
                payload: { participant_id },
                response: { success: true }
            });
        }

        return NextResponse.json({ status: true, message: 'Participant removed' });
    } catch (error) {
        return errorResponse('Error removing participant:', error);
    }
}
