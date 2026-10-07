'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Meeting, Company, ApiResponse } from '@/lib/types';
import { MeetingType, MeetingMode, MeetingDuration } from '@/lib/enums/meetings';
import { UserRole } from '@/lib/enums/users';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { Select } from '@/components/ui/selects';

interface MeetingFormProps {
    initialData?: Partial<Meeting>;
    isEditing?: boolean;
}

const emptyForm = {
    subject: '', type: 'ORDINAIRE', date: '', time: '',
    mode: 'IN_PERSON', location: '', duration: 'ONE_HOUR', description: '',
    isonline: 'FALSE', company_id: 0,
};

export function MeetingForm({ initialData, isEditing = false }: MeetingFormProps) {
    const t = useTranslations('Meetings');
    const tc = useTranslations('Common');
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [form, setForm] = useState({
        ...emptyForm,
        ...(initialData ? {
            subject: initialData.subject || '',
            type: initialData.type || 'ORDINAIRE',
            date: initialData.date || '',
            time: initialData.time || '',
            mode: initialData.mode || 'IN_PERSON',
            location: initialData.location || '',
            duration: initialData.duration || 'ONE_HOUR',
            description: initialData.description || '',
            isonline: initialData.isonline || 'FALSE',
            company_id: initialData.company_id || 0,
        } : {}),
    });

    useEffect(() => {
        if (user?.role === UserRole.ADMIN && user.company_id && !isEditing) {
            setForm((f) => ({ ...f, company_id: user.company_id! }));
        }
    }, [user, isEditing]);

    useEffect(() => {
        if (user?.role === UserRole.DEVELOPER) {
            fetch('/api/companies').then((r) => r.json()).then((d) => { if (d.status) setCompanies(d.data); });
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.subject || !form.date || !form.time) { toast.error(t('form.requiredFields')); return; }
        setIsSubmitting(true);
        try {
            const url = isEditing ? `/api/meetings/${initialData?.id}` : '/api/meetings';
            const method = isEditing ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            const result: ApiResponse<Meeting> = await res.json();
            if (result.status) {
                toast.success(isEditing ? t('form.updated') : t('form.created'));
                router.push('/meetings');
                router.refresh();
            } else {
                toast.error(result.message || tc('error'));
            }
        } catch { toast.error(tc('error')); }
        finally { setIsSubmitting(false); }
    };

    if (authLoading) return <div className="flex items-center justify-center py-10"><div className="w-8 h-8 border-4 border-[#002B5B]/20 border-t-[#002B5B] rounded-full animate-spin" /></div>;

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                    { label: t('form.subject'), key: 'subject', type: 'text', placeholder: t('form.subjectPlaceholder') },
                    { label: t('form.date'), key: 'date', type: 'date' },
                    { label: t('form.time'), key: 'time', type: 'time' },
                    { label: t('form.location'), key: 'location', type: 'text', placeholder: form.mode === 'ONLINE' ? t('form.locationPlaceholderOnline') : t('form.locationPlaceholderInPerson') },
                ].map((f) => (
                    <div key={f.key}>
                        <Input
                            label={f.label}
                            type={f.type}
                            value={(form as any)[f.key]}
                            placeholder={f.placeholder}
                            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        />
                    </div>
                ))}
                {[
                    { label: t('form.type'), key: 'type', options: Object.entries(MeetingType).map(([k, v]) => ({ value: v, label: t(`types.${v.toLowerCase()}`) })) },
                    { label: t('form.mode'), key: 'mode', options: Object.entries(MeetingMode).map(([k, v]) => ({ value: v, label: t(`form.modes.${v.toLowerCase().replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())}`) })) },
                    { label: t('form.duration'), key: 'duration', options: Object.entries(MeetingDuration).map(([k, v]) => ({ value: v, label: t(`form.durations.${v.toLowerCase().replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())}`) })) },
                ].map((f) => (
                    <div key={f.key}>
                        <Select
                            label={f.label}
                            value={(form as any)[f.key]}
                            onValueChange={(val) => setForm({ ...form, [f.key]: val })}
                            options={f.options}
                        />
                    </div>
                ))}
                {user?.role === UserRole.DEVELOPER && (
                    <div>
                        <Select
                            label={tc('company')}
                            value={form.company_id.toString()}
                            onValueChange={(val) => setForm({ ...form, company_id: Number(val) })}
                            options={[
                                { value: '0', label: t('form.selectCompany') },
                                ...companies.map((c) => ({ value: c.id.toString(), label: c.name }))
                            ]}
                        />
                    </div>
                )}
            </div>
            <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2.5">{tc('description')}</label>
                <textarea
                    value={form.description}
                    placeholder={t('form.descriptionPlaceholder')}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-100 bg-slate-50/50 text-sm font-medium text-[#002B5B] focus:bg-white focus:border-[#002B5B] focus:ring-4 focus:ring-[#002B5B]/5 outline-none transition-all duration-300 resize-none placeholder:text-slate-300"
                />
            </div>
            <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1 h-10">{tc('cancel')}</Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1 h-10 shadow-lg shadow-blue-900/10">
                    {isSubmitting ? tc('processing') : isEditing ? t('form.edit') : t('form.create')}
                </Button>
            </div>
        </form>
    );
}