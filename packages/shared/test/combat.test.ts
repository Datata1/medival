import { describe, expect, it } from 'vitest';
import {
    CATAPULTS_PER_LEVEL,
    catapultDamage,
    createRng,
    Duration,
    isScoutMission,
    ramDamage,
    resolveBattle,
    resolveSpying,
    spyTier,
    travelTime,
} from '../src/index.js';

const rng = () => createRng(42);

describe('resolveBattle', () => {
    it('overwhelming attack wins with minimal losses', () => {
        const r = resolveBattle({
            attacker: { axe: 500, light_cavalry: 100 },
            defender: { spear: 10 },
            wallLevel: 0,
            loyalty: 100,
            rng: rng(),
        });
        expect(r.attackerWon).toBe(true);
        expect(r.defenderSurvivors.spear ?? 0).toBe(0);
        expect(
            (r.attackerLosses.axe ?? 0) +
                (r.attackerLosses.light_cavalry ?? 0),
        ).toBeLessThan(20);
    });

    it('strong defense annihilates a small raid', () => {
        const r = resolveBattle({
            attacker: { axe: 20 },
            defender: { spear: 300, sword: 300 },
            wallLevel: 10,
            loyalty: 100,
            rng: rng(),
        });
        expect(r.attackerWon).toBe(false);
        expect(r.attackerSurvivors.axe ?? 0).toBe(0);
        expect(r.defenderLosses.spear ?? 0).toBeLessThan(10);
    });

    it('cavalry attacks are countered by anti-cavalry defense', () => {
        const vsSpears = resolveBattle({
            attacker: { light_cavalry: 100 },
            defender: { spear: 400 },
            wallLevel: 0,
            loyalty: 100,
            rng: rng(),
        });
        const vsSwords = resolveBattle({
            attacker: { light_cavalry: 100 },
            defender: { sword: 400 },
            wallLevel: 0,
            loyalty: 100,
            rng: rng(),
        });
        // Spears defend far better against cavalry than swords do.
        expect(vsSpears.attackerWon).toBe(false);
        expect(vsSwords.attackerWon).toBe(true);
    });

    it('the wall defends an empty village against tiny attacks', () => {
        const r = resolveBattle({
            attacker: { spear: 1 },
            defender: {},
            wallLevel: 5,
            loyalty: 100,
            rng: rng(),
        });
        expect(r.attackerWon).toBe(false);
    });

    it('rams reduce the wall on a won attack', () => {
        const r = resolveBattle({
            attacker: { axe: 1000, ram: 40 },
            defender: { spear: 50 },
            wallLevel: 10,
            loyalty: 100,
            rng: rng(),
        });
        expect(r.attackerWon).toBe(true);
        expect(r.wallLevelAfter).toBe(0);
    });

    it('ramDamage caps at wall level', () => {
        expect(ramDamage(400, 5)).toBe(5);
        expect(ramDamage(0, 5)).toBe(0);
        expect(ramDamage(7, 5)).toBe(1);
    });

    it('a surviving noble on a winning attack deals 20-35 loyalty damage', () => {
        const r = resolveBattle({
            attacker: { axe: 2000, noble: 1 },
            defender: { spear: 20 },
            wallLevel: 0,
            loyalty: 100,
            rng: rng(),
        });
        expect(r.attackerWon).toBe(true);
        expect(r.loyaltyDamage).toBeGreaterThanOrEqual(20);
        expect(r.loyaltyDamage).toBeLessThanOrEqual(35);
    });

    it('multiple surviving nobles stack loyalty damage', () => {
        const r = resolveBattle({
            attacker: { axe: 2000, noble: 4 },
            defender: { spear: 20 },
            wallLevel: 0,
            loyalty: 100,
            rng: rng(),
        });
        expect(r.attackerWon).toBe(true);
        expect(r.loyaltyDamage).toBeGreaterThanOrEqual(4 * 20);
        expect(r.loyaltyDamage).toBeLessThanOrEqual(4 * 35);
    });

    it('no loyalty damage when the noble dies', () => {
        const r = resolveBattle({
            attacker: { noble: 1 },
            defender: { sword: 500 },
            wallLevel: 20,
            loyalty: 100,
            rng: rng(),
        });
        expect(r.attackerWon).toBe(false);
        expect(r.loyaltyDamage).toBe(0);
    });

    it('is deterministic for the same rng seed', () => {
        const input = {
            attacker: { axe: 100, light_cavalry: 30 },
            defender: { spear: 80, sword: 60 },
            wallLevel: 5,
            loyalty: 100,
        };
        const a = resolveBattle({ ...input, rng: createRng(7) });
        const b = resolveBattle({ ...input, rng: createRng(7) });
        expect(a).toEqual(b);
    });
});

