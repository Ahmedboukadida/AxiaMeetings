import { NextRequest } from 'next/server';
import { getStaffActor, assertMeetingAccess, toPositiveInt } from '@/lib/authz';
import { USER_PUBLIC_SELECT, PARTICIPANT_PUBLIC_SELECT, COMPANY_PUBLIC_SELECT } from '@/lib/safe-select';
import { prisma } from '@/lib/prisma';
import { getStreamingClients, trackUsage, generateWithRetry, getChatResponse, groqChatWithModelFallback, groqModelParams } from '@/lib/ai-provider';
import { createLog } from '@/lib/logger';
import { rateLimit, getIp } from '@/lib/rate-limit';

// ─── Platform knowledge base ───────────────────────────────────────────────
const PLATFORM_KNOWLEDGE = `
Axia Meetings is a digital governance platform designed for property syndics (syndics de copropriété) and corporate boards.

IMPORTANT — WHAT THIS APP DOES AND DOES NOT HAVE:
- There is NO sign-up / registration page. Users are created by administrators only.
- There is NO "forgot password" self-service. Contact your administrator.
- The only public pages are: Home (/), Login (/auth/login), Terms of Use (/terms-of-use), Privacy Policy (/privacy-policy), and meeting invitation/join pages (/meetings/[id]/join).
- To access the platform, users go to the Login page and enter their username and password provided by their administrator.

AUTHENTICATED PAGES (require login):
- /overview — Dashboard overview with stats and calendar
- /meetings — List of meetings, create new meetings
- /meetings/[id] — Meeting details, agenda, participants, documents, AI summary
- /meetings/[id]/pv — Meeting minutes (PV) viewer and Word export
- /meetings/[id]/live — Live meeting session (real-time voting, agenda, hand-raising)
- /users — User management (ADMIN and DEVELOPER only)
- /companies — Company management (DEVELOPER only)
- /companies/admins — Company administrators (DEVELOPER only)
- /companies/apis — API endpoints configuration (DEVELOPER only)
- /companies/configure — Service configuration (DEVELOPER only)
- /companies/link — Account linking (DEVELOPER only)
- /configurations — System settings: SMTP, branding, legal (DEVELOPER only)
- /logs — System activity logs with AI analysis (DEVELOPER only)
- /packs — Pricing packs management (DEVELOPER only)
- /references — References management (DEVELOPER only)
- /newsletters — Newsletter subscribers (DEVELOPER only)
- /chat-sessions — Chatbot conversation history (DEVELOPER only)

KEY FEATURES:
- Digital meeting management: create, schedule, and run meetings (Ordinary, Extraordinary, Complementary, Delegates)
- Meeting modes: In-Person, Online, Hybrid
- Live sessions: real-time agenda navigation, live voting, hand-raising for word requests
- Automated PV (Procès-Verbal / Meeting Minutes): generated automatically when a meeting ends
- AI features: AI-generated meeting summaries, AI-suggested agenda points, AI description polish, AI log analysis
- Participant management: invite participants via email with secure one-click join links (no account needed)
- Document management: attach documents to meetings
- Company management: multi-tenant support for multiple organizations
- User roles: DEVELOPER (platform admin), ADMIN (company manager), PARTICIPANT (meeting attendee)
- Legal compliance: eIDAS-compliant voting, cryptographic time-stamping
- Multi-language: English, French, Arabic

MEETING WORKFLOW:
1. Admin creates a meeting with subject, date, time, location, agenda points, participants
2. Participants receive email invitations with secure links — they do NOT need an account
3. Admin starts the meeting → live session opens for everyone
4. Agenda points are presented one by one; vote points trigger live voting
5. Participants can raise hands to request the floor
6. Admin ends the meeting → PV is automatically generated
7. PV can be exported as Word (.docx) or printed

USER ROLES:
- DEVELOPER: full platform access, manages all companies, users, configurations, logs
- ADMIN: manages their company's meetings, users, API integrations
- PARTICIPANT: joins meetings via invitation link, votes, follows agenda (no dashboard access)

VOTING:
- Vote types: Pour (Yes/OUI), Contre (No/NON), Abstention (NEUTRE)
- Votes are recorded in real-time and shown in the PV

LIVE SESSION:
- Participants join via secure token link sent by email
- Access requests must be approved by the admin
- Hand-raising system for requesting the floor
- Real-time sync via Socket.io

NAVIGATION GUIDANCE:
- Not logged in? → Go to /auth/login and enter your credentials
- Forgot credentials? → Contact your company administrator
- Want to join a meeting? → Use the link sent to your email
- Want to create a meeting? → Go to /meetings after logging in
`;

