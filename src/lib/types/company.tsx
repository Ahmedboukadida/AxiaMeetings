import { MeetingDuration } from '../enums/meetings';

export interface Company {
    id: number;
    name: string;
    logo_url: string;
    url: string;
    database_schema: string | null;
    // Required: login endpoint for admin account linking
    login_endpoint_id: number | null;
    // Required for user import
    users_endpoint_id: number | null;
    // Optional service endpoints
    have_notifications_service: boolean;
    notifications_service_endpoint_id: number | null;
    have_messages_service: boolean;
    messages_service_endpoint_id: number | null;
    have_sms_service: boolean;
    sms_service_endpoint_id: number | null;
    mail_is_active: boolean;
    have_mail_service: boolean;
    push_mails_endpoint_id: number | null;
    meeting_time_limit: MeetingDuration | null;
    users_number_limit: number | null;
    ai_is_active: boolean;
}

export interface CompanyApi {
    id: number;
    endpoint: string;
    method: string;
    payload_example: any;
    response_example: any;
    company_id: number;
    company?: { id: number; name: string };
    formated_responses?: FormatedResponse[];
}

export interface FormatedResponse {
    id: number;
    endpoint_id: number;
    response_key: string;
    formated_response_key: string;
    format_for: 'PAYLOAD' | 'RESPONSE';
}

export interface CompanyAdminLogin {
    id: number;
    username: string | null;
    token_id: string | null;
    user_id: number;
    company_id: number;
}
