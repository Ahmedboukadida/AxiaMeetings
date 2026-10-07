import { NextRequest, NextResponse } from 'next/server';
import { computeEndTime } from '@/lib/durations';
import { normaliseVote, toId, checkVoteTarget, recordVote, tallyVotes } from '@/lib/votes';
import { prisma } from '@/lib/prisma';
import { createLog } from '@/lib/logger';
import { notifyParticipants } from '@/lib/notifier';
import { saveUpload } from '@/lib/storage';
import {
    type Actor,
    assertMeetingAccess,
    HttpError,
    httpErrorResponse,
    isMeetingStaff,
    requireMeetingActor,
    requireUser,
} from '@/lib/authz';
import { PARTICIPANT_PUBLIC_SELECT } from '@/lib/safe-select';

const MEETING_STATUSES = ['SCHEDULED', 'CANCELLED', 'STARTED', 'FINISHED'] as const;
const TURN_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'FINISHED'] as const;

/**
 * Participant row of this meeting that the actor speaks for:
 * invitee -> his own row; logged-in user -> the row with his email (if invited).
 */
async function ownParticipantId(actor: Actor, meetingId: number): Promise<number | null> {
    if (actor.kind === 'invitee') return actor.participantId;
    if (!actor.email) return null;
    const row = await prisma.meetings_participants.findFirst({
        where: { meeting_id: meetingId, email: actor.email },
        select: { id: true },
    });
    return row?.id ?? null;
}

