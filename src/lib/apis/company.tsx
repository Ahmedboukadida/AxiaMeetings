import { Company, CompanyApi, ApiResponse } from '@/lib/types';

const BASE = '/api';

export async function getCompanies(): Promise<ApiResponse<Company[]>> {
    const res = await fetch(`${BASE}/companies`);
    return res.json();
}

export async function createCompany(data: Partial<Company>): Promise<ApiResponse<Company>> {
    const res = await fetch(`${BASE}/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateCompany(id: number, data: Partial<Company>): Promise<ApiResponse<Company>> {
    const res = await fetch(`${BASE}/companies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function deleteCompany(id: number): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/companies/${id}`, { method: 'DELETE' });
    return res.json();
}

export async function getCompanyApis(companyId?: number): Promise<ApiResponse<CompanyApi[]>> {
    const url = companyId ? `${BASE}/companies/apis?companyId=${companyId}` : `${BASE}/companies/apis`;
    const res = await fetch(url);
    return res.json();
}

export async function createCompanyApi(data: Partial<CompanyApi>): Promise<ApiResponse<CompanyApi>> {
    const res = await fetch(`${BASE}/companies/apis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateCompanyApi(id: number, data: Partial<CompanyApi>): Promise<ApiResponse<CompanyApi>> {
    const res = await fetch(`${BASE}/companies/apis`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
    });
    return res.json();
}

export async function deleteCompanyApi(id: number): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/companies/apis`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}

export async function linkApplication(username: string, password: string): Promise<ApiResponse<{ token_id: string }>> {
    const res = await fetch(`${BASE}/companies/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    return res.json();
}

export async function unlinkApplication(): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/companies/link`, { method: 'DELETE' });
    return res.json();
}
