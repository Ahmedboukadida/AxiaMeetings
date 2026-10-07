import { Meeting, ApiResponse } from '@/lib/types';

const BASE = '/api';

export async function getMeetings(): Promise<ApiResponse<Meeting[]>> {
    const res = await fetch(`${BASE}/meetings`);
    return res.json();
}

export async function getMeeting(id: number): Promise<ApiResponse<Meeting>> {
    const res = await fetch(`${BASE}/meetings/${id}`);
    return res.json();
}

export async function createMeeting(data: any): Promise<ApiResponse<Meeting>> {
    const res = await fetch(`${BASE}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function updateMeeting(id: number, data: Partial<Meeting>): Promise<ApiResponse<Meeting>> {
    const res = await fetch(`${BASE}/meetings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function deleteMeeting(id: number): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/meetings/${id}`, { method: 'DELETE' });
    return res.json();
}

export async function respondToInvitation(meetingId: number, token: string, email: string, response: 'ACCEPTED' | 'REJECTED'): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/meetings/${meetingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, response }),
    });
    return res.json();
}

export async function submitVote(meetingId: number, pointId: number, participantId: number, vote: string): Promise<ApiResponse<null>> {
    const res = await fetch(`${BASE}/meetings/${meetingId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ point_id: pointId, meetings_participant_id: participantId, vote }),
    });
    return res.json();
}
