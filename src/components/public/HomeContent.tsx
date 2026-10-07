"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeroMockup } from "@/components/public/HeroMockup";
import { ListMockup } from "@/components/public/ListMockup";
import { useState } from "react";
import { formatLogoUrl } from "@/lib/utils";

export default function HomeContent({ packs, references }: { packs: any[], references: any[] }) {
    const t = useTranslations('Home');
    const tc = useTranslations('Common');
    const [isAnnual, setIsAnnual] = useState(false);

    return (
        <div className="relative flex flex-col min-h-screen bg-[#F0F5FA]  text-slate-900  selection:bg-blue-600 selection:text-white overflow-x-hidden font-sans">
            
            {/* Global Background Clouds for top section */}
            <div className="absolute top-0 left-0 w-full h-[1000px] z-0 pointer-events-none">
                <div className="w-full h-full  relative">
                    <img src="/images/clouds_light.png" alt="" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-[#F0F5FA] to-transparent"></div>
                </div>
                <div className="w-full h-full hidden  relative bg-[#020617]">
                    <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-blue-900/20 to-transparent"></div>
                </div>
            </div>

            <main className="flex-1 pt-48 md:pt-56 pb-20 px-4 md:px-6 max-w-[1400px] mx-auto w-full space-y-16 md:space-y-32 relative z-10">
                
                {/* 1. Hero Section */}
                <section className="relative w-full text-center flex flex-col items-center">
                    <div className="relative z-10 max-w-4xl mx-auto space-y-8 flex flex-col items-center">
                        <h1 className="text-4xl md:text-6xl lg:text-[5rem] leading-[1.05] font-semibold tracking-tight text-[#002B5B]  max-w-3xl">
                            {t.rich('hero.title', { 
                                br: () => <br />, 
                                highlight: (chunks) => <span className="font-serif italic font-light tracking-normal">{chunks}</span> 
                            })}
                        </h1>
                        
                        <p className="text-lg md:text-xl text-[#002B5B]/90  max-w-2xl font-medium leading-relaxed">
                            {t('hero.subtitle')}
                        </p>

                        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                            <Link href="/auth/login">
                                <Button className="h-14 px-8 rounded-full bg-[#002B5B]  text-white  hover:bg-blue-900 :bg-slate-200 font-bold text-base shadow-xl">
                                    {t('hero.cta')} <span className="ml-2">→</span>
                                </Button>
                            </Link>
                            <div className="flex items-center gap-3 bg-white/50  backdrop-blur-md px-6 py-3 rounded-full border border-[#002B5B]/10 ">
                                <div className="flex -space-x-2">
                                    {[1,2,3].map(i => (
                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white  bg-slate-200 overflow-hidden">
                                            <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="" className="w-full h-full object-cover"/>
                                        </div>
                                    ))}
                                </div>
                                <span className="text-sm font-semibold text-[#002B5B] ">Join 50K+ Teams</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 w-full max-w-5xl mx-auto mt-16 px-4 md:px-0">
                        <motion.div 
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.8 }}
                            className="relative"
                        >
                            <HeroMockup />
                        </motion.div>
                    </div>
                </section>

                {/* 2. Metrics Bar */}
                <section className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 -mt-6 md:-mt-16 relative z-20 px-4">
                    <div className="bg-white  text-slate-900  rounded-[2rem] p-6 flex items-center gap-4 shadow-xl border border-slate-100 ">
                        <div className="w-12 h-12 rounded-full bg-blue-50  text-blue-600 flex items-center justify-center text-xl font-bold">24h</div>
                        <div>
                            <div className="font-bold text-lg">24h</div>
                            <div className="text-sm text-slate-500">Meeting limit</div>
                        </div>
                    </div>
                    <div className="bg-white  text-slate-900  rounded-[2rem] p-6 flex items-center gap-4 shadow-xl border border-slate-100 ">
                        <div className="w-12 h-12 rounded-full bg-green-50  text-green-600 flex items-center justify-center text-xl font-bold">⏳</div>
                        <div>
                            <div className="font-bold text-lg">0.3s</div>
                            <div className="text-sm font-medium text-slate-500">Translation</div>
                        </div>
                    </div>
                    <div className="bg-white  text-slate-900  rounded-[2rem] p-6 flex items-center gap-4 shadow-xl border border-slate-100 ">
                        <div className="w-12 h-12 rounded-full bg-red-50  text-red-600 flex items-center justify-center text-xl font-bold">🎯</div>
                        <div>
                            <div className="font-bold text-lg">98%</div>
                            <div className="text-sm text-slate-500">Speech Recognition</div>
                        </div>
                    </div>
                </section>

                {/* 3. AI Features Grid */}
                <section className="max-w-6xl mx-auto pt-10">
                    <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                        <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#002B5B]  max-w-sm">
                            AI that works inside <span className="font-serif italic font-light">every meeting</span>
                        </h2>
                        <div className="flex items-center gap-4 bg-white  p-2 rounded-full shadow-sm border border-slate-100  pr-6">
                            <div className="flex -space-x-2">
                                {[1,2,3].map(i => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white  bg-slate-200 overflow-hidden">
                                        <img src={`https://i.pravatar.cc/100?img=${i+20}`} alt="" className="w-full h-full object-cover"/>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div className="font-bold text-lg text-[#002B5B]  leading-none">55K+</div>
                                <div className="text-xs text-slate-500 font-medium">Active Users</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Noise Cancellation */}
                        <div className="bg-white  rounded-[2rem] p-8 shadow-sm border border-slate-100  flex flex-col items-center text-center gap-8">
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-[#002B5B] ">Noise Cancellation</h3>
                                <p className="text-sm text-slate-600  font-medium px-4">Eliminate background noise and distractions instantly with AI.</p>
                            </div>
                            <div className="w-full mt-auto">
                                <img src="/images/noise_cancellation_ui.png" alt="Noise Cancellation" className="w-full h-auto rounded-xl shadow-lg border border-slate-100 " />
                            </div>
                        </div>
                        {/* Meeting Summaries */}
                        <div className="bg-white  rounded-[2rem] p-8 shadow-sm border border-slate-100  flex flex-col items-center text-center gap-8">
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-[#002B5B] ">Meeting Summaries</h3>
                                <p className="text-sm text-slate-600  font-medium px-4">Automated wrap-ups highlighting decisions and action items.</p>
                            </div>
                            <div className="w-full mt-auto">
                                <img src="/images/meeting_summaries_ui.png" alt="Meeting Summaries" className="w-full h-auto rounded-xl shadow-lg border border-slate-100 " />
                            </div>
                        </div>
                        {/* Live Transcription */}
                        <div className="bg-white  rounded-[2rem] p-8 shadow-sm border border-slate-100  flex flex-col items-center text-center gap-8">
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-[#002B5B] ">Live Transcription</h3>
                                <p className="text-sm text-slate-600  font-medium px-4">Follow along easily with real-time accurate captions in any language.</p>
                            </div>
                            <div className="w-full mt-auto">
                                <img src="/images/live_transcription_ui.png" alt="Live Transcription" className="w-full h-auto rounded-xl shadow-lg border border-slate-100 " />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 4. Secondary Feature Section */}
                <section className="max-w-5xl mx-auto pt-10 text-center space-y-12">
                    <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#002B5B] ">
                        Unfair Advantage <br/>
                        <span className="font-serif italic font-light">in Every Boardroom</span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                        <div className="bg-white  rounded-[2rem] overflow-hidden shadow-sm border border-slate-100 ">
                            <img src="/images/boardroom_worker.png" alt="Professional working" className="w-full h-full object-cover min-h-[300px]" />
                        </div>
                        <div className="bg-white  rounded-[2rem] p-10 shadow-sm border border-slate-100  flex flex-col justify-center gap-8">
                            <div className="w-16 h-16 rounded-2xl bg-blue-50  flex items-center justify-center text-3xl shadow-inner">
                                🌍
                            </div>
                            <h3 className="text-2xl font-bold text-[#002B5B] ">All in 1 engagement platform</h3>
                            <p className="text-slate-600  font-medium">To collaborate and connect across distance.</p>
                            
                            <div className="flex flex-wrap gap-2">
                                <span className="px-4 py-2 bg-red-50 text-red-600 rounded-full text-sm font-bold">Brainstorming</span>
                                <span className="px-4 py-2 bg-green-50 text-green-600 rounded-full text-sm font-bold">Product Feedback</span>
                                <span className="px-4 py-2 bg-purple-50 text-purple-600 rounded-full text-sm font-bold">One on One</span>
                                <span className="px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-bold">Daily Standup</span>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="px-4 py-2 bg-slate-100  text-slate-700  rounded-full text-sm font-bold border border-slate-200 ">English</span>
                                <span className="px-4 py-2 bg-slate-100  text-slate-700  rounded-full text-sm font-bold border border-slate-200 ">Français</span>
                                <span className="px-4 py-2 bg-slate-100  text-slate-700  rounded-full text-sm font-bold border border-slate-200 ">العربية</span>
                            </div>

                            <div className="h-px w-full bg-slate-100  my-4" />

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-lg font-bold text-[#002B5B] ">Elevate your meetings</div>
                                    <div className="text-sm text-slate-600 ">Capture the best ideas effortlessly.</div>
                                </div>
                                <Button className="rounded-full bg-[#002B5B] text-white hover:bg-blue-900  ">
                                    Try it free
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 5. References */}
                <section className="max-w-5xl mx-auto pt-10">
                    <div className="bg-white  rounded-[2.5rem] p-8 md:p-12 shadow-sm border border-slate-100 ">
                        <div className="text-center space-y-6">
                            <h2 className="text-4xl font-semibold tracking-tight text-[#002B5B]  leading-tight">
                                Trusted by <span className="font-serif italic font-light">the Best</span>
                            </h2>
                            <p className="text-lg font-medium text-slate-700  max-w-2xl mx-auto">
                                Companies around the world rely on AXIA to power their most important meetings.
                            </p>
                        </div>

                        <div className="mt-12 flex flex-wrap justify-center items-center gap-8 md:gap-16">
                            {references && references.length > 0 ? (
                                references.map((ref, idx) => (
                                    <div key={idx} className="opacity-70 hover:opacity-100 transition-opacity grayscale hover:grayscale-0 flex flex-col items-center gap-2">
                                        <img src={formatLogoUrl(ref.logo_file_name)} alt={ref.name} className="h-12 w-auto object-contain" />
                                        <span className="text-sm font-semibold text-slate-600 ">{ref.name}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-slate-500  italic">No references found in database.</div>
                            )}
                        </div>
                    </div>
                </section>

                {/* 6. Pricing */}
                <section id="pricing" className="max-w-6xl mx-auto pt-10 space-y-12">
                    <div className="text-center space-y-6">
                        <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#002B5B] ">
                            One Plan Away <br/>
                            from <span className="font-serif italic font-light">Better Meetings</span>
                        </h2>
                        <div className="inline-flex items-center gap-2 bg-white  p-1 rounded-full shadow-sm border border-slate-100 ">
                            <button onClick={() => setIsAnnual(false)} className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${!isAnnual ? 'bg-[#002B5B] text-white  ' : 'text-slate-500 hover:text-[#002B5B]  :text-white'}`}>Monthly</button>
                            <button onClick={() => setIsAnnual(true)} className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${isAnnual ? 'bg-[#002B5B] text-white  ' : 'text-slate-500 hover:text-[#002B5B]  :text-white'}`}>Annually</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                        {packs && packs.length > 0 ? (
                            packs.map((pack, idx) => {
                                const isPopular = idx === 1; // Assuming 2nd pack is "Popular" or just style it dynamically
                                const colors = [
                                    { border: 'border-t-yellow-400', check: 'bg-slate-100  text-[#002B5B] ' },
                                    { border: 'border-t-green-400', check: 'bg-green-500 text-white', highlight: true },
                                    { border: 'border-t-blue-400', check: 'bg-slate-100  text-[#002B5B] ' }
                                ];
                                const style = colors[idx % colors.length];

                                return (
                                    <div key={idx} className={`bg-white  rounded-[2.5rem] p-10 border-t-8 ${style.border} border-l border-r border-b border-slate-100  shadow-sm flex flex-col h-full ${style.highlight ? 'shadow-xl transform scale-105 z-10 relative' : ''}`}>
                                        {style.highlight && (
                                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#002B5B] text-white   px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                                Most Popular
                                            </div>
                                        )}
                                        <div className={`space-y-4 mb-8 ${style.highlight ? 'mt-4' : ''}`}>
                                            <h3 className="text-2xl font-bold text-[#002B5B] ">{pack.name}</h3>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-4xl md:text-5xl font-semibold tracking-tighter text-[#002B5B] ">${isAnnual ? pack.price_year : pack.price_month}</span>
                                                <span className="text-slate-500  font-bold">/{isAnnual ? 'yr' : 'mo'}</span>
                                            </div>
                                        </div>
                                        <Button className={`w-full rounded-full mb-8 ${style.highlight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-[#002B5B] text-white hover:bg-blue-900  '}`}>
                                            Get Started
                                        </Button>
                                        <ul className="space-y-4 mt-auto">
                                            {pack.packs_lines?.map((line: any, i: number) => (
                                                <li key={i} className="flex items-center gap-3 text-sm font-medium text-slate-700 ">
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${style.check}`}>✓</div>
                                                    {line.title}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="col-span-3 text-center text-slate-500 py-10">No packages found in database.</div>
                        )}
                    </div>
                </section>

                {/* 7. Bottom CTA */}
                <section className="max-w-6xl mx-auto pt-10">
                    <div className="relative w-full rounded-[3rem] overflow-hidden pt-20 px-6 text-center shadow-2xl flex flex-col items-center border border-slate-200  bg-white ">
                        {/* Clouds Background for CTA */}
                        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                            <div className="w-full h-full  opacity-60">
                                <img src="/images/clouds_light.png" alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="w-full h-full hidden  bg-[#020617]">
                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900/30 to-slate-900"></div>
                            </div>
                        </div>
                        
                        <div className="relative z-10 space-y-6 max-w-2xl flex flex-col items-center mb-16">
                            <div className="flex -space-x-2 mb-2">
                                {[1,2,3].map(i => (
                                    <div key={i} className="w-12 h-12 rounded-full border-2 border-white  bg-slate-200 overflow-hidden">
                                        <img src={`https://i.pravatar.cc/100?img=${i+30}`} alt="" className="w-full h-full object-cover"/>
                                    </div>
                                ))}
                            </div>
                            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#002B5B]  leading-tight drop-shadow-sm">
                                Join 50,000+ teams using AXIA to run better, smarter, and more productive meetings — starting today.
                            </h2>
                            <Link href="/auth/login" className="inline-block pt-4">
                                <Button className="h-14 px-10 rounded-full bg-[#002B5B] text-white hover:bg-blue-900 font-bold text-base shadow-xl  ">
                                    Start for free <span className="ml-2">→</span>
                                </Button>
                            </Link>
                        </div>

                        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 md:px-0">
                            <div className="relative rounded-t-[2rem] overflow-hidden shadow-2xl border-4 border-white/20 border-b-0">
                                <ListMockup />
                            </div>
                        </div>
                    </div>
                </section>

            </main>
        </div>
    );
}