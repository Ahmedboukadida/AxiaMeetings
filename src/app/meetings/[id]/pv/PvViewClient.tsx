'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, Clock, Building2, MapPin, FileText, Download, AlertTriangle, Hourglass, FileX, Users, Vote, RefreshCw } from 'lucide-react';

import { sanitizeHtml } from '@/lib/html';
import { cn, formatLogoUrl } from '@/lib/utils';

interface VoteTally { OUI: number; NON: number; NEUTRE: number; total: number }
interface PvPoint { id: number; point: string; description: string | null; type: string; vote_tally: VoteTally }
interface PvDocument { id: number; title: string; file_path: string; order: number; is_html: boolean }
interface PvCompany { name: string; logo_url: string | null }
interface MeetingHeader { id: number; subject: string; date: string; time: string; status: string; company: PvCompany | null }
interface PvData extends MeetingHeader {
    location?: string;
    viewer?: { email: string };
    meetings_points: PvPoint[];
    attendance: { email: string; status: string }[];
    pv_documents: PvDocument[];
    pv_html: string | null;
}

type ViewState =
    | { kind: 'loading' }
    | { kind: 'invalid' }
    | { kind: 'error' }
    | { kind: 'notFinished'; meeting: MeetingHeader | null }
    | { kind: 'ready'; data: PvData };

/** Only same-origin stored files or https URLs become links. */
function isSafeDocUrl(url: string): boolean {
    if (url.startsWith('/api/files/')) return true;
    try {
        return new URL(url).protocol === 'https:';
    } catch {
        return false;
    }
}