describe('travel', () => {
    it('scales with distance and slowest unit', () => {
        // 10 fields, spear (18 min/field) at unitSpeed 1 = 180 min
        const t = travelTime(
            0,
            0,
            10,
            0,
            { spear: 5, light_cavalry: 5 },
            1,
        );
        expect(t).toBe(Duration.minutes(180));
        // unitSpeed 30 divides it
        expect(travelTime(0, 0, 10, 0, { spear: 5 }, 30)).toBe(
            Duration.minutes(180) / 30,
        );
    });
});

describe('Spähkampf (19-10)', () => {
    const fixed = () => 0.99; // rundet Bruchteile immer ab

    it('ohne gegnerische Späher fällt niemand und alles wird gesehen', () => {
        expect(resolveSpying(10, 0, fixed)).toEqual({
            lost: 0,
            survivors: 10,
            tier: 3,
        });
    });

    it('bei Gleichstand fällt die Hälfte, bei doppelter Übermacht alle', () => {
        expect(resolveSpying(10, 10, fixed)).toMatchObject({
            lost: 5,
            tier: 2,
        });
        expect(resolveSpying(5, 10, fixed)).toMatchObject({
            lost: 5,
            survivors: 0,
            tier: 0,
        });
    });

    it('stuft nach dem Anteil der Überlebenden ab', () => {
        expect(spyTier(0, 10)).toBe(0);
        expect(spyTier(1, 10)).toBe(1);
        expect(spyTier(5, 10)).toBe(2);
        expect(spyTier(7, 10)).toBe(3);
    });

    it('erkennt reine Spähtrupps', () => {
        expect(isScoutMission({ spy: 3 })).toBe(true);
        expect(isScoutMission({ spy: 3, axe: 1 })).toBe(false);
        expect(isScoutMission({})).toBe(false);
    });

    it('Späher greifen nicht an', () => {
        const r = resolveBattle({
            attacker: { spy: 50 },
            defender: { spear: 1 },
            wallLevel: 0,
            loyalty: 100,
            rng: () => 0.5,
        });
        expect(r.attackerWon).toBe(false);
    });
});

describe('Katapulte (19-11)', () => {
    it('senken Stufe für Stufe nach der Tabelle', () => {
        // Stufe 3 → 2 kostet 2, 2 → 1 kostet 2, 1 → 0 kostet 2.
        expect(catapultDamage(6, 'barracks', 3, true)).toBe(0);
        expect(catapultDamage(5, 'barracks', 3, true)).toBe(1);
        expect(catapultDamage(1, 'barracks', 3, true)).toBe(3);
        expect(CATAPULTS_PER_LEVEL).toHaveLength(30);
    });

    it('lassen Hauptgebäude, Bauernhof und Speicher auf Stufe 1', () => {
        expect(catapultDamage(500, 'headquarters', 5, true)).toBe(1);
        expect(catapultDamage(500, 'farm', 5, true)).toBe(1);
        expect(catapultDamage(500, 'barracks', 5, true)).toBe(0);
    });

    it('wirken bei verlorenem Kampf nur zur Hälfte', () => {
        expect(catapultDamage(4, 'barracks', 3, false)).toBe(2);
        expect(catapultDamage(4, 'barracks', 3, true)).toBe(1);
    });
});
