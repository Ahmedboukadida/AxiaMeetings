"use client";
import { localAssetUrl } from '@/lib/utils';

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { FaFacebook as Facebook, FaLinkedinIn as Linkedin, FaTiktok as TikTok } from "react-icons/fa";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Typography } from "@/components/ui/typographys";

interface PublicSettings {
    logo_file_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    contact_adress?: string | null;
    facebook?: string | null;
    linkedin?: string | null;
    tiktok?: string | null;
    [key: string]: any;
}

export function PublicFooter({ settings }: { settings: PublicSettings }) {
    const [newsletterEmail, setNewsletterEmail] = useState("");
    const [newsletterLoading, setNewsletterLoading] = useState(false);
    const t = useTranslations('Footer');

    const logoSrc = settings.logo_file_name
        ? (settings.logo_file_name.startsWith('http')
            ? settings.logo_file_name
            : (settings.logo_file_name === "AxiaMeetings.svg" ? "/AxiaMeetings.svg" : localAssetUrl(settings.logo_file_name)))
        : "/AxiaMeetings.svg";

    const handleNewsletter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newsletterEmail) return;
        setNewsletterLoading(true);
        try {
            const res = await fetch('/api/newsletters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newsletterEmail }) });
            const result = await res.json();
            if (result.status) {
                toast.success(t('newsletter.success'));
                setNewsletterEmail('');
            } else {
                toast.error(result.message || t('newsletter.error'));
            }
        } catch {
            toast.error(t('newsletter.error'));
        } finally {
            setNewsletterLoading(false);
        }
    };

    return (
        <footer className="bg-white pt-20 md:pt-40 pb-20 px-6 border-t border-slate-100 relative overflow-hidden">

            <div className="max-w-7xl mx-auto">
                {/* Newsletter Card - Floating Style */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    className="bg-white rounded-[2rem] md:rounded-[3.5rem] p-8 md:p-14 mb-20 md:mb-32 shadow-xl border border-slate-100 flex flex-col lg:flex-row items-center justify-between gap-10 relative z-10"
                >
                    <div className="max-w-xl space-y-4 text-center lg:text-start">
                        <Typography variant="h1" className="text-3xl md:text-5xl leading-tight">{t('newsletter.loop')}</Typography>
                        <Typography variant="p" className="italic text-sm md:text-base">{t('newsletter.description')}</Typography>
                    </div>

                    <form onSubmit={handleNewsletter} className="flex flex-col sm:flex-row w-full lg:w-auto gap-4 p-2 sm:p-4 bg-slate-50 rounded-[1.5rem] md:rounded-[2.5rem]">
                        <input
                            type="email"
                            value={newsletterEmail}
                            onChange={e => setNewsletterEmail(e.target.value)}
                            placeholder={t('newsletter.placeholder')}
                            required
                            className="bg-transparent border-none px-6 sm:px-8 py-3 sm:py-4 text-base font-bold text-[#002B5B] placeholder:text-slate-400 flex-1 focus:outline-none focus:ring-0"
                        />
                        <Button type="submit" disabled={newsletterLoading} className="h-14 sm:h-16 px-10 md:px-12 shadow-xl shadow-blue-900/20 rounded-xl sm:rounded-full">
                            {newsletterLoading ? t('processing') : t('newsletter.subscribe')}
                        </Button>
                    </form>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 mb-4">
                    {/* Column 1: Brand & Socials */}
                    <div className="lg:col-span-5 space-y-12">
                        <div className="space-y-8">
                            <Image src={logoSrc} alt="Axia Meetings" width={180} height={60} className="h-10 w-auto" />
                            <Typography variant="p" className="text-2xl text-[#002B5B]/60 italic max-w-sm">
                                {t('tagline')}
                            </Typography>
                        </div>
                    </div>

                    {/* Column 2: Contact Info */}
                    <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
                        <div className="space-y-10">
                            <Typography variant="label" className="text-blue-600 tracking-[0.3em]">{t('connect')}</Typography>
                            <div className="space-y-8">
                                {settings.contact_email && (
                                    <div className="group cursor-default">
                                        <Typography variant="label" className="text-slate-500 group-hover:text-blue-600 transition-colors mb-2">{t('directSupport')}</Typography>
                                        <a href={`mailto:${settings.contact_email}`} className="text-xl font-black text-[#002B5B] hover:text-blue-600 transition-colors break-all">{settings.contact_email}</a>
                                    </div>
                                )}
                                {settings.contact_phone && (
                                    <div className="group cursor-default">
                                        <Typography variant="label" className="text-slate-500 group-hover:text-blue-600 transition-colors mb-2">{t('emergencyHotline')}</Typography>
                                        <a href={`tel:${settings.contact_phone}`} className="text-xl font-black text-[#002B5B] hover:text-blue-600 transition-colors">{settings.contact_phone}</a>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-10">
                            <Typography variant="label" className="text-blue-600 tracking-[0.3em]">{t('presence')}</Typography>
                            <div className="space-y-8">
                                <div className="group cursor-default">
                                    <Typography variant="label" className="text-slate-500 group-hover:text-blue-600 transition-colors mb-2">{t('headquarters')}</Typography>
                                    <Typography variant="large" className="text-[#002B5B] leading-snug">
                                        {settings.contact_adress || t('globalRemote')}
                                    </Typography>
                                </div>
                                <div className="flex items-center gap-4 py-4 px-6 w-fit">
                                    <div className="flex gap-4">
                                        {[
                                            { href: settings.facebook, icon: Facebook, label: "Facebook", color: "hover:bg-blue-600" },
                                            { href: settings.linkedin, icon: Linkedin, label: "LinkedIn", color: "hover:bg-blue-700" },
                                            { href: settings.tiktok, icon: TikTok, label: "TikTok", color: "hover:bg-slate-900" }
                                        ].map((social, i) => social.href && (
                                            <motion.a
                                                key={i}
                                                href={social.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                whileHover={{ y: -5 }}
                                                className={`w-12 h-12 rounded-2xl bg-white shadow-lg shadow-slate-200/50 flex items-center justify-center transition-all ${social.color} hover:text-white group border border-slate-50`}
                                            >
                                                <social.icon className="w-7 h-7 transition-transform group-hover:scale-110" />
                                            </motion.a>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar: Legal & Signature */}
                <div className="pt-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-10">
                    <div className="flex flex-col md:flex-row items-center gap-10">
                        <Typography variant="muted" className="italic">{t('rights', { year: new Date().getFullYear() })}</Typography>
                    </div>

                    <div className="flex items-center gap-6 text-sm font-bold text-[#002B5B]">
                        <Link href="/privacy-policy" className="group">
                            <Typography variant="label" className="text-slate-400 group-hover:text-blue-600 transition-colors">{t('privacy')}</Typography>
                        </Link>
                        <Link href="/terms-of-use" className="group">
                            <Typography variant="label" className="text-slate-400 group-hover:text-blue-600 transition-colors">{t('terms')}</Typography>
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
