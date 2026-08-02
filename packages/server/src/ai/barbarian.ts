import { exponentialWait, GameTime, type Rng } from '@medival/shared';
import { asc, eq, isNull } from 'drizzle-orm';
import {
    buildQueue,
    events,
    recruitQueue,
    villages,
} from '../db/schema.js';
import { recruitUnits } from '../engine/military.js';
import type { World } from '../engine/world.js';
import {
    type BarbarianSnapshot,
    decideBarbarianAction,
} from './decide/barbarian.js';

/**
 * Wahrnehmung und Ausführung für Barbarendörfer (plans/14-barbarendoerfer.md).
 *
 * Die Entscheidung selbst steht in `decide/barbarian.ts` und ist pure. Hier
 * wird gelesen, ausgeführt und der nächste Tick eingeplant — die drei Dinge,
 * die eine Datenbank und eine Uhr brauchen.
 */

/**
 * Über dem Punktedeckel wird seltener nachgedacht: Ein fertig ausgebautes Dorf
 * kann nur noch rekrutieren, und dafür reicht ein Bruchteil der Versuche.
 */
const CAPPED_RATE_FACTOR = 0.25;

function perceive(
    world: World,
    villageId: number,
): BarbarianSnapshot | null {
    const village = world.db
        .select()
        .from(villages)
        .where(eq(villages.id, villageId))
        .all()[0];
    if (!village || village.playerId !== null) return null;

    const now = world.now();
    const levels = world.getBuildingLevels(villageId);
    const resources = world.settleResources(villageId, now);
    const building =
        world.db
            .select({ id: buildQueue.id })
            .from(buildQueue)
            .where(eq(buildQueue.villageId, villageId))
            .orderBy(asc(buildQueue.id))
            .limit(1)
            .all().length > 0;
    const recruiting =
        world.db
            .select({ id: recruitQueue.id })
            .from(recruitQueue)
            .where(eq(recruitQueue.villageId, villageId))
            .orderBy(asc(recruitQueue.id))
            .limit(1)
            .all().length > 0;

    return {
        levels,
        resources,
        popInUse: world.popInUse(villageId, levels),
        points: village.points,
        building,
        recruiting,
        maxPoints: world.settings.barbarianMaxPoints,
    };
}

/**
 * Plant den nächsten Tick eines Barbarendorfs.
 *
 * Rate 0 (oder ein Dorf über dem Deckel ohne Kaserne) heißt: kein Event. Ein
 * `null` aus `exponentialWait` ist deshalb kein Fehler, sondern die Antwort
 * „nie" — und die darf nicht als `Infinity` in der Event-Tabelle landen.
 */
export function scheduleBarbarianTick(
    world: World,
    villageId: number,
    rng: Rng,
    atCap = false,
): void {
    /*
     * Mit `speed` skaliert, wie Produktion und Bauzeiten auch: Die Spielzeit
     * läuft 1:1 mit der Echtzeit (siehe `GameClock`), `speed` beschleunigt
     * nicht die Uhr, sondern alles, was in ihr geschieht. Ohne diese Skalierung
     * würden Barbaren in einer 500x-Welt relativ zu allem anderen stillstehen.
     */
    const rate =
        world.settings.barbarianAttemptsPerHour *
        world.settings.speed *
        (atCap ? CAPPED_RATE_FACTOR : 1);
    const wait = exponentialWait(rng, rate);
    if (wait === null) return;
    world.scheduler.insert(
        'barbarian_tick',
        GameTime.add(world.now(), wait),
        { villageId },
    );
}

/**
 * Ein Barbarendorf handelt: wahrnehmen, entscheiden, ausführen, neu einplanen.
 *
 * Der letzte Schritt ist der wichtigste — die Kette hält sich selbst am Leben
 * und liegt in der `events`-Tabelle. Sie überlebt damit Serverneustarts und
 * respektiert die Pause automatisch, weil der Scheduler bei angehaltener Uhr
 * keinen Timer bewaffnet.
 */
export function handleBarbarianTick(
    world: World,
    payload: { villageId: number },
): void {
    const { villageId } = payload;
    const snapshot = perceive(world, villageId);
    // Erobertes oder gelöschtes Dorf: Kette endet hier, ohne Fehler.
    if (!snapshot) return;

    const action = decideBarbarianAction(snapshot, world.rng.next);
    switch (action.kind) {
        case 'build':
            world.upgradeBuilding(villageId, action.building);
            break;
        case 'recruit':
            recruitUnits(world, villageId, action.unit, action.count);
            break;
        case 'idle':
            break;
    }

    scheduleBarbarianTick(
        world,
        villageId,
        world.rng.next,
        snapshot.points >= snapshot.maxPoints,
    );
}

/**
 * Startet die Ketten für alle herrenlosen Dörfer.
 *
 * **Idempotent.** Läuft schon irgendwo eine Kette, passiert nichts — sonst
 * würde jedes Öffnen einer Welt die Zahl der Events verdoppeln, und nach ein
 * paar Neustarts würde ein Barbarendorf im Sekundentakt bauen. Deshalb wird
 * die Funktion beim Erzeugen *und* beim Öffnen einer Welt aufgerufen: Beim
 * Erzeugen legt sie die Ketten an, beim Öffnen rüstet sie Welten nach, die vor
 * Plan 14 entstanden sind.
 *
 * Der zufällige Versatz ist kein Schönheitsfehler: Ohne ihn würden alle 80
 * Dörfer im selben Moment ticken und danach in Schwärmen weiterlaufen — ein
 * regelmäßiger Ausschlag in der Event-Loop-Latenz.
 */
export function startBarbarianTicks(world: World): number {
    if (world.settings.barbarianAttemptsPerHour <= 0) return 0;

    const running = world.db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.type, 'barbarian_tick'))
        .limit(1)
        .all();
    if (running.length > 0) return 0;

    const ids = world.db
        .select({ id: villages.id })
        .from(villages)
        .where(isNull(villages.playerId))
        .all()
        .map((v) => v.id);
    for (const id of ids)
        scheduleBarbarianTick(world, id, world.rng.next);
    return ids.length;
}
