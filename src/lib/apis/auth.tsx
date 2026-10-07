import { User, LoginUser, ApiResponse } from '@/lib/types';

const BASE = '/api';

export async function login(credentials: LoginUser): Promise<ApiResponse<User>> {
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
    });
    return res.json();
}

export async function logout(): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/auth/logout`, { method: 'POST' });
    return res.json();
}

export async function getSession(): Promise<{ isAuthenticated: boolean; user?: User }> {
    const res = await fetch(`${BASE}/auth/session`);
    return res.json();
}
