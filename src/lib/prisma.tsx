import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';

/**
 * One PrismaClient + one bounded pg.Pool per Node process.
 *
 * Both are cached on globalThis in EVERY environment (not only in dev), so a
 * second bundled copy of this module (another server chunk, HMR, a worker
 * that re-evaluates it) reuses the same pool instead of opening another one.
 *
 * Pool knobs (all optional, see .env.example):
 *   DB_POOL_MAX                  max connections of this pool          (default 10)
 *   DB_POOL_IDLE_TIMEOUT_MS      close idle connections after          (default 30000)
 *   DB_POOL_CONNECTION_TIMEOUT_MS fail instead of waiting forever for
 *                                a connection / the DB to answer       (default 10000)
 *   DB_STATEMENT_TIMEOUT_MS      server-side statement_timeout in ms   (default 0 = off;
 *                                leave off behind PgBouncer/Neon pooled URLs, which
 *                                reject it as a startup parameter)
 *
 * server.mjs (Socket.IO) keeps its own small pool (SOCKET_DB_POOL_MAX), so the
 * process uses at most DB_POOL_MAX + SOCKET_DB_POOL_MAX connections.
 */

function intEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function createPool(): Pool {
    const statementTimeout = intEnv('DB_STATEMENT_TIMEOUT_MS', 0);
    const config: PoolConfig = {
        connectionString: process.env.DATABASE_URL,
        max: Math.max(1, intEnv('DB_POOL_MAX', 10)),
        idleTimeoutMillis: intEnv('DB_POOL_IDLE_TIMEOUT_MS', 30_000),
        connectionTimeoutMillis: intEnv('DB_POOL_CONNECTION_TIMEOUT_MS', 10_000),
        keepAlive: true,
        ...(statementTimeout > 0 ? { statement_timeout: statementTimeout } : {}),
        application_name: 'axiameetings-app',
    };
    const pool = new Pool(config);
    // An idle client that loses its connection (DB restart, host sleep, network
    // blip) emits 'error' on the pool. Without a listener Node treats it as an
    // unhandled 'error' event and the whole process crashes.
    pool.on('error', (err) => {
        console.error('[db] idle pg client error:', err.message);
    });
    return pool;
}

type PrismaGlobal = typeof globalThis & {
    __axiaPrisma?: PrismaClient;
    __axiaPgPool?: Pool;
};

const g = globalThis as PrismaGlobal;

const pool = g.__axiaPgPool ?? (g.__axiaPgPool = createPool());

export const prisma: PrismaClient =
    g.__axiaPrisma ?? (g.__axiaPrisma = new PrismaClient({ adapter: new PrismaPg(pool) }));
