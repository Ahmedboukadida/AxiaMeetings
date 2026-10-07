export * from './user';
export * from './company';
export * from './meeting';
export * from './appConfig';

// Generic API response wrapper
export interface ApiResponse<T> {
    status: boolean;
    message?: string;
    data?: T;
    pagination?: {
        total: number;
        limit: number;
        offset: number;
    };
}
