import { User, ApiResponse } from '@/lib/types';

const BASE = '/api';

export async function getUsers(companyId?: number): Promise<ApiResponse<User[]>> {
    const url = companyId ? `${BASE}/users?companyId=${companyId}` : `${BASE}/users`;
    const res = await fetch(url);
    return res.json();
}

export async function createUser(data: Partial<User> & { password: string }): Promise<ApiResponse<User>> {
    const res = await fetch(`${BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateUser(id: number, data: Partial<User> & { password?: string }): Promise<ApiResponse<User>> {
    const res = await fetch(`${BASE}/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
    });
    return res.json();
}

export async function deleteUser(id: number): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    });
    return res.json();
}

export async function importUsersFromApp(): Promise<ApiResponse<{ imported: number }>> {
    const res = await fetch(`${BASE}/users/import`, { method: 'POST' });
    return res.json();
}