const TOOL_INSTRUCTIONS = `
CRITICAL TOOL CALLING & OUTPUT SECURITY RULES:
1. You have access to a tool/function called 'fetchApplicationData' that can query internal APIs.
2. If the user asks about specific data (e.g. "who attended meeting 14", "how many participants in Réunion 3", "how many canceled meetings do I have", "show my users", "how many users are there", "what is the phone number of user X"), YOU MUST CALL THE 'fetchApplicationData' TOOL silently to get the actual data before responding.
3. IMPORTANT: The lists in your context (like Recent meetings, Users) are only basic overviews. They do NOT contain sub-resources like participant lists, attendee lists, agenda points, or documents. If the user asks for details, counts, or lists of participants, agenda points, or documents for any meeting, you DO NOT have this data in your context and MUST call the 'fetchApplicationData' tool with the correct endpoint to get it.
   AVAILABLE ENDPOINTS:
   - Meeting participants list/count: /api/meetings/[id]/participants
   - Meeting agenda points list/count: /api/meetings/[id]/points
   - Meeting documents list/count: /api/meetings/[id]/documents
   - Users list/count: /api/users
   - Current company details: /api/companies/my
4. To call this tool in a text-based format, you MUST output a single XML-like tag in your response:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/[id]/participants"}</function>
   Replace "[id]" with the actual meeting ID.
   For example, to get participants of meeting 14:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/14/participants"}</function>
   To get agenda points of meeting 14:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/14/points"}</function>
   To get documents of meeting 14:
   <function=fetchApplicationData>{"endpoint": "/api/meetings/14/documents"}</function>
5. When you need to call the tool, output ONLY the tool call tag and nothing else. Do not explain, do not translate, do not greet. Just output the tag.
6. Once the system returns the data, you will receive it in the next message. You must then use that data to answer the user's question, without mentioning the tool or the API.
7. NEVER assume, guess, or hallucinate numbers or names.
8. CONFIDENTIALITY AND SECURITY ENFORCEMENT:
   - NEVER mention the tool name 'fetchApplicationData', the endpoint paths, API routes, or that you are calling an API, function, database, or backend.
   - NEVER output any JSON blocks, function signatures, database schema fields, or programming code to the user.
   - Keep all tool execution completely silent from the user. Provide the final answers in natural language.
9. NEVER output database or internal IDs (such as 'ID:10', 'ID:13', 'ID:14', 'meeting 14', 'user 2', etc.) in the text of your response to the user. Keep these IDs completely hidden. Always refer to meetings, documents, and users by their actual names, subjects, titles, values, or dates (e.g. refer to 'meeting 14' as 'Réunion 3' or 'the meeting scheduled on 2026-05-25').
`;

