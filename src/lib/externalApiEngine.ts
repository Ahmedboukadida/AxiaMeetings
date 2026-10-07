import { prisma } from './prisma';
import { refreshExternToken } from './refreshExternToken';

export type ExternalApiActionType = 'get_users' | 'push_mails' | 'push_notification' | 'push_messages' | 'push_sms' | 'login';

export interface ExecuteExternalApiParams {
    companyId: number;
    actionType: ExternalApiActionType;
    payload?: any;
    params?: Record<string, string>;
}

export async function executeExternalApiAction({ companyId, actionType, payload, params }: ExecuteExternalApiParams) {
    console.log(`[ExternalApiEngine] Executing ${actionType} for company ${companyId}`);

    // Fetch the company and all necessary endpoints
    const company = await prisma.companies.findUnique({
        where: { id: companyId },
        include: {
            login_endpoint: { include: { formated_responses: true } },
            users_endpoint: { include: { formated_responses: true } },
            push_mails_endpoint: { include: { formated_responses: true } },
            notifications_service_endpoint: { include: { formated_responses: true } },
            messages_service_endpoint: { include: { formated_responses: true } },
            sms_service_endpoint: { include: { formated_responses: true } },
            companies_admins_login: true,
        },
    });

    if (!company) {
        throw new Error(`Company ${companyId} not found`);
    }

    // Determine which endpoint configuration to use based on actionType
    let endpointConfig: any = null;
    switch (actionType) {
        case 'login': endpointConfig = company.login_endpoint; break;
        case 'get_users': endpointConfig = company.users_endpoint; break;
        case 'push_mails': endpointConfig = company.push_mails_endpoint; break;
        case 'push_notification': endpointConfig = company.notifications_service_endpoint; break;
        case 'push_messages': endpointConfig = company.messages_service_endpoint; break;
        case 'push_sms': endpointConfig = company.sms_service_endpoint; break;
    }

    if (!endpointConfig) {
        return { success: false, message: `No endpoint configured for action: ${actionType}` };
    }

    // Build the request URL
    let apiUrl = endpointConfig.endpoint.startsWith('http') 
        ? endpointConfig.endpoint 
        : `${company.url}${endpointConfig.endpoint}`;

    if (params) {
        const urlParams = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            urlParams.append(k, v);
        }
        apiUrl += (apiUrl.includes('?') ? '&' : '?') + urlParams.toString();
    }

    const adminLogin = company.companies_admins_login[0];

    // Format the payload using PAYLOAD mappings
    let finalPayload = payload;
    if (payload && endpointConfig.formated_responses && endpointConfig.formated_responses.length > 0) {
        const payloadMappings = endpointConfig.formated_responses.filter((r: any) => r.format_for === 'PAYLOAD');
        if (payloadMappings.length > 0) {
            finalPayload = { ...payload }; // start with original, or we can just build from scratch
            for (const m of payloadMappings) {
                // our key = formated_response_key, their key = response_key
                const reqKey = m.formated_response_key.toLowerCase().trim();
                
                let val = payload[m.formated_response_key];
                if (val === undefined) {
                    if (reqKey === 'header' || reqKey === 'title' || reqKey === 'type' || reqKey === 'subject') val = payload.title;
                    else if (reqKey === 'body' || reqKey === 'message' || reqKey === 'content') val = payload.body || payload.content;
                    else if (reqKey.includes('identifi') || reqKey === 'userid' || reqKey.includes('participant')) val = payload.identifiant_extern || payload.participant_ids;
                    else if (reqKey.includes('meeting') || reqKey === 'relatedentityid') val = payload.meeting;
                    else if (reqKey === 'email' || reqKey === 'emails') val = payload.emails;
                    else if (reqKey === 'phone' || reqKey === 'phones') val = payload.phones;
                    else if (reqKey === 'url' || reqKey === 'join_url' || reqKey === 'link') val = payload.join_urls;
                }

                if (val !== undefined) {
                    finalPayload[m.response_key] = val;
                    delete finalPayload[m.formated_response_key]; // remove old key
                }
            }
        }
    }

    // Prepare Request Options
    const getOptions = (token: string | null) => ({
        method: endpointConfig.method || (actionType === 'get_users' ? 'GET' : 'POST'),
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: ['GET', 'HEAD'].includes(endpointConfig.method?.toUpperCase() || (actionType === 'get_users' ? 'GET' : 'POST')) 
              ? undefined 
              : JSON.stringify(finalPayload || {})
    });

    let currentToken = adminLogin?.token_id || null;
    let externalRes: Response;
    let responseText = '';

    // We allow exactly 1 retry if the token is invalid
    for (let attempt = 1; attempt <= 2; attempt++) {
        externalRes = await fetch(apiUrl, getOptions(currentToken));
        responseText = await externalRes.text();

        if (!externalRes.ok) {
            const isAuthError = externalRes.status === 401 || responseText.toLowerCase().includes('expired') || responseText.toLowerCase().includes('token');
            if (attempt === 1 && isAuthError && actionType !== 'login') {
                console.log(`[ExternalApiEngine] Token expired/invalid for company ${companyId}. Attempting auto-refresh...`);
                const newToken = await refreshExternToken(companyId);
                if (newToken) {
                    currentToken = newToken;
                    continue; // Retry the exact same request
                } else {
                    return { success: false, message: 'External API authentication failed and token refresh was unsuccessful.' };
                }
            }
            return { success: false, status: externalRes.status, message: `External API returned error (${externalRes.status}): ${responseText.substring(0, 200)}` };
        }

        // Try parsing JSON
        let externalData;
        try {
            externalData = JSON.parse(responseText);
        } catch {
            // Some APIs might return plain text. Just return it directly.
            return { success: true, data: responseText };
        }

        // Handle logical errors inside 200 OK
        const isLogicalAuthError = externalData.success === false && (externalData.message?.toLowerCase().includes('expired') || externalData.error?.toLowerCase().includes('token'));
        if (attempt === 1 && isLogicalAuthError && actionType !== 'login') {
            console.log(`[ExternalApiEngine] Token expired/invalid (Logical Error) for company ${companyId}. Attempting auto-refresh...`);
            const newToken = await refreshExternToken(companyId);
            if (newToken) {
                currentToken = newToken;
                continue;
            }
        }

        // Success - Map the Response!
        const responseMappings = endpointConfig.formated_responses?.filter((r: any) => r.format_for === 'RESPONSE') || [];
        
        // Helper to format a single object
        const formatResponseObj = (obj: any) => {
            if (!obj || typeof obj !== 'object') return obj;
            const mappedObj = { ...obj };
            
            for (const m of responseMappings) {
                // their key(s) = m.response_key (can be "first_name+last_name"), our key = m.formated_response_key ("fullname")
                const theirKeys = m.response_key.split('+').map((k: string) => k.trim());
                
                if (theirKeys.length > 1) {
                    // Concatenate multiple keys
                    const values = theirKeys.map((k: string) => obj[k]).filter((v: any) => v !== undefined && v !== null);
                    if (values.length > 0) {
                        mappedObj[m.formated_response_key] = values.join(' ');
                    }
                } else {
                    // Direct mapping
                    if (obj[m.response_key] !== undefined) {
                        mappedObj[m.formated_response_key] = obj[m.response_key];
                    }
                }
            }
            return mappedObj;
        };

        // If data is an array (like get_users), format each item
        let finalData = externalData;
        const arrayData = Array.isArray(externalData) ? externalData : (externalData.data || externalData.users || externalData.items || externalData.results);
        
        if (Array.isArray(arrayData)) {
            finalData = arrayData.map(formatResponseObj);
            // Re-wrap if it was nested
            if (!Array.isArray(externalData)) {
                if (externalData.data) externalData.data = finalData;
                else if (externalData.users) externalData.users = finalData;
                else if (externalData.items) externalData.items = finalData;
                else if (externalData.results) externalData.results = finalData;
                finalData = externalData;
            }
        } else {
            finalData = formatResponseObj(externalData);
        }

        return { success: true, data: finalData, originalResponse: externalData };
    }

    return { success: false, message: 'Maximum retries reached.' };
}
