import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateWithRetry, geminiErrorMessage } from '@/lib/ai-provider';
import { checkAiAccess } from '@/lib/ai-guard';
import { saveUpload } from '@/lib/storage';
import { requireRole, assertMeetingAccess, httpErrorResponse, toPositiveInt, type StaffActor } from '@/lib/authz';
import { sanitizeHtml, escapeHtml } from '@/lib/html';
import { sendPvLinks } from '@/lib/pv-notify';

/** Strip a Markdown code fence some providers wrap around the HTML. */
function stripCodeFence(text: string): string {
    return String(text ?? '').trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let actor: StaffActor;
    let meetingId: number;
    try {
        actor = await requireRole(req, 'ADMIN', 'DEVELOPER');
        const { id } = await params;
        const parsed = toPositiveInt(id);
        if (!parsed) return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        meetingId = parsed;
        // Company scope: an ADMIN may only generate PVs for meetings of his own company.
        await assertMeetingAccess(actor, meetingId, 'manage');
    } catch (error) {
        const r = httpErrorResponse(error);
        if (r) return r;
        throw error;
    }

    const aiDenied = await checkAiAccess({ userId: actor.userId, email: actor.email ?? '', role: actor.role, companyId: actor.companyId });
    if (aiDenied) return aiDenied;

    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                meetings_points: { include: { meetings_votes: true } },
                meetings_participants: true,
                meetings_attendances: true,
                company: true,
            },
        });

        if (!meeting) {
            return NextResponse.json({ status: false, message: 'Meeting not found' }, { status: 404 });
        }

        const pointsSummary = meeting.meetings_points.map((p, i) => {
            const votes = p.meetings_votes;
            const oui = votes.filter(v => v.vote === 'OUI').length;
            const non = votes.filter(v => v.vote === 'NON').length;
            const neutre = votes.filter(v => v.vote === 'NEUTRE').length;
            const total = votes.length;
            const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%';
            const voteStr = p.type === 'VOTE' && total > 0
                ? `\n   Résultat du vote: Pour ${oui} (${pct(oui)}), Contre ${non} (${pct(non)}), Abstention ${neutre} (${pct(neutre)}) — ${oui > non ? 'ADOPTÉ' : oui < non ? 'REJETÉ' : 'NON CONCLUANT'}`
                : '';
            return `${i + 1}. ${p.type === 'VOTE' ? '📌 [À VOTER]' : '📋 [INFORMATION]'} ${p.point}${p.description ? `\n   Détail: ${p.description}` : ''}${voteStr}`;
        }).join('\n\n');

        const totalParticipants = meeting.meetings_participants.length;
        const attendances = meeting.meetings_attendances;
        const present = attendances.filter(a => a.meetings_attendances_status === 'PRESENT').length;
        const absent = attendances.filter(a => a.meetings_attendances_status === 'ABSENT').length;
        const dateFormatted = new Date(meeting.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const prompt = `Tu es secrétaire de séance pour des réunions d'entreprise (direction, RH, comités, assemblées).
Rédige un Procès-Verbal (PV) officiel en français, clair et professionnel, pour cette réunion.
RÈGLE STRICTE: utilise uniquement les informations fournies ci-dessous. N'invente aucun échange, intervention, chiffre, nom ou décision qui n'y figure pas. Si une information manque, écris « Non renseigné » ou omets la section.

INFORMATIONS DE LA RÉUNION:
- Société/Organisation: ${meeting.company?.name || 'Non spécifié'}
- Type de séance: ${meeting.type}
- Sujet: ${meeting.subject}
- Date: ${dateFormatted}
- Heure de début: ${meeting.time}
- Durée: ${meeting.duration?.replace(/_/g, ' ')}
- Mode: ${meeting.mode === 'IN_PERSON' ? 'Présentiel' : meeting.mode === 'ONLINE' ? 'En ligne' : 'Hybride'}
- Lieu: ${meeting.location || 'Non spécifié'}
- Description/Objectifs: ${meeting.description || 'Non spécifiée'}

PRÉSENCE:
- ${totalParticipants} membres convoqués
- ${present} présents, ${absent} absents

ORDRE DU JOUR TRAITÉ:
${pointsSummary || 'Aucun point défini'}

Rédige un PV complet en HTML avec:
1. En-tête officiel avec toutes les informations de la réunion
2. Constatation du quorum et ouverture de séance
3. Pour chaque point: rappel du point (et de son détail s'il est fourni) et, pour les votes, la résolution formelle — sans inventer de discussion
4. Pour les votes: résultat exact avec pourcentages et décision (ADOPTÉ/REJETÉ)
5. Clôture de séance
6. Pied de page avec espace pour signatures

Style CSS inline: fond blanc, typographie professionnelle, mise en page formelle.
Commence directement par le HTML (<!DOCTYPE html>), sans explication.`;

        const rawHtml = await generateWithRetry(prompt, { maxOutputTokens: 4096, feature: 'ai-pv' });

        // AI output is untrusted: keep only safe markup (no scripts, handlers, iframes, <style>…).
        const htmlContent = sanitizeHtml(stripCodeFence(rawHtml));
        const fileTitle = `PV IA — ${meeting.subject} (${dateFormatted})`;
        const fileHtml = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(fileTitle)}</title></head>
<body style="margin:0;padding:24px;background:#fff;font-family:Georgia,'Times New Roman',serif;color:#1e293b;">
${htmlContent}
</body>
</html>`;

        // Save to UPLOAD_DIR/pvs (served via /api/files/pvs/...)
        const { url: fileUrl } = await saveUpload('pvs', `ai-pv-${meetingId}.html`, fileHtml);

        const doc = await prisma.meetings_documents.create({
            data: {
                meeting_id: meetingId,
                file_title: fileTitle,
                file_path: fileUrl,
            },
        });

        // Email each participant a personal PV link. Never fails the PV request.
        // Emails go out in the background so a slow SMTP server never makes the PV request time out
        // (a timeout would make the admin retry and create a second PV). Results are written to logs.
        void sendPvLinks(meetingId, { pvDocumentId: doc.id, triggeredByUserId: actor.userId }).catch(() => undefined);
        const notified = { queued: true };

        return NextResponse.json({ status: true, data: { url: fileUrl, html: htmlContent, notified } });
    } catch (error: any) {
        console.error('AI PV error:', error?.message || error);
        return NextResponse.json({ status: false, message: geminiErrorMessage(error) }, { status: 500 });
    }
}
