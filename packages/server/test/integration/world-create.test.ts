import { afterEach, describe, expect, it } from 'vitest';
import {
    createTestApp,
    loginAs,
    type TestApp,
} from '../harness/app.js';

/**
 * Weltanlage mit allen Einstellungen (plans/20-nacharbeiten/20-4).
 */

let api: TestApp | null = null;
afterEach(async () => {
    await api?.dispose();
    api = null;
});

async function asAdmin() {
    api = await createTestApp();
    // Der erste Account ist Admin (19-8).
    const { cookie } = await loginAs(api, 'Verwalter');
    const create = (settings: Record<string, unknown>) =>
        api!.app.inject({
            method: 'POST',
            url: '/api/worlds',
            headers: { cookie },
            payload: { name: 'Neu', settings },
        });
    return { create };
}

describe('POST /api/worlds', () => {
    it('übernimmt Kartengröße, Bots, Besiedlung und Optionen', async () => {
        const { create } = await asAdmin();
        const res = await create({
            mapSize: 200,
            botCount: 2,
            barbarianCount: 5,
            settlementDensity: 0.05,
            barbariansPerSettler: 1,
            archers: false,
            paladin: false,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            settings: {
                mapSize: 200,
                botCount: 2,
                barbarianCount: 5,
                settlementDensity: 0.05,
                barbariansPerSettler: 1,
                archers: false,
                paladin: false,
            },
        });
    });

    it('lehnt eine zu dichte Welt verständlich ab statt mit 500', async () => {
        const { create } = await asAdmin();
        const res = await create({
            mapSize: 20,
            botCount: 500,
            barbarianCount: 5000,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'world_too_dense' });
    });

    it('lehnt Werte außerhalb der Grenzen ab', async () => {
        const { create } = await asAdmin();
        const res = await create({ settlementDensity: 0.9 });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'invalid_input' });
    });
});