// ─── Build role-based system prompt ────────────────────────────────────────
async function buildSystemPrompt(
    role: string | null,
    userId: number | null,
    companyId: number | null,
    locale: string,
    meetingId?: number
): Promise<string> {
    const langInstruction = locale === 'ar'
        ? 'Always respond in Arabic (العربية). Use RTL-formatting.'
        : locale === 'fr'
            ? 'Always respond in French.'
            : 'Always respond in English.';

    // ── PUBLIC / unauthenticated ──────────────────────────────────────────
    if (!role || !userId) {
        let contactInfo = '';
        try {
            const settings = await prisma.app_settings.findFirst({
                select: {
                    contact_phone: true,
                    contact_email: true,
                    contact_adress: true,
                    facebook: true,
                    linkedin: true,
                    tiktok: true,
                    from_name: true,
                },
            });
            if (settings) {
                const lines: string[] = [];
                if (settings.from_name) lines.push(`Platform name: ${settings.from_name}`);
                if (settings.contact_email) lines.push(`Email: ${settings.contact_email}`);
                if (settings.contact_phone) lines.push(`Phone: ${settings.contact_phone}`);
                if (settings.contact_adress) lines.push(`Address: ${settings.contact_adress}`);
                if (settings.facebook) lines.push(`Facebook: ${settings.facebook}`);
                if (settings.linkedin) lines.push(`LinkedIn: ${settings.linkedin}`);
                if (settings.tiktok) lines.push(`TikTok: ${settings.tiktok}`);
                if (lines.length > 0) {
                    contactInfo = `\n\nCONTACT INFORMATION:\n${lines.join('\n')}`;
                }
            }
        } catch { /* ignore */ }

        return `You are Axia Support, the helpful, warm, and friendly assistant for the Axia Meetings platform.
${langInstruction}
Be concise, friendly, and professional.

CONTEXT: You are talking to a public visitor who is not logged in.
- Your primary goal is to help them understand what Axia Meetings is, its features, options, and how to get started.
- Be warm and welcoming. If they greet you (e.g., "hi", "hello", "bonjour", "salut"), respond with a friendly, natural greeting and ask how you can help them learn about Axia Meetings today.
- NEVER start your response with access-denied warnings or dry messages like "Désolé, mais il semble que vous n'ayez pas accès..." for simple greetings or general questions.
- If they ask about private workspace records (like specific meetings, users, or settings that require login), politely explain that this information requires authentication, and guide them to the login page (/auth/login).
- Do not mention databases, backend APIs, or tools.

${PLATFORM_KNOWLEDGE}
${contactInfo}`;
    }

    const base = `You are Axia Support, the helpful assistant for the Axia Meetings platform.
${langInstruction}
Be concise, friendly, and professional. Use bullet points for lists.
Never make up data — only report what you actually have.

- If the user says "stop", "good", "thanks", "bye", or other short/conversational remarks, acknowledge them politely and briefly (e.g. "Alright, let me know if you need anything else.", "Understood.", "You're welcome!").
- Do NOT output lists, statistics, or database summaries on these conversational turns unless the user explicitly asks for them again.

${PLATFORM_KNOWLEDGE}`;

    // ── PARTICIPANT in a meeting ──────────────────────────────────────────
    if (role === 'PARTICIPANT') {
        let meetingContext = '';
        if (meetingId) {
            try {
                const meeting = await prisma.meetings.findUnique({
                    where: { id: meetingId },
                    include: {
                        meetings_points: {
                            orderBy: { id: 'asc' },
                            include: {
                                meetings_votes: true,
                            },
                        },
                        meetings_participants: { select: { email: true } },
                    },
                });
                if (meeting) {
                    const points = meeting.meetings_points.map((p: any, i: number) =>
                        `  ${i + 1}. [${p.type}] ${p.point} (votes: ${p.meetings_votes?.length ?? 0})`
                    ).join('\n');
                    meetingContext = `
CURRENT MEETING CONTEXT:
- Subject: ${meeting.subject}
- Type: ${meeting.type}
- Date: ${meeting.date} at ${meeting.time}
- Mode: ${meeting.mode}
- Status: ${meeting.status}
- Participants: ${meeting.meetings_participants.length}
- Agenda points:
${points}`;
                }
            } catch { /* ignore */ }
        }

        return `${base}

CONTEXT: You are talking to a meeting participant.
${meetingContext}
Help them understand how to participate: how to vote, how to raise their hand, how to follow the agenda.
Do not discuss other meetings or company data.

${TOOL_INSTRUCTIONS}`;
    }

    // ── ADMIN ─────────────────────────────────────────────────────────────
    if (role === 'ADMIN' && companyId) {
        try {
            const [company, meetings, users] = await Promise.all([
                prisma.companies.findUnique({
                    where: { id: companyId },
                    select: { name: true, url: true },
                }),
                prisma.meetings.findMany({
                    where: { company_id: companyId },
                    orderBy: { created_at: 'desc' },
                    take: 20,
                    select: {
                        id: true, subject: true, type: true, date: true,
                        time: true, status: true, mode: true,
                    },
                }),
                prisma.users.findMany({
                    where: { company_id: companyId, role: { not: 'DEVELOPER' } },
                    select: { id: true, fullname: true, email: true, role: true, phone: true, identifiant_extern: true },
                }),
            ]);

            const meetingsSummary = meetings.map(m =>
                `  - [${m.status}] ${m.subject} (${m.type}) — ${m.date} ${m.time} [${m.mode}] ID:${m.id}`
            ).join('\n');

            const usersSummary = users.map(u =>
                `  - ${u.fullname || u.email} (${u.role})${u.phone ? ` | Phone: ${u.phone}` : ''}${u.identifiant_extern ? ` | ExtID: ${u.identifiant_extern}` : ''}`
            ).join('\n');

            return `${base}

CONTEXT: You are talking to an ADMIN of company "${company?.name || companyId}".
Only discuss data belonging to their company. Do not reveal other companies' data.

THEIR COMPANY DATA:
Company: ${company?.name} | URL: ${company?.url}
Total meetings: ${meetings.length}
Recent meetings:
${meetingsSummary || '  (none)'}

Users (${users.length} total):
${usersSummary || '  (none)'}

Help them manage their meetings, understand platform features, and use the system effectively.

${TOOL_INSTRUCTIONS}`;
        } catch {
            return `${base}

CONTEXT: Admin user. Help them manage their meetings and use the platform.

${TOOL_INSTRUCTIONS}`;
        }
    }

    // ── DEVELOPER ─────────────────────────────────────────────────────────
    if (role === 'DEVELOPER') {
        try {
            const [companies, totalMeetings, totalUsers, recentLogs] = await Promise.all([
                prisma.companies.findMany({
                    select: { id: true, name: true },
                    orderBy: { id: 'asc' },
                }),
                prisma.meetings.count(),
                prisma.users.count(),
                prisma.logs.findMany({
                    orderBy: { timestamp: 'desc' },
                    take: 10,
                    select: { message: true, timestamp: true },
                }),
            ]);

            const companiesList = companies.map(c => `  - [${c.id}] ${c.name}`).join('\n');
            const logsList = recentLogs.map(l =>
                `  - ${new Date(l.timestamp).toISOString().slice(0, 16)}: ${l.message}`
            ).join('\n');

            return `${base}

CONTEXT: You are talking to a DEVELOPER (platform administrator) with full access.

PLATFORM STATS:
- Total companies: ${companies.length}
- Total meetings: ${totalMeetings}
- Total users: ${totalUsers}

Companies:
${companiesList || '  (none)'}

Recent activity (last 10 logs):
${logsList || '  (none)'}

You can answer questions about any company, meeting, user, or system configuration.
Help them manage the platform, debug issues, and understand system behavior.

${TOOL_INSTRUCTIONS}`;
        } catch {
            return `${base}

CONTEXT: Developer with full platform access.

${TOOL_INSTRUCTIONS}`;
        }
    }

    return base;
}

// ─── GET: Fetch chat sessions ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const authUser = await getStaffActor(req);
    if (!authUser) {
        return Response.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { searchParams } = new URL(req.url);
        const mySessionsParam = searchParams.get('mySessions') === 'true';

        if (authUser.role === 'DEVELOPER' && !mySessionsParam) {
            const page = Number(searchParams.get('page') || 1);
            const limit = Number(searchParams.get('limit') || 20);
            const skip = (page - 1) * limit;

            const [sessions, total] = await Promise.all([
                prisma.chat_sessions.findMany({
                    orderBy: { id: 'desc' },
                    skip,
                    take: limit,
                }),
                prisma.chat_sessions.count(),
            ]);

            const userIds = Array.from(new Set(sessions.map(s => s.user_id).filter(id => id !== null) as number[]));
            const users = await prisma.users.findMany({
                where: { id: { in: userIds } },
                select: { id: true, fullname: true, email: true }
            });
            const userMap = new Map(users.map(u => [u.id, u]));

            const dataWithUsers = sessions.map(s => ({
                ...s,
                user: s.user_id ? userMap.get(s.user_id) || null : null
            }));

            return Response.json({ status: true, data: dataWithUsers, total, page, limit });
        } else {
            // Fetch logged-in user's own sessions
            const sessions = await prisma.chat_sessions.findMany({
                where: { user_id: authUser.userId },
                orderBy: { updated_at: 'desc' },
                take: 50,
            });
            return Response.json({ status: true, data: sessions });
        }
    } catch (error: any) {
        return Response.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}

