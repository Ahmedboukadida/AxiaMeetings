import { prisma } from './prisma';
import { refreshExternToken } from './refreshExternToken';

interface SMSPayload {
    body: string;
    participants: string[]; // List of emails to lookup phone numbers
}

export async function sendSMS(companyId: number, data: SMSPayload) {
    try {
        const company = await prisma.companies.findUnique({
            where: { id: companyId },
            include: {
                sms_service_endpoint: {
                    include: { formated_responses: true }
                }
            }
        });

        if (!company || !company.have_sms_service || !company.sms_service_endpoint) {
            return;
        }

        const endpoint = company.sms_service_endpoint;
        const apiUrl = endpoint.endpoint.startsWith('http')
            ? endpoint.endpoint
            : `${company.url}${endpoint.endpoint}`;

        // Get participants' phone numbers from the users table
        const users = await prisma.users.findMany({
            where: {
                email: { in: data.participants },
                company_id: companyId,
                phone: { not: null }
            },
            select: { email: true, phone: true }
        });
        console.log(`[SMS] Found ${users.length} users with phone numbers for company ${companyId}`);

        // Get the admin token for authentication with the external API
        const adminLink = await prisma.companies_admins_login.findFirst({ where: { company_id: companyId }, select: { token_id: true } });
        let currentToken = adminLink?.token_id;

        for (const user of users) {
            if (!user.phone) continue;

            let finalPayload: any = {
                phone: user.phone,
                message: data.body
            };

            // Override with custom mappings if configured in the dashboard
            if (endpoint.formated_responses && endpoint.formated_responses.length > 0) {
                const mapped: any = {};
                for (const m of endpoint.formated_responses) {
                    const reqKey = (m.formated_response_key || '').toLowerCase();
                    const val = reqKey.includes('phone') || reqKey.includes('tel') || reqKey.includes('num') ? user.phone :
                        reqKey.includes('message') || reqKey.includes('body') ? data.body : null;

                    if (val !== null) mapped[m.response_key] = val;
                }

                // If the user has explicitly mapped keys, USE ONLY the mapped keys as the entire payload
                // This gives full control over the payload structure via the dashboard
                const method = endpoint.method || 'POST';
                if (Object.keys(mapped).length > 0 && (method === 'POST' || method === 'PUT')) {
                    finalPayload = mapped;
                }
            }

            for (let attempt = 1; attempt <= 2; attempt++) {
                let retry = false;

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
                    console.error(`SMS API error for ${user.phone} (${response.status}): ${text}`);
                    if (attempt === 1 && (response.status === 401 || text.includes('Expired') || text.includes('expiré'))) {
                        retry = true;
                    } else {
                        break; // Stop for this user on other errors
                    }
                } else {
                    try {
                        const jsonResponse = JSON.parse(text);
                        if (jsonResponse.success === false || jsonResponse.error || jsonResponse.status === false || jsonResponse.statut === false || jsonResponse.status === 'error') {
                            const errorMsg = jsonResponse.message || 'API returned an error';
                            if (attempt === 1 && (errorMsg.includes('expiré') || errorMsg.includes('Expired') || errorMsg.toLowerCase().includes('token'))) {
                                retry = true;
                            } else {
                                console.error(`SMS API returned failure for ${user.phone}:`, errorMsg);
                                break;
                            }
                        } else {
                            console.log(`SMS sent successfully to ${user.phone}`);
                            console.log(`SMS final payload ${JSON.stringify(finalPayload)}`);
                            break; // Success!
                        }
                    } catch (e) {
                        console.log(`SMS sent successfully to ${user.phone} (non-json response)`);
                        break;
                    }
                }

                if (retry && attempt === 1) {
                    console.log(`[SMS] Token appears expired for company ${companyId}. Triggering auto-refresh...`);
                    const newToken = await refreshExternToken(companyId);
                    if (newToken) {
                        currentToken = newToken;
                        console.log(`[SMS] Token refreshed successfully. Retrying SMS...`);
                        continue;
                    } else {
                        console.error(`[SMS] Auto-refresh failed. Cannot retry.`);
                        break;
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error in sendSMS:`, error);
    }
}
