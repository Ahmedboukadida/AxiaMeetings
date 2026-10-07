export interface AppSettings {
    id: number;
    email: string;
    /** Never returned by GET /api/configurations; only email_password_set is. */
    email_password?: string;
    email_password_set?: boolean;
    host: string;
    port: number;
    ssl: boolean;
    from_email: string;
    from_name: string;
    logo_file_name?: string | null;
    favicon_file_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    contact_adress?: string | null;
    facebook?: string | null;
    linkedin?: string | null;
    tiktok?: string | null;
    term_of_use?: string | null;
    privacy_policy?: string | null;
}

export interface Newsletter {
    id: number;
    email: string;
    created_at: string;
}

export interface Reference {
    id: number;
    name: string;
    logo_file_name: string;
    website: string;
}

export interface Pack {
    id: number;
    name: string;
    price_month: number;
    price_year: number;
    packs_lines: PackLine[];
}

export interface PackLine {
    id: number;
    pack_id: number;
    title: string;
}

export interface Log {
    id: number;
    message: string;
    timestamp: string;
    request: any;
    payload: any;
    response: any;
    user_id: number;
    user: {
        fullname: string | null;
        username: string | null;
        email: string | null;
        role: string | null;
    };
    company_id: number | null;
    company?: {
        name: string;
    } | null;
}

export interface OverviewStats {
    companies: number;
    meetings: number;
    users: number;
    apis: number;
    admins: number;
    logs: number;
    aiWorkers?: number;
    meetingsByStatus?: Record<string, number>;
    meetingsByType?: Record<string, number>;
    trendData?: { name: string; meetings: number }[];
    usersByRole?: Record<string, number>;
    apisByMethod?: Record<string, number>;
    logsActivity?: { name: string; activity: number }[];
    topCompanies?: {
        id: number;
        name: string;
        logo_url: string | null;
        url: string;
        users: number;
    }[];
    meetingDates?: string[];
    devStats?: {
        signups: { total: number; pending: number };
        contacts: { total: number; pending: number };
        aiKeys: { total: number; active: number };
        aiUsage: { total: number; success: number; successRate: number };
        chats: { total: number; open: number };
    } | null;
    recentMeetings?: {
        id: number;
        subject: string;
        date: string;
        time: string;
        type: string;
        status: string;
    }[];
    calendarMeetings?: {
        id: number;
        subject: string;
        date: string;
        time: string;
        status: string;
        company?: { name: string } | null;
    }[];
    recentLogs?: {
        id: number;
        message: string;
        timestamp: string;
        user?: {
            fullname: string | null;
            username: string | null;
        } | null;
        company?: {
            name: string;
        } | null;
    }[];
    recentSignups?: {
        id: number;
        fullname: string;
        email: string;
        company_name: string;
        pack_id: number;
        created_at: string;
    }[];
    recentContacts?: {
        id: number;
        sender_name: string | null;
        sender_email: string;
        subject: string;
        created_at: string;
    }[];
    aiFeatureUsage?: {
        name: string;
        value: number;
    }[];
    aiUsageTrend?: {
        name: string;
        success: number;
        failed: number;
    }[];
}
