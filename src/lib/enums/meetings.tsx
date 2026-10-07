export enum MeetingType {
    ORDINAIRE = 'ORDINAIRE',
    EXTRAORDINAIRE = 'EXTRAORDINAIRE',
    COMPLEMENTAIRE = 'COMPLEMENTAIRE',
    DELEGUES = 'DELEGUES',
}

export enum MeetingStatus {
    SCHEDULED = 'SCHEDULED',
    CANCELLED = 'CANCELLED',
    STARTED = 'STARTED',
    FINISHED = 'FINISHED',
}

export enum MeetingDuration {
    ONE_HOUR = 'ONE_HOUR',
    TWO_HOURS = 'TWO_HOURS',
    THREE_HOURS = 'THREE_HOURS',
    FOUR_HOURS = 'FOUR_HOURS',
    FIVE_HOURS = 'FIVE_HOURS',
}

export enum MeetingMode {
    IN_PERSON = 'IN_PERSON',
    ONLINE = 'ONLINE',
    HYBRID = 'HYBRID',
}

export enum MeetingIsOnline {
    TRUE = 'TRUE',
    FALSE = 'FALSE',
}

export enum MeetingPointTypes {
    SIMPLE = 'SIMPLE',
    VOTE = 'VOTE',
}

export enum MeetingInvitationsResponseStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
}

export enum MeetingAttendanceStatus {
    PRESENT = 'PRESENT',
    ABSENT = 'ABSENT',
}

export enum MeetingVoteResponse {
    OUI = 'OUI',
    NON = 'NON',
    NEUTRE = 'NEUTRE',
}

export enum MeetingTurnRequestStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
    FINISHED = 'FINISHED',
}
