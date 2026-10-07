"use client";
import { localAssetUrl } from '@/lib/utils';

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/context/AuthContext";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Home, ArrowLeft, Menu, X } from "lucide-react";
import { useState } from "react";
import { Typography } from "@/components/ui/typographys";
import { toast } from "sonner";

interface PublicSettings {
    logo_file_name?: string | null;
    [key: string]: any;
}

export function PublicNavbar({ settings }: { settings: PublicSettings }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user, logout, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations('Navbar');
    const tc = useTranslations('Common');
    const isHome = pathname === "/";

    const logoSrc = settings.logo_file_name ? (settings.logo_file_name.startsWith('http') ? settings.logo_file_name : (settings.logo_file_name === "AxiaMeetings.svg" ? "/AxiaMeetings.svg" : localAssetUrl(settings.logo_file_name))) : "/AxiaMeetings.svg";

    const handleLogout = async () => {
        try {
            await logout();
            router.push('/');
            router.refresh();
        } catch (error) { toast.error(tc('error')); }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 p-6">
            <motion.nav
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="max-w-7xl mx-auto flex justify-between items-center bg-white rounded-[2rem] px-10 py-4 border border-slate-200 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] transition-all duration-500"
            >
                <Link href="/" className="flex items-center hover:scale-105 transition-all duration-300 active:scale-95">
                    <Image src={logoSrc} alt="Axia Meetings" width={180} height={60} className="h-10 w-auto" priority />
                </Link>

                <div className="hidden md:flex items-center">
                    <AnimatePresence mode="wait">
                        {isHome ? (
                            <motion.div
                                key="home-nav"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="flex items-center gap-10"
                            >
                                <Link href="/#features" className="group">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('features')}</Typography>
                                </Link>
                                <Link href="/#how-it-works" className="group">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('process')}</Typography>
                                </Link>
                                <Link href="/#pricing" className="group">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('pricing')}</Typography>
                                </Link>
                                <Link href="/contact" className="group">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('contact')}</Typography>
                                </Link>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="other-nav"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <Link href="/" className="flex items-center gap-3 group">
                                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#002B5B] group-hover:text-white transition-all duration-300 border border-slate-100 group-hover:border-[#002B5B]">
                                        <ArrowLeft size={16} />
                                    </div>
                                    <Typography variant="label" className="text-slate-500 group-hover:text-[#002B5B] transition-colors">{t('returnHome')}</Typography>
                                </Link>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                <div className="md:hidden flex items-center">
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>


                <div className="hidden md:flex items-center gap-4">
                    {!loading && (
                        user ? (
                            <>
                                <Link href="/overview" className="hidden sm:block">
                                    <Button variant="ghost" className="h-12 px-8">
                                        {t('dashboard')}
                                    </Button>
                                </Link>
                                <Button
                                    onClick={handleLogout}
                                    className="h-12 px-10 shadow-xl shadow-blue-900/20"
                                >
                                    {t('logout')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Link href="/auth/login" className="hidden sm:block">
                                    <Button variant="ghost" className="h-12 px-8">
                                        {t('login')}
                                    </Button>
                                </Link>
                                <Link href="/auth/login">
                                    <Button className="h-12 px-10 shadow-xl shadow-blue-900/20">
                                        {t('getStarted')}
                                    </Button>
                                </Link>
                            </>
                        )
                    )}
                </div>
            
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden absolute top-full left-6 right-6 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
                    >
                        <div className="flex flex-col p-4 gap-4">
                            {isHome ? (
                                <>
                                    <Link href="/#features" onClick={() => setIsMobileMenuOpen(false)} className="text-slate-600 font-medium py-2 px-4 hover:bg-slate-50 rounded-lg">{t('features')}</Link>
                                    <Link href="/#how-it-works" onClick={() => setIsMobileMenuOpen(false)} className="text-slate-600 font-medium py-2 px-4 hover:bg-slate-50 rounded-lg">{t('process')}</Link>
                                    <Link href="/#pricing" onClick={() => setIsMobileMenuOpen(false)} className="text-slate-600 font-medium py-2 px-4 hover:bg-slate-50 rounded-lg">{t('pricing')}</Link>
                                    <Link href="/contact" onClick={() => setIsMobileMenuOpen(false)} className="text-slate-600 font-medium py-2 px-4 hover:bg-slate-50 rounded-lg">{t('contact')}</Link>
                                </>
                            ) : (
                                <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 text-slate-600 font-medium py-2 px-4 hover:bg-slate-50 rounded-lg">
                                    <ArrowLeft size={16} /> {t('returnHome')}
                                </Link>
                            )}
                            
                            <div className="h-px bg-slate-100 my-2"></div>
                            
                            {!loading && (
                                user ? (
                                    <>
                                        <Link href="/overview" onClick={() => setIsMobileMenuOpen(false)}>
                                            <Button variant="ghost" className="w-full justify-center">{t('dashboard')}</Button>
                                        </Link>
                                        <Button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="w-full">{t('logout')}</Button>
                                    </>
                                ) : (
                                    <>
                                        <Link href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                                            <Button variant="ghost" className="w-full justify-center">{t('login')}</Button>
                                        </Link>
                                        <Link href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                                            <Button className="w-full">{t('getStarted')}</Button>
                                        </Link>
                                    </>
                                )
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            </motion.nav>
        </header>
    );
}