// ─── Closing a chat session (PATCH and the POST `_close` beacon) ────────────
/**
 * Who may close a session:
 * - a session owned by a user (user_id set): only that logged-in user (re-checked against the DB),
 *   or a DEVELOPER (moderation from /chat-sessions);
 * - an anonymous session (user_id null): whoever holds its random session_id (it is the only
 *   credential the public widget has), from a same-origin browser request, rate limited.
 * Unknown ids answer like a success so the endpoint cannot be used to probe ids.
 */
function isSameOriginRequest(req: NextRequest): boolean {
    const site = req.headers.get('sec-fetch-site');
    if (site) return site === 'same-origin';
    const origin = req.headers.get('origin');
    if (!origin) return false;
    try {
        const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

async function closeChatSession(req: NextRequest, rawSessionId: unknown): Promise<{ status: number; message?: string }> {
    if (typeof rawSessionId !== 'string' || rawSessionId.length < 8 || rawSessionId.length > 128) {
        return { status: 400, message: 'sessionId required' };
    }
    if (!isSameOriginRequest(req)) return { status: 403, message: 'Forbidden' };
    if (!(await rateLimit(`chat-close:${getIp(req)}`, 20, 60000))) return { status: 429, message: 'Too many requests' };

    const session = await prisma.chat_sessions.findUnique({
        where: { session_id: rawSessionId },
        select: { id: true, user_id: true, is_closed: true },
    });
    if (!session || session.is_closed) return { status: 200 };

    if (session.user_id != null) {
        const actor = await getStaffActor(req);
        const allowed = !!actor && (actor.userId === session.user_id || actor.role === 'DEVELOPER');
        if (!allowed) return { status: 403, message: 'Forbidden' };
    }
    await prisma.chat_sessions.update({ where: { id: session.id }, data: { is_closed: true } });
    return { status: 200 };
}

// ─── PATCH: Mark session as closed ─────────────────────────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const result = await closeChatSession(req, body?.sessionId);
        if (result.status !== 200) {
            return Response.json({ status: false, message: result.message }, { status: result.status });
        }
        return Response.json({ status: true });
    } catch {
        return Response.json({ status: false }, { status: 500 });
    }
}

