import React from 'react';
import { Calendar, MapPin, Info, Play, MoreVertical, Clock, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { Meeting } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { CardBase } from '@/components/ui/CardBase';

interface MeetingCardProps {
  meeting: Meeting & {
    meetings_participants?: any[];
    meetings_attendances?: any[];
  };
}

export function MeetingCard({ meeting }: MeetingCardProps) {
  const t = useTranslations('Meetings');
  const tc = useTranslations('Common');

  const statusConfig: Record<string, { color: string; label: string }> = {
    SCHEDULED: { color: 'bg-blue-100 text-blue-700', label: t('status.scheduled') },
    STARTED: { color: 'bg-green-100 text-green-700', label: t('status.started') },
    FINISHED: { color: 'bg-slate-100 text-slate-700', label: t('status.finished') },
    CANCELLED: { color: 'bg-red-100 text-red-700', label: t('status.cancelled') },
  };

  const statusLabel = meeting.status || 'SCHEDULED';
  const config = statusConfig[statusLabel] ?? statusConfig.SCHEDULED;

  const nbr_invi = meeting.meetings_participants?.length || 0;
  const nbr_accept = meeting.meetings_attendances?.length || 0;
  const participation = nbr_invi > 0 ? Math.round((nbr_accept / nbr_invi) * 100) : 0;

  const meetingType = meeting.type || 'ORDINAIRE';
  const localizedType = t(`types.${meetingType.toLowerCase()}`);

  return (
    <CardBase accentClass="gradient-primary" hover className="group overflow-hidden">
      {/* Accent bar */}
      <div className="absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity gradient-primary" />

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        {/* Status badge and title */}
        <div className="flex-1 min-w-0">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${config.color}`}>
            {config.label}
          </span>
          <h3
            className="text-lg font-semibold mt-3 text-slate-900 group-hover:text-primary transition-colors leading-tight"
            title={meeting.subject}
          >
            {meeting.subject}
          </h3>
        </div>
        <button className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-900 transition-all shrink-0">
          <MoreVertical size={18} />
        </button>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {[{ icon: Calendar, text: `${meeting.date} ${meeting.time}` },
          { icon: Clock, text: meeting.duration ? t(`durations.${meeting.duration}`) : tc('notAvailable') },
          { icon: MapPin, text: meeting.location || tc('notAvailable') },
          { icon: Video, text: meeting.mode ? t(`modes.${meeting.mode}`) : tc('notAvailable') },
          { icon: Info, text: localizedType }].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm font-medium text-slate-500">
            <item.icon size={16} className="text-primary/60" />
            <span className="truncate">{item.text}</span>
          </div>
        ))}
      </div>

      {/* Participation bar */}
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide">
          <span className="text-slate-400">{t('participation')}</span>
          <span className="text-primary">{participation}%</span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${participation}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full ${statusLabel === 'STARTED' ? 'bg-green-500' : 'gradient-primary'} shadow-sm`}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <a
          href={`/meetings/${meeting.id}/live`}
          className="flex-1 bg-[#002B5B] hover:bg-[#003d80] text-white py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 active:scale-95"
        >
          {statusLabel === 'STARTED' ? <Play size={14} fill="currentColor" /> : null}
          {statusLabel === 'STARTED' ? t('card.join') : t('card.start')}
        </a>
        <a
          href={`/meetings/${meeting.id}`}
          className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl text-xs font-semibold uppercase tracking-wide transition-all text-slate-600 active:scale-95"
        >
          {t('card.details')}
        </a>
      </div>
    </CardBase>
  );
}
