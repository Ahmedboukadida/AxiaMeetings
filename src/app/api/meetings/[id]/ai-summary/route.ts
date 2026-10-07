import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateWithRetry, parseJsonResponse, geminiErrorMessage } from '@/lib/ai-provider';
import { checkAiAccess } from '@/lib/ai-guard';
import { requireRole, assertMeetingAccess, httpErrorResponse, toPositiveInt } from '@/lib/authz';
import { sanitizeHtml } from '@/lib/html';

/**
 * The model output is untrusted (N39). Fields the UI renders as HTML (summary, keyDecisions)
 * go through sanitizeHtml; the rest are rendered as React text, so they are only coerced to
 * plain strings (escaping them here would show entities literally).
 */
const asText = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

function sanitizeSummary(parsed: any) {
    if (!parsed || typeof parsed !== 'object') return { summary: '', keyDecisions: [], actionItems: [], voteResults: [] };
    const strList = (v: unknown, fn: (s: string) => string) =>
        Array.isArray(v) ? v.filter((x) => typeof x === 'string').map(fn) : [];
    return {
        summary: sanitizeHtml(asText(parsed.summary)),
        keyDecisions: strList(parsed.keyDecisions, sanitizeHtml),
        actionItems: strList(parsed.actionItems, asText),
        voteResults: Array.isArray(parsed.voteResults)
            ? parsed.voteResults
                  .filter((v: unknown) => v && typeof v === 'object')
                  .map((v: any) => ({ point: asText(v.point), result: asText(v.result), details: asText(v.details) }))
            : [],
        attendance: asText(parsed.attendance),
        overallStatus: asText(parsed.overallStatus),
    };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let meetingId: number;
    try {
        const user = await requireRole(req, 'ADMIN', 'DEVELOPER');
        const { id } = await params;
        const parsedId = toPositiveInt(id);
        if (!parsedId) return NextResponse.json({ status: false, message: 'Invalid meeting id' }, { status: 400 });
        meetingId = parsedId;
        await assertMeetingAccess(user, meetingId, 'manage');

        const aiDenied = await checkAiAccess({ userId: user.userId, email: user.email ?? '', role: user.role, companyId: user.companyId });
        if (aiDenied) return aiDenied;
    } catch (error) {
        const handled = httpErrorResponse(error);
        if (handled) return handled;
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }

    try {
        const meeting = await prisma.meetings.findUnique({
            where: { id: meetingId },
            include: {
                meetings_points: { include: { meetings_votes: true } },
                meetings_participants: true,
                meetings_attendances: true,
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
            const voteStr = p.type === 'VOTE' && votes.length > 0
                ? ` [VOTE — Pour: ${oui}, Contre: ${non}, Neutre: ${neutre}]`
                : '';
            return `${i + 1}. ${p.point}${p.description ? ` — ${p.description}` : ''}${voteStr}`;
        }).join('\n');

        const totalParticipants = meeting.meetings_participants.length;
        const present = meeting.meetings_attendances.filter(a => a.meetings_attendances_status === 'PRESENT').length;

        const prompt = `Tu es un secrétaire professionnel de réunion. Génère un résumé exécutif structuré en français pour cette réunion.
Utilise des balises HTML (<strong>, <em>, <br>, etc.) pour le formatage riche dans le texte.

INFORMATIONS DE LA RÉUNION:
- Sujet: ${meeting.subject}
- Type: ${meeting.type}
- Date: ${meeting.date} à ${meeting.time}
- Durée: ${meeting.duration}
- Mode: ${meeting.mode}
- Lieu: ${meeting.location || 'Non spécifié'}
- Statut: ${meeting.status}
- Description: ${meeting.description || 'Aucune'}
- Participants: ${totalParticipants} invités, ${present} présents

ORDRE DU JOUR:
${pointsSummary || 'Aucun point défini'}

Génère un résumé JSON avec exactement cette structure:
{
  "summary": "HTML text: Un paragraphe concis résumant la réunion avec formatage riche",
  "keyDecisions": ["HTML text: Décision 1", "HTML text: Décision 2"],
  "actionItems": ["Action item 1", "Action item 2"],
  "voteResults": [{"point": "nom du point", "result": "ADOPTÉ/REJETÉ/NEUTRE", "details": "X pour, Y contre"}],
  "attendance": "${present}/${totalParticipants} participants présents",
  "overallStatus": "PRODUCTIVE/ORDINAIRE/CRITIQUE"
}

Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.`;

        const text = await generateWithRetry(prompt, { feature: 'ai-summary' });
        const parsed = sanitizeSummary(parseJsonResponse(text));

        // Auto-save the AI summary text to the meeting's summary field
        try {
            await prisma.meetings.update({
                where: { id: meetingId },
                data: { summary: parsed.summary || null },
            });
        } catch { /* non-blocking — don't fail if save fails */ }

        return NextResponse.json({ status: true, data: parsed });
    } catch (error: any) {
        console.error('AI Summary error:', error?.message || error);
        return NextResponse.json({ status: false, message: geminiErrorMessage(error) }, { status: 500 });
    }
}
