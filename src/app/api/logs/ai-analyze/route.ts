import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';
import { generateWithRetry, parseJsonResponse, geminiErrorMessage } from '@/lib/ai-provider';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden — Developer only' }, { status: 403 });
    }

    try {
        const logs = await prisma.logs.findMany({
            orderBy: { timestamp: 'desc' },
            take: 300,
            include: {
                user: { select: { username: true, role: true } },
                company: { select: { name: true } },
            },
        });

        if (logs.length === 0) {
            return NextResponse.json({ status: false, message: 'No logs to analyze' }, { status: 400 });
        }

        const logsSerialized = logs.map(l =>
            `[${format(new Date(l.timestamp), 'MM-dd HH:mm')}] ${l.user?.username ?? 'SYSTEM'}(${l.user?.role ?? 'SYSTEM'}) @ ${l.company?.name || 'GLOBAL'}: ${l.message}`
        ).join('\n');

        const totalLogs = logs.length;
        const byRole: Record<string, number> = {};
        const byCompany: Record<string, number> = {};
        logs.forEach(l => {
            byRole[l.user?.role || 'UNKNOWN'] = (byRole[l.user?.role || 'UNKNOWN'] || 0) + 1;
            const co = l.company?.name || 'GLOBAL';
            byCompany[co] = (byCompany[co] || 0) + 1;
        });

        const prompt = `Tu es un expert en sécurité informatique et analyse de logs applicatifs.
Analyse ces ${totalLogs} logs d'activité système et fournis une analyse intelligente et concise.

STATISTIQUES:
- Total: ${totalLogs} logs analysés
- Par rôle: ${Object.entries(byRole).map(([k, v]) => `${k}: ${v}`).join(', ')}
- Par entreprise: ${Object.entries(byCompany).slice(0, 10).map(([k, v]) => `${k}: ${v}`).join(', ')}

LOGS (du plus récent au plus ancien):
${logsSerialized}

Analyse ces logs et génère un rapport JSON avec exactement cette structure:
{
  "summary": "Résumé global de l'activité en 2-3 phrases",
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "anomalies": [
    { "type": "type d'anomalie", "description": "description", "severity": "LOW|MEDIUM|HIGH" }
  ],
  "topActivities": [
    { "activity": "nom activité", "count": 5, "insight": "courte analyse" }
  ],
  "companiesInsight": [
    { "company": "nom", "activityCount": 10, "status": "ACTIVE|INACTIVE|SUSPICIOUS" }
  ],
  "recommendations": ["Recommandation 1", "Recommandation 2"],
  "timespan": "Période couverte (ex: dernières 24h)"
}

Réponds UNIQUEMENT avec le JSON valide, sans texte supplémentaire.`;

        const text = await generateWithRetry(prompt, { feature: 'log-analyze' });
        const parsed = parseJsonResponse(text);

        return NextResponse.json({ status: true, data: parsed });
    } catch (error: any) {
        console.error('AI Log Analyze error:', error?.message || error);
        return NextResponse.json({ status: false, message: geminiErrorMessage(error) }, { status: 500 });
    }
}