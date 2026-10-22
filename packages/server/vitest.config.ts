import { defineConfig } from 'vitest/config';

/**
 * Zwei Projekte (plans/19-prototyp/19-1): `unit` für schnelle Tests ohne
 * laufende Welt bzw. mit kleinen Welten, `integration` für Szenarien über
 * den Harness in `test/harness/` — Welten, die Event für Event ablaufen.
 */
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'unit',
                    include: ['test/**/*.test.ts'],
                    exclude: ['test/integration/**'],
                },
            },
            {
                test: {
                    name: 'integration',
                    include: ['test/integration/**/*.test.ts'],
                    testTimeout: 120_000,
                    hookTimeout: 120_000,
                },
            },
        ],
    },
});
