import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const isRedisEnabled = typeof window === 'undefined' && !!REDIS_URL && REDIS_URL !== 'none' && process.env.REDIS_ENABLED !== 'false';

// One Redis connection per process: cached on globalThis so a second bundled
// copy of this module reuses it instead of opening another connection.
type RedisState = { client: Redis | null; connected: boolean; warningLogged: boolean };
const redisGlobal = globalThis as typeof globalThis & { __axiaRedis?: RedisState };
const state: RedisState = redisGlobal.__axiaRedis ?? (redisGlobal.__axiaRedis = createRedisState());

function createRedisState(): RedisState {
    const st: RedisState = { client: null, connected: false, warningLogged: false };
    if (!isRedisEnabled) return st;
    try {
        const redisClient = new Redis(REDIS_URL!, {
            maxRetriesPerRequest: 1, // Fail fast so it fallback to DB immediately
            connectTimeout: 2000,
            retryStrategy(times) {
                // Retry every 10 seconds, but do not block app startup
                return Math.min(times * 1000, 10000);
            }
        });

        redisClient.on('connect', () => {
            st.connected = true;
            st.warningLogged = false;
            console.log('✅ Connected to Redis cache layer.');
        });

        redisClient.on('error', () => {
            st.connected = false;
            if (!st.warningLogged) {
                console.warn('⚠️ Redis offline. Caching & rate limiting falling back to local memory / database.');
                st.warningLogged = true;
            }
        });

        redisClient.on('end', () => {
            st.connected = false;
        });
        st.client = redisClient;
    } catch (e) {
        // Never log the error object/URL: REDIS_URL carries the password.
        console.error('Failed to initialize Redis client:', e instanceof Error ? e.name : 'unknown error');
    }
    return st;
}

export const redis = state.client;

/**
 * Robust get-or-set caching wrapper utility.
 * Automatically falls back to fetching directly from DB/API if Redis is offline.
 */
export async function getOrSetCache<T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>
): Promise<T> {
    if (!redis || !state.connected) {
        return fetchFn();
    }
    try {
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached) as T;
        }
        const data = await fetchFn();
        if (data !== undefined && data !== null) {
            await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
        }
        return data;
    } catch (err) {
        console.error(`Redis cache error for key "${key}":`, err);
        return fetchFn();
    }
}

/**
 * Check if the Redis cache is actively connected.
 */
export function isCacheConnected(): boolean {
    return state.connected;
}
