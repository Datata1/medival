import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duration, type Units } from '@medival/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    decideFounding,
    decideInvitation,
} from '../src/ai/decide/diplomacy.js';
import {
    type AttackTarget,
    decideAttack,
    decideSupport,
    requiredMargin,
} from '../src/ai/decide/military.js';
import {
    acceptInvitation,
    foundTribe,
    invitePlayer,
    leaveTribe,
    sameTribe,
    tribeInfo,
    tribeOf,
} from '../src/engine/tribes.js';
import type { World } from '../src/engine/world.js';
import { WorldManager } from '../src/engine/worldManager.js';

// ── Militärische Entscheidung: pure, ohne Datenbank ───────────────────

const ARMY: Units = { axe: 200, light_cavalry: 50 };
const HOME = { x: 20, y: 20, units: ARMY };

function target(patch: Partial<AttackTarget> = {}): AttackTarget {
    return {
        villageId: 5,
        ownerId: 2,
        x: 25,
        y: 20,
        points: 500,
        standing: -60, // feindlich
        estimatedDefense: { spear: 20, sword: 10 },
        estimatedWall: 2,
        ...patch,
    };
}

describe('Angriffsentscheidung (pure)', () => {
    it('greift Neutrale und Misstrauische niemals an', () => {
        for (const standing of [-39, -10, 0, 30, 80]) {
            expect(
                decideAttack(
                    HOME,
                    [
                        target({
                            standing,
                            estimatedDefense: {},
                            estimatedWall: 0,
                        }),
                    ],
                    'raider',
                ),
            ).toBeNull();
        }
    });

    it('greift Feindliche mit Übermacht an', () => {
        const plan = decideAttack(
            HOME,
            [target({ standing: -60 })],
            'balanced',
        );
        expect(plan?.kind).toBe('attack');
        expect(plan?.targetVillageId).toBe(5);
    });

    it('greift bei gleichwertiger Verteidigung nicht an', () => {
        const plan = decideAttack(
            HOME,
            [
                target({
                    estimatedDefense: { spear: 3000, sword: 2000 },
                    estimatedWall: 20,
                }),
            ],
            'raider',
        );
        expect(plan).toBeNull();
    });

    it('raider greift bei knapperem Verhältnis an als turtle', () => {
        // Messbar, nicht behauptet: die geforderte Deutlichkeit selbst.
        expect(requiredMargin('raider')).toBeLessThan(
            requiredMargin('balanced'),
        );
        expect(requiredMargin('balanced')).toBeLessThan(
            requiredMargin('turtle'),
        );

        // Und in der Wirkung: eine Verteidigung, bei der nur raider zuschlägt.
        const defense = { spear: 220, sword: 120 };
        const contested = [
            target({ estimatedDefense: defense, estimatedWall: 3 }),
        ];
        const byRaider = decideAttack(HOME, contested, 'raider');
        const byTurtle = decideAttack(HOME, contested, 'turtle');
        expect(byRaider === null && byTurtle !== null).toBe(false);
    });

    it('schickt keine Verteidiger mit', () => {
        const plan = decideAttack(
            { ...HOME, units: { axe: 200, spear: 500 } },
            [target()],
            'balanced',
        );
        expect(plan?.units.spear).toBeUndefined();
        expect(plan?.units.axe).toBeGreaterThan(0);
    });

    it('lässt einen Teil der Truppen zu Hause', () => {
        const plan = decideAttack(HOME, [target()], 'balanced');
        expect(plan?.units.axe).toBeLessThan(200);
    });

    it('tut nichts ohne Truppen', () => {
        expect(
            decideAttack({ ...HOME, units: {} }, [target()], 'raider'),
        ).toBeNull();
    });

    it('bevorzugt das nähere von zwei gleichwertigen Zielen', () => {
        const plan = decideAttack(
            HOME,
            [
                target({ villageId: 5, x: 60, y: 20 }),
                target({ villageId: 6, x: 23, y: 20 }),
            ],
            'balanced',
        );
        expect(plan?.targetVillageId).toBe(6);
    });
});

