import { prisma } from './prisma';

/**
 * Automatically authenticates with the external company login API
 * and updates the token_id in the database for the admin.
 * Returns the new token if successful, null otherwise.
 */
export async function refreshExternToken(companyId: number): Promise<string | null> {
    try {
        console.log(`[RefreshExternToken] Starting token refresh for company ${companyId}`);
        const company = await prisma.companies.findUnique({
            where: { id: companyId },
            include: {
                login_endpoint: {
                    include: { formated_responses: true }
                },
                companies_admins_login: true
            }
        });

        if (!company || !company.login_endpoint) {
            console.error(`[RefreshExternToken] Missing login endpoint for company ${companyId}`);
            return null;
        }

        if (company.companies_admins_login.length === 0) {
            console.error(`[RefreshExternToken] No admin login configured for company ${companyId}`);
            return null;
        }

        const endpoint = company.login_endpoint;
        const adminLogin = company.companies_admins_login[0];

        if (!adminLogin.username || !adminLogin.password) {
            console.error(`[RefreshExternToken] Admin login is missing username or password`);
            return null;
        }

        // Set token_id to null before refreshing, as requested by the user
        await prisma.companies_admins_login.update({
            where: { id: adminLogin.id },
            data: { token_id: null }
        });

        const apiUrl = endpoint.endpoint.startsWith('http') ? endpoint.endpoint : `${company.url}${endpoint.endpoint}`;
        
        let payload: any = {
            username: adminLogin.username,
            password: adminLogin.password
        };

        // Override with custom mappings if configured
        if (endpoint.formated_responses && endpoint.formated_responses.length > 0) {
            const payloadMappings = endpoint.formated_responses.filter((m: any) => m.format_for === 'PAYLOAD');
            if (payloadMappings.length > 0) {
                const ourToTheir: Record<string, string> = {};
                for (const m of payloadMappings) {
                    ourToTheir[(m.formated_response_key || '').toLowerCase()] = m.response_key;
                }
                
                const method = endpoint.method || 'POST';
                if (method === 'POST' || method === 'PUT') {
                    // Start with empty payload, then apply mapped or standard keys
                    const mappedPayload: any = {};
                    
                    // Look for username mapping variants
                    const userKey = Object.keys(ourToTheir).find(k => k.includes('user') || k.includes('login') || k.includes('email'));
                    mappedPayload[userKey ? ourToTheir[userKey] : 'username'] = adminLogin.username;
                    
                    // Look for password mapping variants
                    const passKey = Object.keys(ourToTheir).find(k => k.includes('pass') || k.includes('pwd'));
                    mappedPayload[passKey ? ourToTheir[passKey] : 'password'] = adminLogin.password;
                    
                    payload = mappedPayload;
                }
            }
        }

        console.log(`[RefreshExternToken] Requesting new token from ${apiUrl}...`);
        console.log(`[RefreshExternToken] Login Payload:`, JSON.stringify(payload));
        
        const response = await fetch(apiUrl, {
            method: endpoint.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const text = await response.text();

        if (!response.ok) {
            console.error(`[RefreshExternToken] Failed to refresh token (${response.status}): ${text}`);
            return null;
        }

        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            console.error(`[RefreshExternToken] Response is not valid JSON: ${text}`);
            return null;
        }

        // Extract token from common response structures
        let newToken: string | null = null;
        
        // Also respect formated_responses for parsing response if configured
        // Usually, the response format might be mapped. If so, response_key maps to internal 'token'
        if (endpoint.formated_responses && endpoint.formated_responses.length > 0) {
            const responseMappings = endpoint.formated_responses.filter((m: any) => m.format_for === 'RESPONSE');
            const tokenMapping = responseMappings.find((m: any) => 
                (m.formated_response_key || '').toLowerCase().includes('token')
            );
            if (tokenMapping && json[tokenMapping.response_key]) {
                newToken = json[tokenMapping.response_key];
            }
        }

        // Fallback to common token fields
        if (!newToken) {
            if (typeof json.token === 'string') newToken = json.token;
            else if (json.data && typeof json.data.token === 'string') newToken = json.data.token;
            else if (typeof json.access_token === 'string') newToken = json.access_token;
            else if (json.data && typeof json.data.access_token === 'string') newToken = json.data.access_token;
        }

        if (newToken) {
            // Update the database so the new token is saved for subsequent requests
            await prisma.companies_admins_login.update({
                where: { id: adminLogin.id },
                data: { token_id: newToken }
            });
            console.log(`[RefreshExternToken] Token successfully refreshed and saved for company ${companyId}`);
            return newToken;
        } else {
            console.error(`[RefreshExternToken] Could not find token in response payload: ${text}`);
            return null;
        }

    } catch (error: any) {
        const errorCode = error.cause?.code || error.code || 'UNKNOWN';
        console.error(`[RefreshExternToken] Exception during refresh: ${error.message} (${errorCode})`);
        return null;
    }
}
