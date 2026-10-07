// Meeting durations supported by the DB enum `meetings_duration`.
// Keep this list in sync with prisma/schema.prisma and src/lib/enums/meetings.tsx.

export const MEETING_DURATION_ORDER = [
    'ONE_HOUR',
    'TWO_HOURS',
    'THREE_HOURS',
    'FOUR_HOURS',
    'FIVE_HOURS',
] as const;

export type MeetingDurationValue = (typeof MEETING_DURATION_ORDER)[number];

export const MEETING_DURATION_MINUTES: Record<MeetingDurationValue, number> = {
    ONE_HOUR: 60,
    TWO_HOURS: 120,
    THREE_HOURS: 180,
    FOUR_HOURS: 240,
    FIVE_HOURS: 300,
};

/** i18n key under `<namespace>.form.durations` for each duration. */
export const MEETING_DURATION_FORM_KEYS: Record<MeetingDurationValue, string> = {
    ONE_HOUR: 'oneHour',
    TWO_HOURS: 'twoHours',
    THREE_HOURS: 'threeHours',
    FOUR_HOURS: 'fourHours',
    FIVE_HOURS: 'fiveHours',
};

/** French labels used in generated documents (PV, AI prompts). */
export const MEETING_DURATION_LABELS_FR: Record<MeetingDurationValue, string> = {
    ONE_HOUR: '1 heure',
    TWO_HOURS: '2 heures',
    THREE_HOURS: '3 heures',
    FOUR_HOURS: '4 heures',
    FIVE_HOURS: '5 heures',
};

export function isMeetingDuration(value: unknown): value is MeetingDurationValue {
    return typeof value === 'string' && (MEETING_DURATION_ORDER as readonly string[]).includes(value);
}

/** Minutes for a duration; falls back to 60 for unknown/missing values. */
export function durationMinutes(value: string | null | undefined): number {
    return isMeetingDuration(value) ? MEETING_DURATION_MINUTES[value] : 60;
}

/** "HH:MM" start + duration -> "HH:MM" end (wraps past midnight). */
export function computeEndTime(start: string | null | undefined, duration: string | null | undefined): string {
    if (!start) return 'N/A';
    const [h, m] = start.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 'N/A';
    const total = h * 60 + m + durationMinutes(duration);
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * True when `duration` does not exceed `limit`. Unknown values on either side
 * are not blocked here (enum validation happens elsewhere).
 */
export function isWithinDurationLimit(duration: string | null | undefined, limit: string | null | undefined): boolean {
    const d = MEETING_DURATION_ORDER.indexOf(duration as MeetingDurationValue);
    const l = MEETING_DURATION_ORDER.indexOf(limit as MeetingDurationValue);
    if (d === -1 || l === -1) return true;
    return d <= l;
}
