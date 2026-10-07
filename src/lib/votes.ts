// Vote validation, storage and tallies for agenda points.
// server.mjs (plain ESM, not compiled) carries a minimal copy of the same
// rules — keep both in sync: normaliseVote, the point/participant checks,
// the upsert and the "last vote per participant wins" tally.

import type { PrismaClient } from '@prisma/client';

export const VOTE_VALUES = ['OUI', 'NON', 'NEUTRE'] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

export interface VoteTally {
    results: { oui: number; non: number; neutre: number };
    total: number;
}

/** Accepts OUI/NON/NEUTRE in any case (e.g. 'Oui', 'non'); anything else -> null. */
export function normaliseVote(value: unknown): VoteValue | null {
    if (typeof value !== 'string') return null;
    const upper = value.trim().toUpperCase();
    return (VOTE_VALUES as readonly string[]).includes(upper) ? (upper as VoteValue) : null;
}

/** Positive integer id or null. */
export function toId(value: unknown): number | null {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

type Db = Pick<PrismaClient, 'meetings_points' | 'meetings_participants' | 'meetings_votes'>;

export type VoteTargetCheck =
    | { ok: true; point: { id: number; point: string; meeting_id: number } }
    | { ok: false; status: number; message: string };

/** The point must exist, belong to the meeting and be a VOTE point; the participant must belong to the meeting. */
export async function checkVoteTarget(db: Db, meetingId: number, pointId: number, participantId: number): Promise<VoteTargetCheck> {
    const point = await db.meetings_points.findUnique({
        where: { id: pointId },
        select: { id: true, point: true, meeting_id: true, type: true },
    });
    if (!point || point.meeting_id !== meetingId) {
        return { ok: false, status: 404, message: 'Point not found in this meeting' };
    }
    if (point.type !== 'VOTE') {
        return { ok: false, status: 400, message: 'This point is not submitted to a vote' };
    }
    const participant = await db.meetings_participants.findFirst({
        where: { id: participantId, meeting_id: meetingId },
        select: { id: true },
    });
    if (!participant) {
        return { ok: false, status: 403, message: 'Participant not found in this meeting' };
    }
    return { ok: true, point: { id: point.id, point: point.point, meeting_id: point.meeting_id } };
}

/** One vote per (point, participant): update the latest row or create one. */
export async function recordVote(db: Db, pointId: number, participantId: number, vote: VoteValue): Promise<void> {
    const existing = await db.meetings_votes.findFirst({
        where: { point_id: pointId, meetings_participant_id: participantId },
        orderBy: { id: 'desc' },
        select: { id: true },
    });
    if (existing) {
        await db.meetings_votes.update({ where: { id: existing.id }, data: { vote } });
    } else {
        await db.meetings_votes.create({ data: { point_id: pointId, meetings_participant_id: participantId, vote } });
    }
}

/** Tally for a point; if legacy duplicate rows exist, the latest row per participant counts. */
export async function tallyVotes(db: Db, pointId: number): Promise<VoteTally> {
    const rows = await db.meetings_votes.findMany({
        where: { point_id: pointId },
        orderBy: { id: 'asc' },
        select: { meetings_participant_id: true, vote: true },
    });
    const latest = new Map<number, string>();
    for (const r of rows) latest.set(r.meetings_participant_id, r.vote);
    const results = { oui: 0, non: 0, neutre: 0 };
    for (const v of latest.values()) {
        if (v === 'OUI') results.oui++;
        else if (v === 'NON') results.non++;
        else if (v === 'NEUTRE') results.neutre++;
    }
    return { results, total: results.oui + results.non + results.neutre };
}
