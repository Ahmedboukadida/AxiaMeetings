'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/context/AuthContext';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { LogOut, Loader2 } from 'lucide-react';
import { Typography } from '@/components/ui/typographys';

export default function LogoutPage() {
    const t = useTranslations('Auth.logout');
    const { logout, isAuthenticated, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!isAuthenticated) {
            router.replace('/');
            return;
        }
        const doLogout = async () => {
            // Artificial delay for smoother transition
            await new Promise(resolve => setTimeout(resolve, 800));
            await logout();
            router.replace('/');
        };
        doLogout();
    }, [loading, isAuthenticated, logout, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FDFDFD] relative overflow-hidden">
            {/* Background Decorative Gradients */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-50/50 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 -z-10"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-slate-50 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 -z-10"></div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-8 relative z-10"
            >
                <div className="relative">
                    <div className="w-24 h-24 bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-blue-900/10 flex items-center justify-center text-[#002B5B]">
                        <LogOut size={40} className="ml-1" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#002B5B] rounded-2xl flex items-center justify-center text-white shadow-lg border-4 border-white">
                        <Loader2 size={18} className="animate-spin" />
                    </div>
                </div>
                
                <div className="text-center space-y-2">
                    <Typography variant="h3" className="text-xl tracking-tight">{t('title')}</Typography>
                    <Typography variant="label" className="uppercase tracking-[0.2em] font-black opacity-30 text-[10px]">{t('clearingSession')}</Typography>
                </div>
            </motion.div>
        </div>
    );
}