/**
 * GET /api/meetings/[id]/live — live room data.
 * Auth: session, or invitee token+email (query or x-participant-* headers) with an
 * ACCEPTED invitation (403 + requireAcceptance otherwise). Invitees get 403 once FINISHED.
 * Participant join tokens are never returned. Non-staff viewers get vote values
 * only (latest per voter, no voter ids). `participantId` = caller's own participant row.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const meetingId = toId(id);
        if (!meetingId) return NextResponse.json({ status: false, message: 'Invalid meeting id' }, { status: 400 });

        const actor = await requireMeetingActor(req, meetingId, { requireAccepted: true });
        const scope = await assertMeetingAccess(actor, meetingId, 'read');

        if (scope.status === 'FINISHED' && actor.kind === 'invitee') {
            return NextResponse.json({ status: false, message: 'This meeting has ended.' }, { status: 403 });
        }

        const staff = isMeetingStaff(actor, scope);
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                meetings_points: {
                    include: {
                        meetings_votes: {
                            orderBy: { id: 'asc' },
                            select: { id: true, point_id: true, meetings_participant_id: true, vote: true },
                        },
                    },
                },
                meetings_participants: { select: PARTICIPANT_PUBLIC_SELECT },
                meetings_turn_requests: { where: { status: 'PENDING' }, orderBy: { created_at: 'asc' } },
                meetings_attendances: true,
                meetings_documents: true,
            },
        });
        if (!meeting) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });

        const data = staff
            ? meeting
            : {
                ...meeting,
                meetings_points: meeting.meetings_points.map((p) => {
                    // Latest vote per participant, values only (the UI just counts them).
                    const latest = new Map<number, string>();
                    for (const v of p.meetings_votes) latest.set(v.meetings_participant_id, v.vote);
                    return { ...p, meetings_votes: [...latest.values()].map((vote) => ({ vote })) };
                }),
            };

        const participantId = await ownParticipantId(actor, meetingId);
        return NextResponse.json({ status: true, message: 'OK', data, participantId });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        console.error('Error fetching live meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/meetings/[id]/live — submit a vote `{ point_id, vote, meetings_participant_id? }`.
 * The voter is always the caller: invitee -> his participant row; logged-in user -> the
 * participant row with his email (403 if not invited). A different body id -> 403.
 * Only while the meeting is STARTED. Same rules as the socket path (src/lib/votes.ts).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const meetingId = toId(id);
        if (!meetingId) return NextResponse.json({ status: false, message: 'Invalid meeting id' }, { status: 400 });

        const actor = await requireMeetingActor(req, meetingId, { requireAccepted: true });
        const scope = await assertMeetingAccess(actor, meetingId, 'read');

        const body = await req.json().catch(() => null);
        const pointId = toId(body?.point_id);
        const vote = normaliseVote(body?.vote);
        if (!pointId || !body?.vote) {
            return NextResponse.json({ status: false, message: 'point_id and vote are required' }, { status: 400 });
        }
        if (!vote) {
            return NextResponse.json({ status: false, message: 'vote must be one of OUI, NON, NEUTRE' }, { status: 400 });
        }

        const participantId = await ownParticipantId(actor, meetingId);
        if (!participantId) throw new HttpError(403, 'You are not a participant of this meeting');
        const bodyParticipantId = body?.meetings_participant_id;
        if (bodyParticipantId != null && toId(bodyParticipantId) !== participantId) {
            throw new HttpError(403, 'You can only vote for yourself');
        }
        if (scope.status !== 'STARTED') {
            return NextResponse.json({ status: false, message: 'Voting is only possible while the meeting is live' }, { status: 409 });
        }

        const target = await checkVoteTarget(prisma, meetingId, pointId, participantId);
        if (!target.ok) {
            return NextResponse.json({ status: false, message: target.message }, { status: target.status });
        }

        await recordVote(prisma, pointId, participantId, vote);
        const tally = await tallyVotes(prisma, pointId);

        // Keep live rooms in sync (custom server exposes Socket.IO on global.io).
        const io = (global as any).io;
        if (io) io.to(`meeting-${meetingId}`).emit('vote:update', { noteId: pointId, ...tally });

        const meeting = await prisma.meetings.findUnique({ where: { id: meetingId }, select: { subject: true, company_id: true } });
        const participant = await prisma.meetings_participants.findUnique({ where: { id: participantId }, select: { email: true } });

        await createLog({
            message: `Vote recorded: ${participant?.email} voted ${vote} on point "${target.point.point}" in meeting "${meeting?.subject}"`,
            userId: actor.kind === 'staff' ? actor.userId : undefined,
            companyId: meeting?.company_id,
            payload: { point_id: pointId, meetings_participant_id: participantId, vote },
            response: { success: true }
        });

        return NextResponse.json({ status: true, message: 'Vote recorded', data: tally });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        console.error('Error recording vote:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PUT /api/meetings/[id]/live — manager actions (session + manage access on the meeting):
 * - `{ action: 'update_status', status }` (STARTED only by the creator or a DEVELOPER)
 * - `{ action: 'turn_request', turn_request_id, turn_status }` (request must belong to this meeting)
 * Invitees never call PUT (hand raise / floor go through Socket.IO).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const meetingId = toId(id);
        if (!meetingId) return NextResponse.json({ status: false, message: 'Invalid meeting id' }, { status: 400 });

        const user = await requireUser(req);
        const scope = await assertMeetingAccess(user, meetingId, 'manage');

        const body = await req.json().catch(() => null);
        const { action, status, turn_request_id, turn_status } = body ?? {};

        if (action === 'update_status' && status) {
            if (!(MEETING_STATUSES as readonly string[]).includes(status)) {
                return NextResponse.json({ status: false, message: 'Invalid status' }, { status: 400 });
            }
            // Only the creator can start the meeting
            if (status === 'STARTED') {
                const existing = await prisma.meetings.findUnique({
                    where: { id: meetingId },
                    select: { creator_id: true, status: true },
                });
                if (!existing) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
                if (existing.creator_id !== user.userId && user.role !== 'DEVELOPER') {
                    return NextResponse.json({ status: false, message: 'Only the meeting creator can start the meeting' }, { status: 403 });
                }
                // Don't re-start if already started
                if (existing.status === 'STARTED') {
                    return NextResponse.json({ status: true, message: 'Already started' });
                }
            }

            const updated = await prisma.meetings.update({
                where: { id: meetingId },
                data: { status, editor_id: user.userId, updated_at: new Date() },
                include: {
                    // tokens needed for the join links in notifications; stripped from the response below
                    meetings_participants: true,
                    company: { select: { name: true } },
                },
            });

            let pushMessage = '';
            // When meeting starts, send unified notifications
            let expiredToken = false;
            if (status === 'STARTED' && updated.meetings_participants.length > 0) {
                const result = await notifyParticipants({
                    companyId: updated.company_id,
                    meeting: updated,
                    type: 'START',
                    subject: `En direct`,
                    body: `${updated.subject}`,
                    participants: updated.meetings_participants
                }).catch(err => {
                    console.error('Start notification failed:', err);
                    return { expired: false, pushMessage: '' };
                });
                if (result?.expired) {
                    expiredToken = true;
                    if (result.pushMessage) pushMessage = result.pushMessage;
                }
            }

            // When meeting finishes, notify
            if (status === 'FINISHED') {
                if (updated.meetings_participants.length > 0) {
                    const result = await notifyParticipants({
                        companyId: updated.company_id,
                        meeting: updated,
                        type: 'FINISHED',
                        subject: `Terminée`,
                        body: `${updated.subject}`,
                        participants: updated.meetings_participants
                    }).catch(err => {
                        console.error('Finish notification failed:', err);
                        return { expired: false, pushMessage: '' };
                    });
                    if (result?.expired) {
                        expiredToken = true;
                        if (result.pushMessage) pushMessage = result.pushMessage;
                    }
                }
            }

            // Tell the live room even if the manager's socket is offline right now
            // (custom server exposes these helpers on global.liveRooms; absent on Vercel).
            const liveRooms = (global as any).liveRooms;
            if (status === 'STARTED') liveRooms?.startMeeting?.(meetingId);
            if (status === 'FINISHED') liveRooms?.endMeeting?.(meetingId);

            await createLog({
                message: `Meeting status updated to ${status}: ${updated.subject}`,
                userId: user.userId,
                companyId: updated.company_id,
                payload: { action, status },
                response: { success: true }
            });

            const data = {
                ...updated,
                meetings_participants: updated.meetings_participants.map(({ id: pid, email, meeting_id }) => ({ id: pid, email, meeting_id })),
            };
            return NextResponse.json({ status: true, message: 'OK', data, expiredToken, pushMessage });
        }

        if (action === 'turn_request' && turn_request_id && turn_status) {
            const requestId = toId(turn_request_id);
            if (!requestId || !(TURN_STATUSES as readonly string[]).includes(turn_status)) {
                return NextResponse.json({ status: false, message: 'Invalid turn request' }, { status: 400 });
            }
            const existing = await prisma.meetings_turn_requests.findFirst({
                where: { id: requestId, meeting_id: meetingId },
                select: { id: true },
            });
            if (!existing) return NextResponse.json({ status: false, message: 'Turn request not found' }, { status: 404 });

            const updated = await prisma.meetings_turn_requests.update({
                where: { id: existing.id },
                data: { status: turn_status },
            });

            await createLog({
                message: `Meeting turn request updated to ${turn_status} in meeting ID ${meetingId}`,
                userId: user.userId,
                companyId: scope.company_id,
                payload: { action, turn_request_id: requestId, turn_status },
                response: { success: true }
            });

            return NextResponse.json({ status: true, message: 'OK', data: updated });
        }

        return NextResponse.json({ status: false, message: 'Invalid action' }, { status: 400 });
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        console.error('Error updating live meeting:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}



// Auto-generate PV as a document when meeting ends
async function autoGeneratePVDocument(meetingId: number) {
    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                company: true,
                meetings_points: {
                    include: {
                        meetings_votes: {
                            include: { meetings_participant: { select: { email: true } } },
                        },
                    },
                },
                meetings_participants: true,
                meetings_attendances: {
                    include: { meetings_participant: { select: { email: true } } },
                },
            },
        });

        if (!meeting) return;

        const creator = await prisma.users.findUnique({ where: { id: meeting.creator_id } });

        const presents = meeting.meetings_attendances?.filter((a: any) => a.meetings_attendances_status === 'PRESENT') || [];
        const absents = meeting.meetings_participants?.filter((p: any) =>
            !meeting.meetings_attendances?.some((a: any) => a.meetings_participant_id === p.id && a.meetings_attendances_status === 'PRESENT')
        ) || [];

        const endTime = computeEndTime(meeting.time, meeting.duration);

        const html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; line-height: 1.4; padding: 0; margin: 0; background: #fff; font-size: 14px; }
                    .container { padding: 40px; min-height: 29.7cm; display: flex; flex-direction: column; position: relative; box-sizing: border-box; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #002b5b; padding-bottom: 15px; margin-bottom: 20px; }
                    .logo { height: 50px; }
                    .title-box h1 { color: #002b5b; margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase; }
                    .title-box p { color: #94a3b8; margin: 0; font-weight: bold; font-size: 14px; text-transform: uppercase; }
                    .ref { text-align: right; font-size: 14px; color: #94a3b8; font-weight: bold; text-transform: uppercase; }
                    .date-text { color: #0f172a; font-size: 14px; font-weight: bold; text-transform: uppercase; margin: 0; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; font-size: 14px; }
                    th, td { border: 1px solid #e2e8f0; padding: 5px; text-align: left; }
                    th { background-color: #f8fafc; font-weight: bold; }
                    .section-title { color: #002b5b; font-size: 14px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px; margin-bottom: 10px; margin-top: 0; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                    .info-item { display: flex; gap: 10px; }
                    .info-label { font-weight: bold; color: #64748b; text-transform: uppercase; width: 100px; letter-spacing: 0.02em; }
                    .info-value { font-weight: bold; color: #0f172a; }
                    .desc-text { color: #334155; text-align: justify; margin-bottom: 20px; }
                    .stats-signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: auto; border-top: 2px solid #002b5b; padding-top: 15px; }
                    .signature-box { border: 1px dashed #cbd5e1; height: 80px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-style: italic; margin-top: 10px; }
                    .footer { position: absolute; bottom: 20px; left: 40px; right: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 14px; color: #64748b; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            ${meeting.company?.logo_url ? `<img src="${meeting.company.logo_url}" class="logo">` : `<div style="width: 50px; height: 50px; background: #002b5b; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 8px;">S</div>`}
                            <div class="title-box">
                                <h1>Procès-Verbal</h1>
                                <p>${meeting.type === 'ORDINAIRE' ? 'Assemblée Générale Ordinaire' : 'Assemblée Générale Extraordinaire'}</p>
                            </div>
                        </div>
                        <div class="ref">
                            <p class="date-text">${new Date(meeting.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                            Réf: PV-${meeting.id}/${new Date(meeting.date).getFullYear()}
                        </div>
                    </div>

                    <div class="section-title">1. Informations Générales</div>
                    <div class="info-grid">
                        <div class="info-item"><span class="info-label">Objet:</span><span class="info-value">${meeting.subject}</span></div>
                        <div class="info-item"><span class="info-label">Présidée par:</span><span class="info-value">${creator?.email?.split('@')[0] || 'Direction Générale'}</span></div>
                        <div class="info-item"><span class="info-label">Mode:</span><span class="info-value">${meeting.mode?.replace(/_/g, ' ') || 'N/A'}</span></div>
                        <div class="info-item"><span class="info-label">Date:</span><span class="info-value">${new Date(meeting.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                        <div class="info-item"><span class="info-label">Heure:</span><span class="info-value">${meeting.time} - ${endTime}</span></div>
                        <div class="info-item"><span class="info-label">Durée:</span><span class="info-value">${meeting.duration?.replace(/_/g, ' ').toLowerCase() || 'N/A'}</span></div>
                        <div class="info-item"><span class="info-label">Lieu:</span><span class="info-value">${meeting.location || 'Tunisie'}</span></div>
                        <div class="info-item"><span class="info-label">Plateforme:</span><span class="info-value">${meeting.mode === 'ONLINE' || meeting.isonline === 'TRUE' ? 'En Ligne' : 'Présentiel'}</span></div>
                    </div>

                    <div class="section-title">2. Ordre du jour & Objectifs</div>
                    <p class="desc-text">${meeting.description || "Présenter les résultats de l'exercice, discuter des points stratégiques, adopter les résolutions nécessaires et définir les actions à venir."}</p>

                    <div class="section-title">3. Points à l'ordre du jour & Résolutions</div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>Point / Résolution</th>
                                <th style="width: 60px; text-align: center;">Type</th>
                                <th style="width: 50px; text-align: center; color: #15803d;">Pour</th>
                                <th style="width: 50px; text-align: center; color: #b91c1c;">Contre</th>
                                <th style="width: 50px; text-align: center; color: #475569;">Abs</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${meeting.meetings_points?.map((p: any, idx: number) => {
            const v = p.meetings_votes || [];
            return `<tr>
                                    <td style="text-align: center; font-weight: bold;">${String(idx + 1).padStart(2, '0')}</td>
                                    <td style="font-weight: bold;">${p.point}</td>
                                    <td style="text-align: center; font-weight: bold;">${p.type === 'VOTE' ? 'VOTE' : 'INFO'}</td>
                                    <td style="text-align: center; font-weight: bold; color: #15803d;">${p.type === 'VOTE' ? v.filter((x: any) => x.vote === 'OUI').length : '-'}</td>
                                    <td style="text-align: center; font-weight: bold; color: #b91c1c;">${p.type === 'VOTE' ? v.filter((x: any) => x.vote === 'NON').length : '-'}</td>
                                    <td style="text-align: center; font-weight: bold; color: #475569;">${p.type === 'VOTE' ? v.filter((x: any) => x.vote === 'NEUTRE').length : '-'}</td>
                                </tr>`;
        }).join('')}
                        </tbody>
                    </table>

                    <div class="stats-signature-grid">
                        <div>
                            <div class="section-title" style="border:none; margin-bottom: 5px;">Statistiques de Présence</div>
                            <div class="info-item" style="margin-bottom: 5px;"><span class="info-label">Total Invités:</span><span class="info-value">${meeting.meetings_participants?.length || 0}</span></div>
                            <div class="info-item" style="margin-bottom: 5px;"><span class="info-label">Présents:</span><span class="info-value" style="color: #15803d;">${presents.length}</span></div>
                            <div class="info-item" style="margin-bottom: 5px;"><span class="info-label">Absents:</span><span class="info-value" style="color: #b91c1c;">${absents.length}</span></div>
                        </div>
                        <div style="text-align: center;">
                            <div class="section-title" style="border:none; margin-bottom: 0;">Signature & Cachet</div>
                            <div class="signature-box">Cachet de l'entreprise</div>
                            <div style="font-weight: bold; text-transform: uppercase; margin-top: 5px;">${creator?.email?.split('@')[0] || 'Directeur Général'}</div>
                        </div>
                    </div>

                </div>
                <div class="footer">
                    <span>Axia Meetings - ${meeting.company?.name || 'Syndic'}</span>
                    <span>Document généré le ${new Date().toLocaleDateString('fr-FR')}</span>
                </div>
            </body>
            </html>
        `;

        const { url: fileUrl } = await saveUpload('pvs', `pv-${meeting.id}.html`, html);

        // Add to meetings_documents
        await prisma.meetings_documents.create({
            data: {
                meeting_id: meetingId,
                file_title: `Procès-Verbal - ${meeting.subject}`,
                file_path: fileUrl,
            }
        });

    } catch (error) {
        console.error('Error generating PV document:', error);
    }
}