// Helper function to extract endpoints from text-based tool calls (XML or raw JSON blocks)
function extractEndpoints(text: string): string[] {
    const endpoints: string[] = [];
    if (!text) return endpoints;

    // 1. Check standard XML-like tags: <function=fetchApplicationData>{"endpoint": "..."}</function>
    const xmlRegex = /<function=fetchApplicationData>([\s\S]*?)<\/function>/g;
    let match;
    while ((match = xmlRegex.exec(text)) !== null) {
        const innerText = match[1].trim();
        try {
            const args = JSON.parse(innerText);
            if (args.endpoint) {
                const ep = args.endpoint.trim();
                if (!endpoints.includes(ep)) endpoints.push(ep);
            }
        } catch {
            const epMatch = innerText.match(/['"]endpoint['"]\s*:\s*['"]([^'"]+)['"]/);
            if (epMatch) {
                const ep = epMatch[1].trim();
                if (!endpoints.includes(ep)) endpoints.push(ep);
            }
        }
    }

    // 2. Check raw JSON blocks with endpoint key
    const jsonRegex = /\{[^{}]*['"]endpoint['"]\s*:\s*['"]([^'"]+)['"][^{}]*\}/g;
    while ((match = jsonRegex.exec(text)) !== null) {
        const ep = match[1].trim();
        if (!endpoints.includes(ep)) {
            endpoints.push(ep);
        }
    }

    // 3. Fallback: Detect raw API paths matching the platform's supported data endpoints
    const pathRegex = /(\/|api\/)(meetings\/\d+\/(participants|points|documents)|meetings\/\d+|meetings|users\/\d+|users|companies\/my)/gi;
    let pathMatch;
    while ((pathMatch = pathRegex.exec(text)) !== null) {
        let ep = pathMatch[0].trim();
        if (!ep.startsWith('/')) ep = '/' + ep;
        // Normalize endpoints to start with /api/
        if (!ep.startsWith('/api/')) {
            ep = '/api' + ep;
        }
        // Strip trailing punctuation
        ep = ep.replace(/[.,\/]$/, '');
        if (!endpoints.includes(ep)) {
            endpoints.push(ep);
        }
    }

    return endpoints;
}

// ─── POST: Send a chat message ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const ip = getIp(req);
    if (!(await rateLimit(ip, 30, 60000))) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), { 
            status: 429, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
    try {
        const body = await req.json();

        // Handle close signal from sendBeacon
        if (body._close && body.sessionId) {
            const result = await closeChatSession(req, body.sessionId).catch(() => ({ status: 500 }));
            return new Response(result.status === 200 ? 'ok' : 'refused', { status: result.status });
        }

        const { messages, locale = 'en', meetingId, sessionId } = body;

        if (!messages || !Array.isArray(messages) || typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 128) {
            return new Response('Invalid request — sessionId required', { status: 400 });
        }

        // Actor re-loaded from the DB (role/company changes apply immediately; JWT alone is not trusted).
        const actor = await getStaffActor(req);
        const role = actor?.role ?? null;
        const userId = actor?.userId ?? null;
        const companyId = actor?.companyId ?? null;

        // Session ownership, checked before any AI call (same rule as closeChatSession):
        // - a session owned by a user: only that user, or a DEVELOPER;
        // - an anonymous session: only anonymous callers holding its id (a logged-in user
        //   gets a fresh id from the widget on login, so never writes into one);
        // - an unknown id: created for the caller.
        const existingSession = await prisma.chat_sessions.findUnique({
            where: { session_id: sessionId },
            select: { user_id: true },
        });
        if (existingSession) {
            const allowed = existingSession.user_id != null
                ? !!actor && (actor.userId === existingSession.user_id || actor.role === 'DEVELOPER')
                : !actor;
            if (!allowed) {
                return new Response(JSON.stringify({ error: 'Forbidden' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        // Data tools: DEVELOPER (all) or ADMIN (own company only). PARTICIPANT users and anonymous get none.
        const canUseDataTools = !!actor && (role === 'DEVELOPER' || (role === 'ADMIN' && companyId != null));
        const inScope = (targetCompanyId: number | null | undefined) =>
            role === 'DEVELOPER' || (role === 'ADMIN' && companyId != null && targetCompanyId === companyId);

        // Meeting context only for a meeting the caller may actually read.
        let contextMeetingId: number | undefined;
        const requestedMeetingId = toPositiveInt(meetingId);
        if (actor && requestedMeetingId) {
            try {
                await assertMeetingAccess(actor, requestedMeetingId, 'read');
                contextMeetingId = requestedMeetingId;
            } catch { /* no access: no meeting context */ }
        }

        // Build role-aware system prompt
        const systemPrompt = await buildSystemPrompt(
            role, userId, companyId, locale,
            contextMeetingId
        );

        const isPublic = !role || !userId;

        // Check if the user's latest message asks for data-related queries
        let latestUserMessage = '';
        if (messages && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
                latestUserMessage = lastMsg.content;
            }
        }
        const contentLower = latestUserMessage.toLowerCase();
        const queryKeywords = ['show', 'list', 'count', 'who', 'how many', 'detail', 'participant', 'meeting', 'user', 'company', 'find', 'search', 'réunion', 'membre', 'nombre', 'combien', 'liste', 'afficher', 'détail', 'statistique', 'info', 'donnée', 'data', 'stat', 'developer', 'admin'];
        const needsData = queryKeywords.some(keyword => contentLower.includes(keyword));

        // Tool definition
        const tools = (isPublic || !canUseDataTools || !needsData) ? undefined : [
            {
                type: 'function',
                function: {
                    name: 'fetchApplicationData',
                    description: 'Fetch data from the AxiaMeetings internal API to answer user questions about users, meetings, companies, participants, etc.',
                    parameters: {
                        type: 'object',
                        properties: {
                            endpoint: {
                                type: 'string',
                                description: 'The API endpoint to call, e.g., /api/meetings/14/participants, /api/users, /api/companies/my'
                            }
                        },
                        required: ['endpoint']
                    }
                }
            }
        ];

        // Execute tool function
        async function executeToolCall(endpoint: string, req: NextRequest) {
            try {
                if (!canUseDataTools) {
                    return JSON.stringify({ error: 'Forbidden' });
                }
                if (typeof endpoint !== 'string') return JSON.stringify({ error: 'Invalid endpoint' });
                if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;

                // Normalize agenda endpoint calls to points
                if (endpoint.includes('/agenda')) {
                    endpoint = endpoint.replace('/agenda', '/points');
                }

                // Strip query parameters for regex pathname matching
                const urlParts = endpoint.split('?');
                const pathname = urlParts[0];

                                // 1. Direct DB Query Resolution to bypass Next.js server-side fetch cookie-stripping/auth issues
                const participantsMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/participants\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/participants\/?$/i);
                if (participantsMatch) {
                    const meetingId = Number(participantsMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        select: { company_id: true }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (!inScope(meeting.company_id)) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    const participants = await prisma.meetings_participants.findMany({
                        where: { meeting_id: meetingId },
                        select: PARTICIPANT_PUBLIC_SELECT,
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: participants });
                }

                const pointsMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/points\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/points\/?$/i);
                if (pointsMatch) {
                    const meetingId = Number(pointsMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        select: { company_id: true }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (!inScope(meeting.company_id)) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    const points = await prisma.meetings_points.findMany({
                        where: { meeting_id: meetingId, parent_id: null },
                        include: { meetings_votes: true, meetings_points: true },
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: points });
                }

                const documentsMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/documents\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/documents\/?$/i);
                if (documentsMatch) {
                    const meetingId = Number(documentsMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        select: { company_id: true }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (!inScope(meeting.company_id)) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    const documents = await prisma.meetings_documents.findMany({
                        where: { meeting_id: meetingId },
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: documents });
                }

                const meetingMatch = pathname.match(/^\/?api\/meetings\/(\d+)\/?$/i) || pathname.match(/^\/?meetings\/(\d+)\/?$/i);
                if (meetingMatch) {
                    const meetingId = Number(meetingMatch[1]);
                    const meeting = await prisma.meetings.findUnique({
                        where: { id: meetingId },
                        include: {
                            meetings_points: {
                                orderBy: { id: 'asc' },
                                include: { meetings_votes: true }
                            },
                            meetings_participants: { select: PARTICIPANT_PUBLIC_SELECT },
                            meetings_documents: true
                        }
                    });
                    if (!meeting) return JSON.stringify({ error: 'Meeting not found' });
                    if (!inScope(meeting.company_id)) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    return JSON.stringify({ status: true, data: meeting });
                }

                if (pathname.match(/^\/?(api\/)?meetings\/?$/i)) {
                    const meetings = await prisma.meetings.findMany({
                        where: role === 'DEVELOPER' ? undefined : { company_id: companyId ?? -1 },
                        orderBy: { created_at: 'desc' }
                    });
                    return JSON.stringify({ status: true, data: meetings });
                }

                const userMatch = pathname.match(/^\/?api\/users\/(\d+)\/?$/i) || pathname.match(/^\/?users\/(\d+)\/?$/i);
                if (userMatch) {
                    const targetUserId = Number(userMatch[1]);
                    const userData = await prisma.users.findUnique({
                        where: { id: targetUserId },
                        select: { ...USER_PUBLIC_SELECT, company: { select: { id: true, name: true } } }
                    });
                    if (!userData) return JSON.stringify({ error: 'User not found' });
                    if (!inScope(userData.company_id) || (role !== 'DEVELOPER' && userData.role === 'DEVELOPER')) {
                        return JSON.stringify({ error: 'Forbidden' });
                    }
                    return JSON.stringify({ status: true, data: userData });
                }

                const searchParams = new URLSearchParams(urlParts[1] || '');
                if (pathname.match(/^\/?(api\/)?users\/?$/i)) {
                    const whereClause: Record<string, unknown> = {};
                    if (role !== 'DEVELOPER') {
                        // ADMIN: own company only, never DEVELOPER accounts.
                        whereClause.company_id = companyId ?? -1;
                        whereClause.role = { not: 'DEVELOPER' };
                    }
                    const emailParam = searchParams.get('email');
                    if (emailParam) {
                        whereClause.email = emailParam;
                    }
                    const usernameParam = searchParams.get('username');
                    if (usernameParam) {
                        whereClause.username = usernameParam;
                    }
                    const users = await prisma.users.findMany({
                        where: whereClause,
                        select: { ...USER_PUBLIC_SELECT, company: { select: { id: true, name: true } } },
                        orderBy: { id: 'asc' }
                    });
                    return JSON.stringify({ status: true, data: users });
                }

                if (pathname.match(/^\/?(api\/)?companies\/my\/?$/i)) {
                    if (role === 'ADMIN' && companyId) {
                        const company = await prisma.companies.findUnique({
                            where: { id: companyId },
                            select: { ...COMPANY_PUBLIC_SELECT, meeting_time_limit: true, users_number_limit: true, ai_is_active: true },
                        });
                        return JSON.stringify({ status: true, data: company });
                    }
                }

                // 2. Fallback to HTTP Fetch if the endpoint was not directly handled.
                // Only same-origin /api/ paths; the target route applies its own authorization with the caller's cookie.
                if (!/^\/api\/[A-Za-z0-9/_\-?=&.%]*$/.test(endpoint) || endpoint.includes('..') || endpoint.startsWith('//')) {
                    return JSON.stringify({ error: 'Forbidden' });
                }
                const baseUrl = new URL(req.url).origin;
                const fullUrl = baseUrl + endpoint;
                const cookieHeader = req.headers.get('cookie') || '';
                const response = await fetch(fullUrl, {
                    headers: { 'Cookie': cookieHeader }
                });
                if (!response.ok) {
                    return JSON.stringify({ error: `API returned status ${response.status}` });
                }
                const data = await response.json();
                return JSON.stringify(data).substring(0, 3002);
            } catch (err: any) {
                return JSON.stringify({ error: err.message });
            }
        }

        const groqSessions = await getStreamingClients();

        let fullResponse = '';
        const encoder = new TextEncoder();
        let readable: any = null;

        let useFallback = true;

        for (const groqSession of groqSessions) {
            try {
                const { client: groqClient, tokenId: groqTokenId } = groqSession;
                console.log(`[AI Chat] trying groq key#${groqTokenId} (streaming)`);
                const groqMessages = [
                    { role: 'system', content: systemPrompt },
                    ...messages.slice(-10),
                ];

                if (!isPublic && needsData && groqMessages.length > 0) {
                    const lastMsg = groqMessages[groqMessages.length - 1];
                    if (lastMsg.role === 'user') {
                        groqMessages[groqMessages.length - 1] = {
                            ...lastMsg,
                            content: `${lastMsg.content}\n\n(Reminder: If you need to check participants, users, or specific details to answer this, you MUST call the tool fetchApplicationData. Do NOT guess or hallucinate.)`
                        };
                    }
                }

                // First configured Groq model that answers wins; the streaming follow-up reuses it.
                const { completion: response, model: groqModel } = await groqChatWithModelFallback(groqClient, {
                    messages: groqMessages,
                    ...(tools ? { tools: tools as any, tool_choice: 'auto' } : {}),
                    max_tokens: 1024,
                    temperature: 0.7,
                });
                console.log(`[AI Chat] groq key#${groqTokenId} answered with model ${groqModel}`);

                const choice = response.choices[0];
                const toolCalls = choice?.message?.tool_calls;
                const textContent = choice?.message?.content || '';
                const extractedEndpoints = extractEndpoints(textContent);
                const hasTextToolCall = extractedEndpoints.length > 0;

                if ((toolCalls && toolCalls.length > 0) || hasTextToolCall) {
                    const toolMessages: any[] = [
                        { role: 'system', content: systemPrompt },
                        ...messages.slice(-10).map((m: any) => ({
                            role: m.role,
                            content: m.content
                        })),
                    ];

                    if (toolCalls && toolCalls.length > 0) {
                        toolMessages.push({
                            role: 'assistant',
                            content: choice.message.content || null,
                            tool_calls: toolCalls.map(tc => ({
                                id: tc.id,
                                type: 'function',
                                function: {
                                    name: tc.function.name,
                                    arguments: tc.function.arguments,
                                }
                            }))
                        });
                        for (const toolCall of toolCalls) {
                            if (toolCall.function.name === 'fetchApplicationData') {
                                const args = JSON.parse(toolCall.function.arguments);
                                console.log(`[AI Chat] Executing native tool call fetchApplicationData for endpoint: ${args.endpoint}`);
                                const result = await executeToolCall(args.endpoint, req);
                                toolMessages.push({
                                    role: 'tool',
                                    tool_call_id: toolCall.id,
                                    name: 'fetchApplicationData',
                                    content: result,
                                });
                            }
                        }
                    }

                    if (hasTextToolCall) {
                        toolMessages.push({ role: 'assistant', content: textContent });
                        for (const ep of extractedEndpoints) {
                            try {
                                console.log(`[AI Chat] Executing parsed text tool call fetchApplicationData for endpoint: ${ep}`);
                                const result = await executeToolCall(ep, req);
                                toolMessages.push({
                                    role: 'user',
                                    content: `[System Notification: The tool 'fetchApplicationData' returned the following data for endpoint "${ep}"]: ${result}`
                                });
                            } catch (e) {
                                console.error('Failed to parse or execute text tool call:', e);
                            }
                        }
                    }

                    const stream = await groqClient.chat.completions.create({
                        model: groqModel,
                        messages: toolMessages,
                        stream: true,
                        max_tokens: 1024,
                        temperature: 0.7,
                        ...groqModelParams(groqModel),
                    });

                    readable = new ReadableStream({
                        async start(controller) {
                            let inTag = false;
                            let inBrace = false;
                            let braceCount = 0;
                            try {
                                for await (const chunk of stream) {
                                    // Only final answer tokens; gpt-oss reasoning arrives in delta.reasoning and is ignored.
                                    let text = chunk.choices[0]?.delta?.content || '';
                                    if (text) {
                                        text = text.replace(/fetchApplicationData/gi, 'database');
                                        let filteredText = '';
                                        for (let i = 0; i < text.length; i++) {
                                            const char = text[i];
                                            if (char === '<') {
                                                inTag = true;
                                                continue;
                                            }
                                            if (char === '>') {
                                                inTag = false;
                                                continue;
                                            }
                                            if (char === '{') {
                                                inBrace = true;
                                                braceCount++;
                                                continue;
                                            }
                                            if (char === '}') {
                                                braceCount--;
                                                if (braceCount <= 0) {
                                                    inBrace = false;
                                                    braceCount = 0;
                                                }
                                                continue;
                                            }
                                            if (!inTag && !inBrace) {
                                                filteredText += char;
                                            }
                                        }
                                        filteredText = filteredText.replace(/\/api\/(meetings|users|companies)\S*/gi, '');
                                        if (filteredText) {
                                            fullResponse += filteredText;
                                            controller.enqueue(encoder.encode(filteredText));
                                        }
                                    }
                                }
                            } catch (streamErr: any) {
                                console.error('[AI Chat Stream Error]:', streamErr?.message || streamErr);
                            } finally {
                                controller.close();
                                console.log(`[AI Chat] groq key#${groqTokenId} (streaming) SUCCEEDED`);
                                await trackUsage(groqTokenId, 'chat', true, 1).catch(() => { });
                                await saveChatSession();
                            }
                        },
                    });
                } else {
                    const cleanedContent = textContent.replace(/<\/?.+?>/g, '')
                                                     .replace(/\{[^{}]*['"]endpoint['"]\s*:\s*['"]([^'"]+)['"][^{}]*\}/gi, '')
                                                     .replace(/\/api\/(meetings|users|companies)\S*/gi, '')
                                                     .replace(/fetchApplicationData/gi, 'database');
                    fullResponse = cleanedContent;

                    readable = new ReadableStream({
                        async start(controller) {
                            const words = cleanedContent.split(/(\s+)/);
                            for (const word of words) {
                                if (word) {
                                    controller.enqueue(encoder.encode(word));
                                    await new Promise(r => setTimeout(r, 10));
                                }
                            }
                            controller.close();
                            console.log(`[AI Chat] groq key#${groqTokenId} (streaming) SUCCEEDED`);
                            await trackUsage(groqTokenId, 'chat', true, 1).catch(() => { });
                            await saveChatSession();
                        },
                    });
                }
                useFallback = false;
                break;
            } catch (groqErr: any) {
                console.error(`[AI Chat] groq key#${groqSession.tokenId} (streaming) FAILED:`, groqErr?.message || groqErr);
                await trackUsage(groqSession.tokenId, 'chat', false, 1).catch(() => { });
            }
        }

        if (useFallback) {
            try {
                const basePrompt = `${systemPrompt}\n\n${messages.slice(-10).map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}`;
                const reminder = isPublic ? '' : `\n\n[SYSTEM REMINDER]\n- If the user asks for specific data, lists, or counts (e.g. participants in a meeting, user list) that are not fully detailed in the context, you MUST call the tool by outputting: <function=fetchApplicationData>{"endpoint": "..."}</function>\n- Replace the endpoint with the correct API route (e.g. "/api/meetings/14/participants").\n- Output ONLY the tool call tag and nothing else. Do NOT write any greeting or introductory/concluding text when calling a tool.\n- Do NOT guess, assume, or hallucinate any numbers.\n- CONFIDENTIALITY: NEVER expose API routes, endpoints, function names (like fetchApplicationData), database tables/variables, or raw code to the user. Keep all backend queries completely invisible.`;
                const fullPrompt = `${basePrompt}${reminder}\nAssistant:`;
                fullResponse = await getChatResponse(fullPrompt, { maxOutputTokens: 1024 });

                const fallbackEndpoints = extractEndpoints(fullResponse);
                if (fallbackEndpoints.length > 0) {
                    let toolResults = '';
                    for (const ep of fallbackEndpoints) {
                        try {
                            console.log(`[AI Chat Fallback] Executing parsed text tool call for endpoint: ${ep}`);
                            const result = await executeToolCall(ep, req);
                            toolResults += `\n[Tool Result for ${ep}]: ${result}\n`;
                        } catch (e) {
                            console.error('Fallback text tool parse error:', e);
                        }
                    }

                    const secondPrompt = `${basePrompt}\nAssistant: ${fullResponse}\nSystem: Here are the tool results for your query:\n${toolResults}\nAssistant:`;
                    fullResponse = await getChatResponse(secondPrompt, { maxOutputTokens: 1024 });
                }

                // Clean up any remaining XML tags, JSON blocks, or endpoint paths
                fullResponse = fullResponse.replace(/<\/?.+?>/g, '')
                                           .replace(/\{[^{}]*['"]endpoint['"]\s*:\s*['"]([^'"]+)['"][^{}]*\}/gi, '')
                                           .replace(/\/api\/(meetings|users|companies)\S*/gi, '')
                                           .replace(/fetchApplicationData/gi, 'database');
            } catch (err: any) {
                return new Response(
                    JSON.stringify({ error: 'No AI provider available. Add API keys in AI Tokens settings.' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            }
            readable = new ReadableStream({
                async start(controller) {
                    const words = fullResponse.split(/(\s+)/);
                    for (const word of words) {
                        if (word) {
                            controller.enqueue(encoder.encode(word));
                            await new Promise(r => setTimeout(r, 10));
                        }
                    }
                    controller.close();
                    await saveChatSession();
                },
            });
        }

        async function saveChatSession() {
            const allMessages = [
                ...messages,
                { role: 'assistant', content: fullResponse },
            ];
            try {
                const isNew = !existingSession;
                if (existingSession) {
                    // Owner never changes; the WHERE re-checks it so a concurrent change cannot be overwritten.
                    await prisma.chat_sessions.updateMany({
                        where: { session_id: sessionId, user_id: existingSession.user_id },
                        data: {
                            messages: allMessages,
                            locale,
                            is_closed: false,
                            ...(role && userId != null && userId === existingSession.user_id && { role }),
                        },
                    });
                } else {
                    // A concurrent request may have created it first: the unique session_id then
                    // makes this throw and nothing is overwritten.
                    await prisma.chat_sessions.create({
                        data: {
                            session_id: sessionId,
                            user_id: userId,
                            role: role ?? 'PUBLIC',
                            locale,
                            messages: allMessages,
                            is_closed: false,
                        },
                    });
                }

                if (isNew) {
                    await createLog({
                        userId,
                        companyId,
                        message: `New AI Chat session started: ${sessionId}`,
                        payload: { locale, role: role ?? 'PUBLIC' },
                    });
                }
            } catch (e) {
                console.error('Failed to save chat session:', e);
            }
        }

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error: any) {
        console.error('Chat API error:', error?.message || error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// ─── DELETE: Remove session(s) (DEVELOPER only) ─────────────────────────────
export async function DELETE(req: NextRequest) {
    const authUser = await getStaffActor(req);
    if (!authUser || authUser.role !== 'DEVELOPER') {
        return Response.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { id, ids } = body;

        if (id) {
            await (prisma.chat_sessions as any).delete({ where: { id } });
            await createLog({
                userId: authUser.userId,
                companyId: authUser.companyId,
                message: `Deleted chat session ID: ${id}`,
                payload: { id }
            });
        } else if (ids && Array.isArray(ids)) {
            await (prisma.chat_sessions as any).deleteMany({ where: { id: { in: ids } } });
            await createLog({
                userId: authUser.userId,
                companyId: authUser.companyId,
                message: `Deleted multiple chat sessions: ${ids.length}`,
                payload: { ids }
            });
        } else {
            return Response.json({ status: false, message: 'ID or IDs required' }, { status: 400 });
        }

        return Response.json({ status: true });
    } catch (error: any) {
        console.error('Delete chat error:', error);
        return Response.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
