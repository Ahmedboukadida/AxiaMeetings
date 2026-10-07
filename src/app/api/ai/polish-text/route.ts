import { NextRequest, NextResponse } from 'next/server';
import { MEETING_DURATION_LABELS_FR } from '@/lib/durations';
import { getAuthenticatedUser } from '@/lib/auth';
import { generateWithRetry, geminiErrorMessage } from '@/lib/ai-provider';
import { checkAiAccess } from '@/lib/ai-guard';

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    const aiDenied = await checkAiAccess(user);
    if (aiDenied) return aiDenied;

    try {
        const { text, context, meetingContext } = await req.json();

        let prompt: string;

        // ─── Rich Meeting Description Generation ─────────────────────────────
        if (context === 'description' && meetingContext) {
            const { subject, type, date, time, mode, location, duration, points } = meetingContext;

            const typeLabels: Record<string, string> = {
                ORDINAIRE: 'Assemblée Générale Ordinaire (AGO)',
                EXTRAORDINAIRE: 'Assemblée Générale Extraordinaire (AGE)',
                COMPLEMENTAIRE: 'Réunion Complémentaire',
                DELEGUES: 'Réunion des Délégués',
                CONSEIL: 'Réunion du Conseil Syndical',
            };

            const modeLabels: Record<string, string> = {
                IN_PERSON: 'Présentiel',
                ONLINE: 'En ligne (visioconférence)',
                HYBRID: 'Hybride (présentiel + distanciel)',
            };

            const durationLabels: Record<string, string> = MEETING_DURATION_LABELS_FR;

            const pointsList = Array.isArray(points) && points.length > 0
                ? points.map((p: any, i: number) =>
                    `${i + 1}. [${p.type === 'VOTE' ? 'VOTE' : 'INFO'}] ${p.point}`
                ).join('\n')
                : null;

            const existingDesc = text?.trim()
                ? `\nDescription existante (à enrichir): "${text}"`
                : '';

            prompt = `Tu es un expert en gouvernance de copropriété et syndic d'immeuble. 
                Génère une description officielle, précise et complète pour cette réunion en français.

                INFORMATIONS COMPLÈTES DE LA RÉUNION:
                - Objet / Sujet: ${subject || 'Non spécifié'}
                - Type de séance: ${typeLabels[type] || type || 'Non spécifié'}
                - Date: ${date || 'Non spécifiée'}
                - Heure: ${time || 'Non spécifiée'}
                - Mode: ${modeLabels[mode] || mode || 'Non spécifié'}
                - Lieu: ${location || 'Non spécifié'}
                - Durée prévue: ${durationLabels[duration] || duration || 'Non spécifiée'}
                ${existingDesc}

                POINTS DE L'ORDRE DU JOUR:
                ${pointsList || 'Aucun point défini pour l\'instant'}

                INSTRUCTIONS:
                - Rédige une description officielle de 3 à 5 paragraphes
                - Paragraphe 1: Contexte et objet de la réunion
                - Paragraphe 2: Objectifs principaux et enjeux
                - Paragraphe 3: Points clés à traiter (basés sur l'ordre du jour)
                - Paragraphe 4 (si applicable): Modalités pratiques (mode, lieu, durée)
                - Utilise un français professionnel et formel adapté aux syndics de copropriété
                - Sois précis, riche en informations et utile pour les participants
                - N'invente pas de données chiffrées ou de noms qui ne sont pas fournis

                Réponds UNIQUEMENT avec la description, sans titre ni introduction.`;

            // ─── Simple Text Polishing ────────────────────────────────────────────
        } else {
            if (!text || text.trim().length < 5) {
                return NextResponse.json({ status: false, message: 'Text too short' }, { status: 400 });
            }

            const contextLabels: Record<string, string> = {
                description: 'description de réunion',
                agenda: "point d'ordre du jour",
                notes: 'notes de réunion',
                general: 'texte général',
            };

            prompt = `Tu es un assistant d'écriture professionnel spécialisé dans la gouvernance d'entreprise et les communications formelles de syndicats de copropriété.

                Améliore et professionnalise ce texte en ${contextLabels[context] || 'texte professionnel'}. 

                TEXTE ORIGINAL:
                "${text}"

                Instructions:
                - Conserve l'intention et le sens du texte original
                - Rends le texte plus formel, clair, et professionnel
                - Utilise un français correct et soutenu
                - Reste concis — n'ajoute pas de contenu non demandé
                - Si le texte est déjà en anglais, réponds en anglais; sinon réponds en français

                Réponds UNIQUEMENT avec le texte amélioré, sans introduction ni explication.`;
        }

        const polished = await generateWithRetry(prompt, { feature: 'polish-text' });
        return NextResponse.json({ status: true, data: { polished } });

    } catch (error: any) {
        console.error('AI Polish error:', error?.message || error);
        return NextResponse.json({ status: false, message: geminiErrorMessage(error) }, { status: 500 });
    }
}
