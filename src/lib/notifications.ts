import { prisma } from './prisma';
import { refreshExternToken } from './refreshExternToken';

interface NotificationPayload {
    title: string;
    body: string;
    meeting_id: number;
    type: 'INVITATION' | 'UPDATE' | 'CANCEL' | 'REMINDER' | 'START' | 'FINISHED';
    participants: string[];
}

export async function sendPushNotification(companyId: number, data: NotificationPayload) {
    try {
        const company = await prisma.companies.findUnique({ where: { id: companyId }, include: { notifications_service_endpoint: { include: { formated_responses: true } } } });
        if (!company || !company.have_notifications_service || !company.notifications_service_endpoint) { return; }
        const endpoint = company.notifications_service_endpoint;
        const apiUrl = endpoint.endpoint.startsWith('http') ? endpoint.endpoint : `${company.url}${endpoint.endpoint}`;

        // Get participants' external IDs from the users table
        const users = await prisma.users.findMany({ where: { email: { in: data.participants }, company_id: companyId }, select: { email: true, identifiant_extern: true } });
        console.log(`[Push] Found ${users.length} users with external IDs:`, users.map(u => `${u.email}: ${u.identifiant_extern}`).join(', '));
        const userMap = new Map(users.map(u => [u.email, u.identifiant_extern]));

        // Get participant tokens for the join link
        const participantsData = await prisma.meetings_participants.findMany({ where: { meeting_id: data.meeting_id, email: { in: data.participants } }, select: { email: true, token: true } });
        const tokenMap = new Map(participantsData.map(p => [p.email, p.token]));

        // Get the admin token for authentication with the external API
        const adminLink = await prisma.companies_admins_login.findFirst({ where: { company_id: companyId }, select: { token_id: true } });
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
        if (!siteUrl) { console.error('[Notifications] NEXT_PUBLIC_SITE_URL is not configured'); return; }
        let currentToken = adminLink?.token_id;

        let hasError = false;
        let lastErrorMsg = '';

        // Loop through participants and send individual notifications
        for (const email of data.participants) {
            const externalUserId = userMap.get(email);
            const pToken = tokenMap.get(email);

            // --- INTERNAL WEB NOTIFICATION (Socket.io) ---
            if ((global as any).io) {
                (global as any).io.to(`user-${email}`).emit('notification:new', {
                    title: data.title,
                    body: data.body,
                    meetingId: data.meeting_id,
                    type: data.type
                });
                console.log(`Internal notification emitted to user-${email}`);
            }

            if (!externalUserId) {
                console.log(`Skipping push notification for ${email}: No external ID found.`);
                continue;
            }

            const joinUrl = `${siteUrl}/meetings/${data.meeting_id}/join?token=${pToken}&email=${encodeURIComponent(email)}`.replace(/:/g, '&#58;');
            const ctaLink = `<a href='${joinUrl}' target='_blank'>Cliquez ici</a>`;
            const messageWithLink = `${data.body} ${ctaLink}`;

            // Standard fallback payload (AxiaMeetings core keys)
            let finalPayload: any = {
                header: data.title,
                body: messageWithLink, // HTML version with join link
                identifiant_extern: externalUserId
            };

            // Override with custom mappings if configured in the dashboard
            if (endpoint.formated_responses.length > 0) {
                const mapped: any = {};
                for (const m of endpoint.formated_responses) {
                    const reqKey = (m.formated_response_key || '').toLowerCase();
                    const isUserId = (reqKey.includes('id') && !reqKey.includes('meeting') && !reqKey.includes('entity')) || reqKey.includes('extern') || reqKey.includes('user') || reqKey.includes('destinateur');
                    const isUserIdString = reqKey.includes('string');

                    let val: any = null;
                    if (isUserId && !isUserIdString) {
                        val = externalUserId;
                    } else if (isUserId && isUserIdString) {
                        val = String(externalUserId);
                    } else if (reqKey.includes('header') || reqKey.includes('title') || reqKey.includes('objet')) {
                        val = data.title;
                    } else if (reqKey.includes('plain') || reqKey.includes('text')) {
                        val = data.body;
                    } else if (reqKey.includes('body') || reqKey.includes('message') || reqKey.includes('html')) {
                        val = messageWithLink;
                    } else if (reqKey.includes('link') || reqKey.includes('url')) {
                        val = joinUrl;
                    } else if (reqKey.includes('type') || reqKey.includes('action') || reqKey.includes('status')) {
                        val = data.type;
                    } else if (reqKey.includes('meeting') || reqKey.includes('entity') || reqKey.includes('related')) {
                        val = data.meeting_id;
                    }

                    if (val !== null) {
                        mapped[m.response_key] = val;
                    } else {
                        console.warn(`[Notifier] Warning: Unrecognized mapping key: ${m.formated_response_key}`);
                    }
                }
                // If the user has explicitly mapped keys, USE ONLY the mapped keys as the entire payload
                // This gives full control over the payload structure via the dashboard
                const method = endpoint.method || 'POST';
                if (Object.keys(mapped).length > 0 && (method === 'POST' || method === 'PUT')) {
                    finalPayload = mapped;
                }
            }

            console.log(`Sending Push Payload for ${email}:`, JSON.stringify(finalPayload));
            console.log(`[Push] Auth Token present:`, !!currentToken);

            let attemptSuccess = false;

            for (let attempt = 1; attempt <= 2; attempt++) {
                let retry = false;

                try {
                    const response = await fetch(apiUrl, {
                        method: endpoint.method || 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
                        },
                        body: JSON.stringify(finalPayload),
                    });

                    const text = await response.text();

                    if (!response.ok) {
                        console.error(`Push API error for ${email} (${response.status}): ${text}`);
                        if (attempt === 1 && (response.status === 401 || text.includes('Expired') || text.includes('expiré'))) {
                            retry = true;
                        } else {
                            hasError = true;
                            lastErrorMsg = `Erreur serveur (${response.status})`;
                            break; // Give up on this participant
                        }
                    } else {
                        try {
                            const jsonResponse = JSON.parse(text);
                            console.log(`Push API Response for ${email} (Attempt ${attempt}):`, JSON.stringify(jsonResponse));

                            // Catch standard keys and the French "statut" key
                            if (jsonResponse.success === false || jsonResponse.error || jsonResponse.status === false || jsonResponse.statut === false || jsonResponse.status === 'error') {
                                const errorMsg = jsonResponse.message || 'API returned an error';

                                if (attempt === 1 && (errorMsg.includes('expiré') || errorMsg.includes('Expired') || errorMsg.toLowerCase().includes('token'))) {
                                    retry = true;
                                } else {
                                    console.error(`Push API returned 200 OK but indicated failure:`, errorMsg);
                                    hasError = true;
                                    lastErrorMsg = errorMsg;
                                    break; // Give up on this participant
                                }
                            } else {
                                console.log(`Push notification sent successfully to ${email}`);
                                console.log(`Notification final payload ${JSON.stringify(finalPayload)}`);
                                attemptSuccess = true;
                                break; // Success!
                            }
                        } catch (e) {
                            console.log(`Push API Response for ${email} (non-json):`, text);
                            attemptSuccess = true;
                            break; // Success!
                        }
                    }
                } catch (fetchError: any) {
                    const errorCode = fetchError.cause?.code || fetchError.code || 'UNKNOWN';
                    console.error(`[Push] Fetch error for ${email}: ${fetchError.message} (${errorCode})`);
                    hasError = true;
                    lastErrorMsg = errorCode === 'ECONNREFUSED' ? 'API de notification injoignable (Connexion refusée)' : `Erreur réseau: ${fetchError.message || 'Échec de la notification'}`;
                    break; // Give up on this participant
                }

                if (retry && attempt === 1) {
                    console.log(`[Notifier] Token appears expired for company ${companyId}. Triggering auto-refresh...`);
                    const newToken = await refreshExternToken(companyId);

                    if (newToken) {
                        currentToken = newToken;
                        console.log(`[Notifier] Token refreshed successfully. Retrying push notification...`);
                        continue;
                    } else {
                        console.error(`[Notifier] Auto-refresh failed. Cannot retry.`);
                        hasError = true;
                        lastErrorMsg = 'Session expirée et impossible de renouveler le jeton automatiquement.';
                        break;
                    }
                }
            }

            if (!attemptSuccess && !hasError) {
                hasError = true;
                lastErrorMsg = 'Échec inattendu';
            }
        } // Close for (const email of data.participants) loop

        if (hasError) {
             return { success: false, expired: true, pushMessage: lastErrorMsg };
        }

        return { success: true };
    } catch (error: any) {
        console.error(`Error in sendPushNotification:`, error);
        return { success: false, error: true, expired: true, pushMessage: error.code === 'ECONNREFUSED' ? 'API de notification injoignable (Connexion refusée)' : `Erreur réseau: ${error.message || 'Échec de la notification'}` };
    }
}