import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getAuthenticatedUser(req);
    if (!user || user.role !== 'DEVELOPER') {
        return NextResponse.json({ status: false, message: 'Forbidden' }, { status: 403 });
    }

    try {
        const { id } = await params;
        const companyId = parseInt(id, 10);
        const company = await prisma.companies.findUnique({
            where: { id: companyId },
        });

        if (!company || !company.url) {
            return NextResponse.json({ status: false, message: 'Company or URL not found' }, { status: 404 });
        }

        const { docUrl } = await req.json();
        const fetchUrl = docUrl || (company.url.endsWith('/api/doc') ? company.url : `${company.url.replace(/\/$/, '')}/api/doc`);

        console.log(`Fetching Swagger from: ${fetchUrl}`);

        const response = await fetch(fetchUrl, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            return NextResponse.json({ status: false, message: `Failed to fetch API docs: ${response.statusText}` }, { status: 400 });
        }

        let swaggerData;
        const text = await response.text();
        try {
            swaggerData = JSON.parse(text);
        } catch (e) {
            // Check if it's NelmioApiDocBundle HTML embedding the JSON
            const match = text.match(/<script id="swagger-data" type="application\/json">\s*(\{[\s\S]*?\})\s*<\/script>/);
            if (match && match[1]) {
                try {
                    const parsedHtmlJson = JSON.parse(match[1]);
                    swaggerData = parsedHtmlJson.spec || parsedHtmlJson;
                } catch (htmlParseErr) {
                    console.error("Failed to parse embedded swagger-data", htmlParseErr);
                }
            }

            // Fallback: try .json endpoint
            if (!swaggerData && fetchUrl.endsWith('/doc')) {
                const retryUrl = fetchUrl + '.json';
                const retryResponse = await fetch(retryUrl, { headers: { 'Accept': 'application/json' } });
                if (retryResponse.ok) {
                    swaggerData = await retryResponse.json();
                } else {
                    return NextResponse.json({ status: false, message: 'Failed to parse API docs. Ensure the URL points to a JSON OpenAPI specification.' }, { status: 400 });
                }
            } else if (!swaggerData) {
                return NextResponse.json({ status: false, message: 'Failed to parse API docs. Ensure the URL points to a JSON OpenAPI specification.' }, { status: 400 });
            }
        }

        if (!swaggerData || !swaggerData.paths) {
            return NextResponse.json({ status: false, message: 'Invalid OpenAPI schema format. Could not find "paths".' }, { status: 400 });
        }

        const apis = [];
        for (const [path, methods] of Object.entries(swaggerData.paths)) {
            for (const [method, _details] of Object.entries(methods as any)) {
                const details: any = _details;

                // Extract request body example
                let payload_example: Record<string, any> | null = null;
                const requestBody = details.requestBody?.content?.['application/json']?.schema;
                if (requestBody && requestBody.$ref && swaggerData.components?.schemas) {
                    const refName = requestBody.$ref.split('/').pop();
                    const schema = swaggerData.components.schemas[refName];
                    if (schema && schema.properties) {
                        payload_example = {};
                        for (const [propName, propDetails] of Object.entries(schema.properties as any)) {
                            payload_example[propName] = (propDetails as any).example || (propDetails as any).type;
                        }
                    }
                }

                // Extract response body example
                let response_example: Record<string, any> | null = null;
                const successResponse = details.responses?.['200']?.content?.['application/json']?.schema || details.responses?.['201']?.content?.['application/json']?.schema;
                if (successResponse && successResponse.$ref && swaggerData.components?.schemas) {
                    const refName = successResponse.$ref.split('/').pop();
                    const schema = swaggerData.components.schemas[refName];
                    if (schema && schema.properties) {
                        response_example = {};
                        for (const [propName, propDetails] of Object.entries(schema.properties as any)) {
                            response_example[propName] = (propDetails as any).example || (propDetails as any).type;
                        }
                    }
                }

                apis.push({
                    endpoint: path,
                    method: method.toUpperCase(),
                    summary: details.summary || `${method.toUpperCase()} ${path}`,
                    payload_example: payload_example || {},
                    response_example: response_example || {},
                });
            }
        }

        return NextResponse.json({ status: true, data: apis });
    } catch (error) {
        console.error('Error parsing swagger:', error);
        return NextResponse.json({ status: false, message: 'Internal server error' }, { status: 500 });
    }
}
