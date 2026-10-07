import { AppSettings, Log, ApiResponse } from '@/lib/types';

const BASE = '/api';

export async function getAppSettings(): Promise<ApiResponse<AppSettings>> {
    const res = await fetch(`${BASE}/configurations`);
    return res.json();
}

export async function saveAppSettings(data: Partial<AppSettings>): Promise<ApiResponse<AppSettings>> {
    const res = await fetch(`${BASE}/configurations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function getLogs(limit = 50, offset = 0, companyId?: number): Promise<ApiResponse<Log[]>> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (companyId) params.set('companyId', String(companyId));
    const res = await fetch(`${BASE}/logs?${params}`);
    return res.json();
}

export async function createLog(data: { message: string; payload?: any; response?: any; company_id?: number }): Promise<ApiResponse<Log>> {
    const res = await fetch(`${BASE}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}
