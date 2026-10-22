import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    Duration,
    type DurationLike,
    GameTime,
    type WorldSettings,
} from '@medival/shared';
import type { World } from '../../src/engine/world.js';
import { WorldManager } from '../../src/engine/worldManager.js';

/**
 * Testwelten, die so ablaufen wie der echte Server
 * (plans/19-prototyp/19-1-integrationstest-harness.md).
 *
 * Der Unterschied zu `clock.skip(1h)` + `processDue()`: Die Uhr springt
 * nicht ans Ende des Zeitraums, sondern läuft von Fälligkeit zu Fälligkeit.
 * In jedem Handler gilt damit `world.now() === event.dueGameTime` — genau
 * wie im Betrieb bei pünktlichem Timer —, und kein Event bleibt hinter
 * einem Batch-Abbruch liegen.
 */

/**
 * Kleine, ruhige Welt: keine Bots, keine Barbaren, fester Seed. Was ein
 * Test braucht, legt er mit `given*` an; so hängt kein Test von der
 * zufälligen Lage der Kartendörfer ab.
 */
export const QUIET_SETTINGS = {
    speed: 100,
    unitSpeed: 100,
    mapSize: 40,
    botCount: 0,
    barbarianCount: 0,
    barbarianAttemptsPerHour: 0,
    seed: 4242,
} as const satisfies Partial<WorldSettings>;

export interface TestWorld {
    world: World;
    manager: WorldManager;
    dir: string;
    /** Schließt die Welt und löscht das Verzeichnis. Mehrfach aufrufbar. */
    dispose(): void;
}

export function createTestWorld(
    settings: Partial<WorldSettings> = {},
    name = 'Testwelt',
): TestWorld {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medival-it-'));
    const manager = new WorldManager(dir);
    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        manager.shutdown();
        fs.rmSync(dir, { recursive: true, force: true });
    };
    try {
        // Pausiert angelegt: Kein echter Timer, und die Uhr steht exakt auf
        // 0 — Zeit vergeht ausschließlich über `advance*`. Erst anlegen und
        // dann pausieren ließ die Uhr ein paar Millisekunden laufen, je nach
        // Last unterschiedlich viele.
        const world = manager.createWorld(
            name,
            { ...QUIET_SETTINGS, ...settings },
            { paused: true },
        );
        return { world, manager, dir, dispose };
    } catch (error) {
        dispose();
        throw error;
    }
}

/**
 * Lässt die Welt bis `target` laufen, Event für Event. Liefert die Zahl
 * der verarbeiteten Events.
 */
export function advanceTo(world: World, target: GameTime): number {
    let count = 0;
    for (;;) {
        const next = world.scheduler.nextDue();
        if (next === null || next > target) break;
        if (next > world.clock.now()) world.clock.setTo(next);
        count += world.scheduler.drainUntil(next);
    }
    if (target > world.clock.now()) world.clock.setTo(target);
    return count;
}

/**
 * `n` Spielwochen: 168 Spielstunden bei Speed 1, bei Speed 100 also 1,68
 * Stunden Echtzeit. Die Wochentests vor 19-4 spulten 168 *Echt*stunden vor
 * — bei Speed 100 rund 700 Spielwochen, von denen sie nur einen Bruchteil
 * tatsächlich abarbeiteten.
 */
export function gameWeeks(world: World, n: number): Duration {
    return Duration.hours((168 * n) / world.settings.speed);
}

/** Lässt die Welt um `d` weiterlaufen. */
export function advance(world: World, d: DurationLike): number {
    return advanceTo(world, GameTime.add(world.now(), d));
}

/**
 * Wie `advance`, aber in `slices` Scheiben mit einem Event-Loop-Durchlauf
 * dazwischen. Das Ergebnis ist dasselbe — die Welt läuft Event für Event,
 * nur in Etappen.
 *
 * Für lange Simulationen: Ein Vitest-Worker, der über 60 s am Stück
 * synchron rechnet, kann seine Statusmeldungen nicht zustellen und bricht
 * mit „Timeout calling onTaskUpdate" ab, obwohl jeder Test grün ist. Auf dem
 * CI-Runner rechnen die Wochensimulationen drei- bis viermal so lange wie
 * auf einem Laptop.
 */
export async function advanceYielding(
    world: World,
    d: DurationLike,
    slices = 24,
): Promise<number> {
    const target = GameTime.add(world.now(), d);
    const start = world.now();
    let count = 0;
    for (let i = 1; i <= slices; i++) {
        const step = GameTime.of(
            start + ((target - start) * i) / slices,
        );
        count += advanceTo(world, step);
        await new Promise((resolve) => setImmediate(resolve));
    }
    return count;
}

/**
 * Läuft, bis `predicate` zutrifft — geprüft nach jeder Fälligkeit —, höchstens
 * aber `max`. Liefert, ob die Bedingung erreicht wurde; die Uhr steht dann
 * auf dem Zeitpunkt, an dem sie erstmals galt.
 */
export function advanceUntil(
    world: World,
    predicate: () => boolean,
    max: Duration,
): boolean {
    const limit = GameTime.add(world.now(), max);
    if (predicate()) return true;
    for (;;) {
        const next = world.scheduler.nextDue();
        if (next === null || next > limit) {
            advanceTo(world, limit);
            return predicate();
        }
        advanceTo(world, next);
        if (predicate()) return true;
    }
}
