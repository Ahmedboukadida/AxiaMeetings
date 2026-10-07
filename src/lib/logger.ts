import { prisma } from './prisma';
import { redactSecrets } from './safe-select';

/**
 * JSON-safe, secret-free copy for the logs table. Redaction is applied here, centrally,
 * so no route can store a password, token, API key or cookie in request/payload/response.
 */
function toLogJson(value: unknown) {
    if (value === null || value === undefined) return null;
    const plain = JSON.parse(JSON.stringify(value));
    return redactSecrets(plain);
}

export async function createLog({
    message,
    userId = null,
    companyId = null,
    request = null,
    payload = null,
    response = null
}: {
    message: string;
    userId?: number | null;
    companyId?: number | null;
    request?: any;
    payload?: any;
    response?: any;
}) {
    try {
        await prisma.logs.create({
            data: {
                message,
                user_id: userId ?? undefined,
                company_id: companyId || null,
                request: toLogJson(request),
                payload: toLogJson(payload),
                response: toLogJson(response),
            }
        });
    } catch (error) {
        console.error('Failed to create log:', error);
    }
}
