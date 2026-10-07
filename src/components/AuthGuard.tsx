'use client';

import { useAuth } from '@/components/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { UserRole } from '@/lib/enums/users';
import { useTranslations } from 'next-intl';

interface AuthGuardProps {
    children: React.ReactNode;
    requiredRole?: UserRole;
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
    const { isAuthenticated, loading, user } = useAuth();
    const tc = useTranslations('Common');
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            router.replace('/auth/login');
            return;
        }
        if (requiredRole && user?.role !== requiredRole) {
            router.replace('/overview');
        }
    }, [isAuthenticated, loading, user, requiredRole, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{tc('loading')}...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) return null;
    if (requiredRole && user?.role !== requiredRole) return null;

    return <>{children}</>;
}
