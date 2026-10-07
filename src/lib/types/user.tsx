import { UserRole } from '@/lib/enums/users';

export interface LoginUser {
    username: string;
    password: string;
}

export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (loginUser: LoginUser) => Promise<void>;
    logout: () => void;
    loading: boolean;
}

export interface User {
    id: number;
    fullname: string | null;
    email: string | null;
    username: string | null;
    role: UserRole | null;
    company_id: number | null;
    phone?: string | null;
    identifiant_extern?: number | null;
    ai_is_active?: boolean;
    meeting_time_limit?: string | null;
    users_number_limit?: number | null;
}