function formatDate(date: string, locale: string): string {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    const loc = locale === 'ar' ? 'ar-TN' : locale === 'en' ? 'en-GB' : 'fr-FR';
    return d.toLocaleDateString(loc, { timeZone: 'Africa/Tunis', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PvViewClient() {
    const { id } = useParams<{ id: string }>();
    const searchParams = useSearchParams();
    const token = searchParams.get('t');
    const t = useTranslations('PvView');
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    const locale = useLocale();

    const load = useCallback(async () => {
        if (!token || !id) {
            setState({ kind: 'invalid' });
            return;
        }
        setState({ kind: 'loading' });
        try {
            const res = await fetch(`/api/meetings/${encodeURIComponent(String(id))}/pv?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
            const json = await res.json().catch(() => null);
            if (res.ok && json?.status && json.data) {
                setState({ kind: 'ready', data: json.data as PvData });
            } else if (json?.code === 'NOT_FINISHED') {
                setState({ kind: 'notFinished', meeting: (json.meeting as MeetingHeader) ?? null });
            } else if (res.status === 401 || res.status === 403 || res.status === 404 || json?.code === 'INVALID_LINK') {
                setState({ kind: 'invalid' });
            } else {
                setState({ kind: 'error' });
            }
        } catch {
            setState({ kind: 'error' });
        }
    }, [id, token]);

    useEffect(() => { load(); }, [load]);

    const header: MeetingHeader | null =
        state.kind === 'ready' ? state.data : state.kind === 'notFinished' ? state.meeting : null;

    const pvHtml = useMemo(
        () => (state.kind === 'ready' && state.data.pv_html ? sanitizeHtml(state.data.pv_html) : ''),
        [state],
    );

    if (state.kind === 'loading') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFDFD] gap-4" role="status" aria-live="polite">
                <div className="w-12 h-12 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-500">{t('loading')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] px-4 py-8 md:px-12 md:py-12 relative overflow-hidden">
            <div className="absolute -top-[10%] -end-[10%] w-[60%] h-[60%] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" aria-hidden="true" />
            <div className="absolute -bottom-[10%] -start-[10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" aria-hidden="true" />

            <main className="w-full max-w-4xl mx-auto relative z-10">
                <div className="bg-white/80 backdrop-blur-2xl rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,43,91,0.12)] border border-white/50 overflow-hidden">
                    {/* Header */}
                    <header className="bg-[#002B5B] p-8 md:p-10 text-white relative">
                        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
                            {header?.company?.logo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={formatLogoUrl(header.company.logo_url)}
                                    alt={header.company.name}
                                    className="h-14 w-auto max-w-[160px] rounded-lg bg-white p-2 object-contain shrink-0"
                                />
                            ) : null}
                            <div className="min-w-0">
                                <span className="inline-flex bg-white/10 text-white border border-white/10 rounded-full px-3 py-1 uppercase font-semibold text-[10px] mb-3">
                                    {t('badge')}
                                </span>
                                <h1 className="text-2xl md:text-3xl font-semibold leading-tight break-words">
                                    {header?.subject ?? t('pageTitle')}
                                </h1>
                                {header?.company?.name ? <p className="mt-1 text-sm text-white/70">{header.company.name}</p> : null}
                            </div>
                        </div>
                    </header>

                    <div className="p-6 md:p-10 space-y-10">
                        {header ? (
                            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                {[
                                    { icon: Calendar, label: t('info.date'), value: formatDate(header.date, locale), color: 'text-blue-600', bg: 'bg-blue-50/50' },
                                    { icon: Clock, label: t('info.time'), value: header.time, color: 'text-indigo-600', bg: 'bg-indigo-50/50' },
                                    state.kind === 'ready' && state.data.location
                                        ? { icon: MapPin, label: t('info.location'), value: state.data.location, color: 'text-emerald-600', bg: 'bg-emerald-50/50' }
                                        : { icon: Building2, label: t('info.organization'), value: header.company?.name ?? '—', color: 'text-emerald-600', bg: 'bg-emerald-50/50' },
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center gap-4">
                                        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', item.bg, item.color)} aria-hidden="true">
                                            <item.icon size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <dt className="text-slate-400 font-semibold uppercase text-[10px] mb-0.5">{item.label}</dt>
                                            <dd className="text-slate-800 font-semibold text-sm break-words">{item.value}</dd>
                                        </div>
                                    </div>
                                ))}
                            </dl>
                        ) : null}

                        {state.kind === 'invalid' && (
                            <StatusBox icon={AlertTriangle} tone="red" title={t('states.invalidTitle')} message={t('states.invalidMessage')} />
                        )}
                        {state.kind === 'error' && (
                            <StatusBox icon={AlertTriangle} tone="red" title={t('states.errorTitle')} message={t('states.errorMessage')}>
                                <button
                                    type="button"
                                    onClick={load}
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#002B5B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900"
                                >
                                    <RefreshCw size={16} aria-hidden="true" />
                                    {t('states.retry')}
                                </button>
                            </StatusBox>
                        )}
                        {state.kind === 'notFinished' && (
                            <StatusBox icon={Hourglass} tone="amber" title={t('states.notFinishedTitle')} message={t('states.notFinishedMessage')} />
                        )}

                        {state.kind === 'ready' && <PvContent data={state.data} pvHtml={pvHtml} />}
                    </div>
                </div>

                <p className="mt-10 text-center opacity-40 uppercase font-semibold text-[10px] text-slate-400">{t('poweredBy')}</p>
            </main>
        </div>
    );
}

function StatusBox({ icon: Icon, tone, title, message, children }: {
    icon: typeof AlertTriangle;
    tone: 'red' | 'amber' | 'slate';
    title: string;
    message: string;
    children?: React.ReactNode;
}) {
    const tones = {
        red: 'bg-red-50/40 border-red-100 text-red-900',
        amber: 'bg-amber-50/40 border-amber-100 text-amber-900',
        slate: 'bg-slate-50/60 border-slate-100 text-slate-800',
    } as const;
    return (
        <section role="status" aria-live="polite" className={cn('rounded-2xl border p-8 md:p-10 text-center', tones[tone])}>
            <Icon size={36} className="mx-auto mb-4 opacity-80" aria-hidden="true" />
            <h2 className="text-xl font-semibold mb-2">{title}</h2>
            <p className="text-sm opacity-80 max-w-md mx-auto">{message}</p>
            {children}
        </section>
    );
}

function PvContent({ data, pvHtml }: { data: PvData; pvHtml: string }) {
    const t = useTranslations('PvView');
    const docs = (data.pv_documents ?? []).filter((d) => isSafeDocUrl(d.file_path));
    const attendance = data.attendance ?? [];
    const present = attendance.filter((a) => a.status === 'PRESENT').length;
    const points = data.meetings_points ?? [];
    const hasPv = !!pvHtml || docs.length > 0;

    return (
        <>
            {data.viewer?.email ? <p className="text-xs text-slate-400 -mt-4">{t('viewer', { email: data.viewer.email })}</p> : null}

            {!hasPv && <StatusBox icon={FileX} tone="slate" title={t('states.noPvTitle')} message={t('states.noPvMessage')} />}

            {docs.length > 0 && (
                <section aria-labelledby="pv-docs-heading" className="space-y-4">
                    <h2 id="pv-docs-heading" className="flex items-center gap-2 text-lg font-semibold text-[#002B5B]">
                        <Download size={18} aria-hidden="true" /> {t('sections.documents')}
                    </h2>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {docs.map((d) => {
                            const kind = d.is_html ? t('documents.html') : /\.docx?$/i.test(d.file_path) ? t('documents.word') : t('documents.file');
                            return (
                                <li key={d.id}>
                                    <a
                                        href={d.file_path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        {...(d.is_html ? {} : { download: '' })}
                                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 hover:border-[#002B5B]/30 hover:shadow-md transition-all"
                                    >
                                        <FileText size={22} className="text-[#002B5B] shrink-0" aria-hidden="true" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-slate-800 truncate">{d.title}</span>
                                            <span className="block text-xs text-slate-400">{kind}</span>
                                        </span>
                                        <span className="text-xs font-semibold uppercase text-[#002B5B] shrink-0">
                                            {d.is_html ? t('documents.open') : t('documents.download')}
                                        </span>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {pvHtml && (
                <section aria-labelledby="pv-html-heading" className="space-y-4">
                    <h2 id="pv-html-heading" className="flex items-center gap-2 text-lg font-semibold text-[#002B5B]">
                        <FileText size={18} aria-hidden="true" /> {t('sections.minutes')}
                    </h2>
                    {/* PV HTML is in French: keep LTR inside the article even in the Arabic UI. Sanitized server- and client-side. */}
                    <article
                        lang="fr"
                        dir="ltr"
                        className="rounded-2xl border border-slate-100 bg-white p-5 md:p-8 overflow-x-auto text-slate-800 text-sm leading-relaxed [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:p-2 [&_th]:border [&_th]:border-slate-200 [&_th]:p-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_p]:my-2 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6"
                        dangerouslySetInnerHTML={{ __html: pvHtml }}
                    />
                </section>
            )}

            {points.length > 0 && (
                <section aria-labelledby="pv-votes-heading" className="space-y-4">
                    <h2 id="pv-votes-heading" className="flex items-center gap-2 text-lg font-semibold text-[#002B5B]">
                        <Vote size={18} aria-hidden="true" /> {t('sections.votes')}
                    </h2>
                    <ol className="space-y-3">
                        {points.map((p, idx) => {
                            const isVote = p.type === 'VOTE';
                            const v = p.vote_tally;
                            const outcome = v.total === 0 ? null : v.OUI > v.NON ? 'adopted' : v.OUI < v.NON ? 'rejected' : 'inconclusive';
                            return (
                                <li key={p.id} className="rounded-xl border border-slate-100 bg-white p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="text-xs font-bold text-[#002B5B] bg-blue-50 rounded-lg px-2 py-1 shrink-0">{String(idx + 1).padStart(2, '0')}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-sm font-semibold text-slate-800 break-words">{p.point}</h3>
                                                <span className="text-[10px] uppercase font-semibold text-slate-400">{isVote ? t('votes.vote') : t('votes.info')}</span>
                                                {isVote && outcome && (
                                                    <span className={cn('ms-auto text-[10px] uppercase font-semibold rounded-full px-2 py-0.5',
                                                        outcome === 'adopted' ? 'bg-emerald-50 text-emerald-700' : outcome === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600')}>
                                                        {t(`votes.${outcome}`)}
                                                    </span>
                                                )}
                                            </div>
                                            {p.description ? <p className="mt-1 text-xs text-slate-500 break-words">{p.description}</p> : null}
                                            {isVote && (
                                                v.total > 0 ? (
                                                    <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                                        {[
                                                            { label: t('votes.for'), value: v.OUI, cls: 'text-emerald-700' },
                                                            { label: t('votes.against'), value: v.NON, cls: 'text-red-700' },
                                                            { label: t('votes.abstain'), value: v.NEUTRE, cls: 'text-slate-500' },
                                                            { label: t('votes.total'), value: v.total, cls: 'text-[#002B5B]' },
                                                        ].map((c) => (
                                                            <div key={c.label} className="rounded-lg bg-slate-50 p-2">
                                                                <dt className="text-[10px] uppercase font-semibold text-slate-400">{c.label}</dt>
                                                                <dd className={cn('text-base font-bold', c.cls)}>{c.value}</dd>
                                                            </div>
                                                        ))}
                                                    </dl>
                                                ) : (
                                                    <p className="mt-2 text-xs text-slate-400">{t('votes.noVotes')}</p>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}

            {attendance.length > 0 && (
                <section aria-labelledby="pv-attendance-heading" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="pv-attendance-heading" className="flex items-center gap-2 text-lg font-semibold text-[#002B5B]">
                            <Users size={18} aria-hidden="true" /> {t('sections.attendance')}
                        </h2>
                        <span className="text-xs font-semibold text-slate-500">{t('attendance.summary', { present, total: attendance.length })}</span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th scope="col" className="text-start px-4 py-2 text-[10px] uppercase font-semibold text-slate-400">{t('attendance.participant')}</th>
                                    <th scope="col" className="text-end px-4 py-2 text-[10px] uppercase font-semibold text-slate-400">{t('attendance.status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendance.map((a) => (
                                    <tr key={a.email} className="border-t border-slate-100">
                                        <td className="px-4 py-2 text-slate-700 break-all"><bdi>{a.email}</bdi></td>
                                        <td className="px-4 py-2 text-end">
                                            <span className={cn('text-xs font-semibold rounded-full px-2 py-0.5',
                                                a.status === 'PRESENT' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                                                {a.status === 'PRESENT' ? t('attendance.present') : t('attendance.absent')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </>
    );
}
