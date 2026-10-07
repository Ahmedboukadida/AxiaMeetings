'use client';

import React from 'react';
import { useAuth } from '@/components/context/AuthContext';
import { UserRole } from '@/lib/enums/users';

interface AiFeatureGuardProps {
    children: React.ReactNode;
}

export function AiFeatureGuard({ children }: AiFeatureGuardProps) {
    const { user, loading } = useAuth();

    if (loading) return null;

    // Developers always have access to AI features for testing
    // Other roles must belong to a company with ai_is_active = true
    if (user?.role === UserRole.DEVELOPER || user?.ai_is_active) {
        return <>{children}</>;
    }

    return null;
}
