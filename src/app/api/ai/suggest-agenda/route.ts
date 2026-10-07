import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { generateWithRetry, parseJsonResponse, geminiErrorMessage } from '@/lib/ai-provider';
import { checkAiAccess } from '@/lib/ai-guard';

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    const aiDenied = await checkAiAccess(user);
    if (aiDenied) return aiDenied;

    try {
        const { subject, description, type } = await req.json();

        if (!subject) {
            return NextResponse.json({ status: false, message: 'Meeting subject is required' }, { status: 400 });
        }

        const typeLabels: Record<string, string> = {
            ORDINAIRE: 'Assemblée Générale Ordinaire (AGO)',
            EXTRAORDINAIRE: 'Assemblée Générale Extraordinaire (AGE)',
            AGO: 'Réunion Ordinaire',
            AGE: 'Réunion Extraordinaire',
            CONSEIL: 'Réunion du Conseil',
        };

        const prompt = `Tu es un expert en gouvernance d'entreprise et organisation de réunions de syndic. 
        Génère des points d'ordre du jour pertinents et professionnels pour cette réunion.

        INFORMATIONS:
        - Sujet: ${subject}
        - Type de réunion: ${typeLabels[type] || type || 'Réunion'}
        - Description/Objectifs: ${description || 'Non spécifiée'}

        Génère entre 4 et 7 points d'ordre du jour pertinents. Certains doivent être de type VOTE (décisions importantes) et d'autres SIMPLE (informatifs).

        Réponds UNIQUEMENT avec un JSON valide de cette structure exacte, sans texte supplémentaire:
        {
        "points": [
            { "point": "Texte du point", "type": "SIMPLE" },
            { "point": "Texte du point à voter", "type": "VOTE" }
        ]
        }

        Les points VOTE doivent être des décisions concrètes qui nécessitent un vote formel. 
        Les points SIMPLE sont informatifs ou de discussion.
        Écris en français professionnel de syndicat.`;

        const text = await generateWithRetry(prompt, { feature: 'suggest-agenda' });
        const parsed = parseJsonResponse(text);

        return NextResponse.json({ status: true, data: parsed });
    } catch (error: any) {
        console.error('AI Agenda Suggest error:', error?.message || error);
        return NextResponse.json({ status: false, message: geminiErrorMessage(error) }, { status: 500 });
    }
}
