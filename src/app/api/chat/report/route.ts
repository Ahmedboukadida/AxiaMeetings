import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getStreamingClients, trackUsage, generateWithRetry, groqChatWithModelFallback } from '@/lib/ai-provider';

export async function POST(req: NextRequest) {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser || authUser.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    try {
        const { sessions } = await req.json();
        if (!sessions || sessions.length === 0) {
            return NextResponse.json({ status: false, message: 'No sessions provided' }, { status: 400 });
        }

        const totalSessions = sessions.length;
        const totalMessages = sessions.reduce((acc: number, s: any) => acc + (s.messages?.length ?? 0), 0);
        const avgMessages = Math.round(totalMessages / totalSessions);
        const allUserMessages = sessions.flatMap((s: any) =>
            (s.messages ?? []).filter((m: any) => m.role === 'user').map((m: any) => m.content)
        ).slice(0, 100);
        const roleBreakdown = sessions.reduce((acc: Record<string, number>, s: any) => {
            const r = s.role || 'PUBLIC';
            acc[r] = (acc[r] || 0) + 1;
            return acc;
        }, {});

        const prompt = `You are an AI analyst for the Axia Meetings platform. Analyze these chatbot conversation statistics and generate actionable insights.

STATISTICS:
- Total sessions: ${totalSessions}
- Total messages: ${totalMessages}
- Average messages per session: ${avgMessages}
- User roles: ${JSON.stringify(roleBreakdown)}

SAMPLE USER QUESTIONS (up to 100):
${allUserMessages.map((m: string, i: number) => `${i + 1}. "${m}"`).join('\n')}

Generate a JSON report with EXACTLY this structure:
{
  "summary": "2-3 sentence overview of chatbot usage patterns",
  "topTopics": [{ "topic": "topic name", "count": 5, "insight": "why this matters" }],
  "issues": [{ "issue": "description", "severity": "LOW|MEDIUM|HIGH", "suggestion": "how to fix" }],
  "improvements": ["Specific actionable improvement"],
  "userSatisfaction": "POOR|FAIR|GOOD|EXCELLENT",
  "totalSessions": ${totalSessions},
  "avgMessagesPerSession": ${avgMessages}
}

Respond ONLY with valid JSON, no extra text.`;

        const groqSessions = await getStreamingClients();
        let text = '';
        let success = false;
        for (const groqSession of groqSessions) {
            try {
                const { client: groqClient, tokenId } = groqSession;
                console.log(`[Chat Report] trying groq key#${tokenId}`);
                const { completion, model } = await groqChatWithModelFallback(groqClient, {
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 2048,
                    temperature: 0.3,
                });
                text = completion.choices[0]?.message?.content || '';
                if (!text.trim()) throw new Error(`EMPTY_RESPONSE from Groq (${model})`);
                console.log(`[Chat Report] groq key#${tokenId} ${model} SUCCEEDED`);
                await trackUsage(tokenId, 'chat-report', true, 1).catch(() => { });
                success = true;
                break;
            } catch (err: any) {
                console.error(`[Chat Report] groq key#${groqSession.tokenId} FAILED:`, err?.message);
                await trackUsage(groqSession.tokenId, 'chat-report', false, 1).catch(() => { });
            }
        }
        if (!success) {
            // Fallback: Groq → Gemini → OpenRouter
            text = await generateWithRetry(prompt, { maxOutputTokens: 2048, feature: 'chat-report' });
        }
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Invalid AI response format');
        const parsed = JSON.parse(jsonMatch[0]);

        return NextResponse.json({ status: true, data: parsed });
    } catch (error: any) {
        console.error('Chat report error:', error?.message);
        return NextResponse.json({ status: false, message: 'Failed to generate report' }, { status: 500 });
    }
}
