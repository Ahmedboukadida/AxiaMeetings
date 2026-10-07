'use client';

import { Bell, Settings, LogOut, Menu, Home } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/context/AuthContext';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useState, useRef, useEffect } from 'react';

interface NavbarProps {
    onMenuClick?: () => void;
    toggleCompact?: () => void;
}

export function Navbar({ onMenuClick, toggleCompact }: NavbarProps) {
    const { user } = useAuth();
    const t = useTranslations('Dashboard.users');
    const tc = useTranslations('Common');
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuRef]);

    const initials = user?.fullname
        ? user.fullname.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        : user?.username?.slice(0, 2).toUpperCase() || '??';

    const roleLabel = user?.role
        ? t(`roles.${user.role.toLowerCase()}`)
        : '';

    return (
        <header className="h-16 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl sticky top-0 z-40 px-4 md:px-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <button
                    onClick={onMenuClick}
                    className="p-2 -ms-2 lg:hidden text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                >
                    <Menu size={20} />
                </button>
                <button
                    onClick={toggleCompact}
                    className="hidden lg:block p-2 -ms-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                >
                    <Menu size={20} />
                </button>
            </div>

            <div className="flex items-center gap-4">

                {user?.role === 'DEVELOPER' && (
                    <>
                        <Link href="/logs">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="p-2.5 hover:bg-slate-100 rounded-xl relative transition-all"
                            >
                                <Bell size={18} className="text-slate-500" />
                            </motion.button>
                        </Link>
                        <Link href="/configurations">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="p-2.5 hover:bg-slate-100 rounded-xl transition-all"
                            >
                                <Settings size={18} className="text-slate-500" />
                            </motion.button>
                        </Link>
                    </>
                )}

                <div className="h-8 w-px bg-slate-200" />

                <div className="relative" ref={menuRef}>
                    <button 
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="flex items-center gap-3 p-1.5 rounded-2xl hover:bg-slate-50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                        <div className="hidden sm:flex flex-col items-end me-1">
                            <span className="text-[14px] font-bold text-slate-900 leading-tight">{user?.fullname || user?.username}</span>
                            <span className="text-[10px] font-bold text-blue-600 uppercase">{roleLabel}</span>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-linear-to-br from-[#002B5B] to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-900/20">
                            {initials}
                        </div>
                    </button>

                    {/* Dropdown Menu */}
                    <div className={`absolute right-0 rtl:right-auto rtl:left-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 transition-all duration-300 ${menuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2'}`}>
                        <div className="px-4 py-2 border-b border-slate-50 mb-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{tc('user')}</p>
                        </div>
                        <Link onClick={() => setMenuOpen(false)} href="/" className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 transition-colors">
                            <Home size={18} />
                            <span className="text-xs font-bold uppercase">{tc('home')}</span>
                        </Link>
                        <Link onClick={() => setMenuOpen(false)} href="/auth/logout" className="flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors">
                            <LogOut size={18} />
                            <span className="text-xs font-bold uppercase">{tc('logout')}</span>
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}
