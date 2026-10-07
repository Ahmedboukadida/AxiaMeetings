'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { LoginUser, AuthContextType, User } from '@/lib/types/user';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthUser({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await fetch('/api/auth/session');
                if (res.ok) {
                    const data = await res.json();
                    if (data.isAuthenticated && data.user) {
                        setUser(data.user);
                    } else {
                        setUser(null);
                    }
                } else {
                    setUser(null);
                }
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        checkSession();
    }, []);

    const login = async (loginUser: LoginUser) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginUser),
        });
        const data = await res.json();
        if (!res.ok || !data.status) {
            const err = new Error(data.message || 'Login failed') as Error & { code?: string };
            err.code = data.code;
            throw err;
        }
        setUser(data.user);
    };

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthUser provider');
    }
    return context;
}
