import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        // src/lib/auth.tsx throws at import time without JWT_SECRET.
        // DATABASE_URL is a dummy: unit tests mock '@/lib/prisma' and never touch a DB.
        env: {
            JWT_SECRET: 'test-secret',
            DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test_unused',
        },
        restoreMocks: true,
    },
});