describe('Unterstützungsentscheidung (pure)', () => {
    const DEFENDERS = {
        x: 20,
        y: 20,
        units: { spear: 200, sword: 100 },
    };

    it('hilft, wenn die Truppen rechtzeitig ankommen', () => {
        const plan = decideSupport(
            DEFENDERS,
            [
                {
                    villageId: 9,
                    x: 22,
                    y: 20,
                    arrivalGameTime: Duration.hours(10),
                },
            ],
            0,
            100,
        );
        expect(plan?.targetVillageId).toBe(9);
    });

    it('hilft NICHT, wenn sie zu spät kämen', () => {
        // Der Fall knapp darunter: Unterstützung, die zu spät kommt, ist
        // verschenkte Verteidigung und sieht trotzdem wie Hilfe aus.
        const plan = decideSupport(
            DEFENDERS,
            [
                {
                    villageId: 9,
                    x: 22,
                    y: 20,
                    arrivalGameTime: 1000, // eine Sekunde
                },
            ],
            0,
            100,
        );
        expect(plan).toBeNull();
    });

    it('schickt keine Angreifer als Verteidigung', () => {
        const plan = decideSupport(
            { ...DEFENDERS, units: { spear: 100, axe: 300 } },
            [
                {
                    villageId: 9,
                    x: 21,
                    y: 20,
                    arrivalGameTime: Duration.hours(10),
                },
            ],
            0,
            100,
        );
        expect(plan?.units.axe).toBeUndefined();
        expect(plan?.units.spear).toBeGreaterThan(0);
    });

    it('nimmt den dringendsten Ruf zuerst', () => {
        const plan = decideSupport(
            DEFENDERS,
            [
                {
                    villageId: 8,
                    x: 21,
                    y: 20,
                    arrivalGameTime: Duration.hours(20),
                },
                {
                    villageId: 9,
                    x: 21,
                    y: 20,
                    arrivalGameTime: Duration.hours(8),
                },
            ],
            0,
            100,
        );
        expect(plan?.targetVillageId).toBe(9);
    });
});

describe('Diplomatie-Entscheidung (pure)', () => {
    it('nimmt eine Einladung ab „freundlich" an', () => {
        expect(
            decideInvitation(
                [{ tribeId: 3, inviterId: 2, standing: 40 }],
                false,
            ),
        ).toBe(3);
    });

    it('nimmt unterhalb von „freundlich" nicht an', () => {
        for (const standing of [-50, 0, 10, 24]) {
            expect(
                decideInvitation(
                    [{ tribeId: 3, inviterId: 2, standing }],
                    false,
                ),
            ).toBeNull();
        }
    });

    it('nimmt nicht an, wer schon in einem Stamm ist', () => {
        expect(
            decideInvitation(
                [{ tribeId: 3, inviterId: 2, standing: 90 }],
                true,
            ),
        ).toBeNull();
    });

    it('wählt die Einladung mit der besten Haltung', () => {
        expect(
            decideInvitation(
                [
                    { tribeId: 3, inviterId: 2, standing: 30 },
                    { tribeId: 4, inviterId: 5, standing: 70 },
                ],
                false,
            ),
        ).toBe(4);
    });

    it('gründet nur bei gegenseitig hoher Bewertung', () => {
        const base = {
            playerId: 7,
            distance: 5,
            inTribe: false,
        };
        // Einseitige Zuneigung reicht nicht — Ansehen ist asymmetrisch.
        expect(
            decideFounding(
                [{ ...base, standing: 80, theirStanding: 5 }],
                false,
                0,
            ),
        ).toBeNull();
        expect(
            decideFounding(
                [{ ...base, standing: 5, theirStanding: 80 }],
                false,
                0,
            ),
        ).toBeNull();
        expect(
            decideFounding(
                [{ ...base, standing: 60, theirStanding: 60 }],
                false,
                0,
            ),
        ).toBe(7);
    });

    it('gründet selten — der Wurf muss gelingen', () => {
        const candidate = {
            playerId: 7,
            standing: 80,
            theirStanding: 80,
            distance: 5,
            inTribe: false,
        };
        expect(decideFounding([candidate], false, 0.9)).toBeNull();
        expect(decideFounding([candidate], false, 0.01)).toBe(7);
    });

    it('gründet nicht mit jemandem, der schon gebunden ist', () => {
        expect(
            decideFounding(
                [
                    {
                        playerId: 7,
                        standing: 90,
                        theirStanding: 90,
                        distance: 3,
                        inTribe: true,
                    },
                ],
                false,
                0,
            ),
        ).toBeNull();
    });
});

