import { MeetingType, MeetingMode, MeetingDuration, MeetingIsOnline, MeetingStatus, MeetingPointTypes, MeetingInvitationsResponseStatus, MeetingAttendanceStatus, MeetingVoteResponse, MeetingTurnRequestStatus } from '@/lib/enums/meetings';

export interface Meeting {
    id: number;
    subject: string;
    type: MeetingType;
    date: string;
    time: string;
    mode: MeetingMode;
    location: string;
    duration: MeetingDuration;
    description: string;
    isonline: MeetingIsOnline;
    status: MeetingStatus;
    creator_id: number;
    created_at: string;
    editor_id: number;
    updated_at: string;
    company_id: number;
}

export interface MeetingPoint {
    id: number;
    point: string;
    description: string | null;
    type: MeetingPointTypes;
    meeting_id: number;
    parent_id: number | null;
    meetings_votes?: MeetingVote[];
}

export interface MeetingDocument {
    id: number;
    meeting_id: number;
    file_title: string;
    file_path: string;
}

export interface MeetingParticipant {
    id: number;
    email: string;
    meeting_id: number;
    token: string;
}

export interface MeetingInvitation {
    id: number;
    meeting_id: number;
    meetings_participant_id: number;
    meetings_invitation_date: string;
    status: MeetingInvitationsResponseStatus;
}

export interface MeetingAttendance {
    id: number;
    meeting_id: number;
    meetings_participant_id: number;
    meetings_attendances_status: MeetingAttendanceStatus;
}

export interface MeetingVote {
    id: number;
    point_id: number;
    meetings_participant_id: number;
    vote: MeetingVoteResponse;
}

export interface MeetingTurnRequest {
    id: number;
    meeting_id: number;
    meetings_participant_id: number;
    status: MeetingTurnRequestStatus;
    created_at: string;
}