// ── Stammes-Kommandos in der Engine ───────────────────────────────────

describe('Stämme', () => {
    let dir: string;
    let manager: WorldManager;
    let world: World;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-tribe-'));
        manager = new WorldManager(dir);
        world = manager.createWorld('Stammeswelt', {
            speed: 100,
            unitSpeed: 100,
            mapSize: 50,
            botCount: 3,
            barbarianCount: 2,
            seed: 4242,
            barbarianAttemptsPerHour: 0,
        });
    });

    afterEach(() => {
        manager.shutdown();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('gründet einen Stamm und macht den Gründer zum Mitglied', () => {
        const id = foundTribe(world, 1, 'Die Eichen', 'eic');
        expect(tribeOf(world, 1)).toBe(id);
        const info = tribeInfo(world, id);
        // Das Kürzel wird großgeschrieben — es steht später auf der Karte.
        expect(info?.tag).toBe('EIC');
        expect(info?.members.map((m) => m.id)).toEqual([1]);
    });

    it('lehnt einen zweiten Stamm ab', () => {
        foundTribe(world, 1, 'Erster', 'A');
        expect(() => foundTribe(world, 1, 'Zweiter', 'B')).toThrow(
            'already_in_tribe',
        );
    });

    it('verlangt Name und Kürzel', () => {
        expect(() => foundTribe(world, 1, '  ', 'A')).toThrow(
            'tribe_name_required',
        );
        expect(() => foundTribe(world, 1, 'Name', '  ')).toThrow(
            'tribe_tag_required',
        );
    });

    it('lädt ein und nimmt an', () => {
        const id = foundTribe(world, 1, 'Die Eichen', 'EIC');
        invitePlayer(world, 1, 2);
        acceptInvitation(world, 2, id);
        expect(tribeOf(world, 2)).toBe(id);
        expect(sameTribe(world, 1, 2)).toBe(true);
    });

    it('nimmt ohne Einladung nicht an', () => {
        const id = foundTribe(world, 1, 'Die Eichen', 'EIC');
        expect(() => acceptInvitation(world, 2, id)).toThrow(
            'no_invitation',
        );
    });

    it('lässt abgelaufene Einladungen verfallen', () => {
        const id = foundTribe(world, 1, 'Die Eichen', 'EIC');
        invitePlayer(world, 1, 2);
        // Ohne Ablauf träte ein Bot bei, der vor Wochen freundlich war.
        world.clock.skip(Duration.hours(25));
        expect(() => acceptInvitation(world, 2, id)).toThrow(
            'no_invitation',
        );
    });

    it('räumt den Stamm ab, wenn der Letzte geht', () => {
        const id = foundTribe(world, 1, 'Die Eichen', 'EIC');
        leaveTribe(world, 1);
        expect(tribeOf(world, 1)).toBeNull();
        // Kein Stamm ohne Mitglieder — sonst zeigen Einladungen ins Leere.
        expect(tribeInfo(world, id)).toBeNull();
    });

    it('behält den Stamm, solange noch jemand drin ist', () => {
        const id = foundTribe(world, 1, 'Die Eichen', 'EIC');
        invitePlayer(world, 1, 2);
        acceptInvitation(world, 2, id);
        leaveTribe(world, 1);
        expect(tribeInfo(world, id)?.members.map((m) => m.id)).toEqual([
            2,
        ]);
    });

    it('hebt das Ansehen zwischen Stammesbrüdern', () => {
        const before = world.effectiveStanding(2, 1);
        const id = foundTribe(world, 1, 'Die Eichen', 'EIC');
        invitePlayer(world, 1, 2);
        acceptInvitation(world, 2, id);
        expect(world.effectiveStanding(2, 1)).toBeGreaterThan(before);
    });

    it('senkt das Ansehen gegenüber fremden Stämmen', () => {
        foundTribe(world, 1, 'Die Eichen', 'EIC');
        const neutral = world.effectiveStanding(2, 1);
        foundTribe(world, 2, 'Die Wölfe', 'WLF');
        expect(world.effectiveStanding(2, 1)).toBeLessThan(neutral);
    });
});
