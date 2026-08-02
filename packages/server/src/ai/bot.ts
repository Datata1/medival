import { canAfford, Duration, GameTime, keysOf } from '@medival/shared';
import { eq } from 'drizzle-orm';
import { events } from '../db/schema.js';
import type { World } from '../engine/world.js';
import { decideBuild } from './decide/build.js';
import { decideShipment } from './decide/trade.js';
import { executeIntents } from './execute.js';
import type { BotState, Intent } from './intents.js';
import {
    type BotSnapshot,
    botPlayerIds,
    perceiveBot,
    writeBotState,
} from './perceive.js';
import {
    DIFFICULTY_ACTION_BUDGET,
    DIFFICULTY_THINK_FACTOR,
} from './personalities.js';

/**
 * Der Bot-Tick: wahrnehmen → entscheiden → ausführen → neu einplanen
 * (plans/15-bot-grundgeruest.md).
 *
 * Diese Datei ist der Klebstoff zwischen den drei Schichten. Sie darf die
 * Datenbank und die Uhr kennen; `decide/` darf das nicht — durchgesetzt von
 * `scripts/check-ai-purity.mjs`.
 */

/**
 * Spätestens so lange wartet ein Bot, auch wenn sein Sparziel noch fern ist.
 * Ohne diese Obergrenze verschläft er alles, was die Lage zwischendurch
 * ändert: einen eingehenden Angriff, ein zerstörtes Gebäude, eine Lieferung.
 */
const MAX_THINK_INTERVAL = Duration.minutes(10);
/** Untergrenze, damit ein Bot mit vollem Lager nicht in Dauerschleife denkt. */
const MIN_THINK_INTERVAL = Duration.seconds(2);

/**
 * Entscheidet für alle Dörfer eines Bots und sagt zugleich, wann sich das
 * nächste Nachdenken lohnt.
 *
 * Das ist die zweite tragende Idee des Plans: Weil die Produktion
 * deterministisch ist, muss auf den Zeitpunkt der Bezahlbarkeit nicht gewartet
 * und nicht gepollt werden — er wird ausgerechnet (`timeUntilAffordable`) und
 * der nächste Tick genau darauf gelegt. Kein Tick-Loop, ein Event je
 * Entscheidung.
 */
export function planBot(snapshot: BotSnapshot): {
    intents: Intent[];
    nextIn: Duration;
    state: BotState;
} {
    const intents: Intent[] = [];
    const savingFor: BotState['savingFor'] = {};
    let soonest = MAX_THINK_INTERVAL;

    for (const village of snapshot.villages) {
        const choice = decideBuild(village, snapshot.personality);
        if (!choice) continue;

        savingFor[String(village.id)] = {
            building: choice.building,
            level: choice.level,
        };

        if (canAfford(village.resources, choice.cost)) {
            intents.push({
                kind: 'build',
                villageId: village.id,
                building: choice.building,
            });
            continue;
        }
        // Noch nicht bezahlbar: nachdenken, sobald es so weit ist.
        if (choice.waitFor !== null && choice.waitFor < soonest) {
            soonest = choice.waitFor;
        }
    }

    /*
     * Liefern, was übrig ist (Plan 16). Bewusst *nach* dem Bauen: Ein Bot
     * verschenkt nur, was er für sein eigenes Ziel nicht braucht — deshalb
     * zählt hier der Überschuss über der Schwelle, nicht das ganze Lager.
     */
    for (const village of snapshot.villages) {
        if (village.merchantsFree <= 0) continue;
        const shipment = decideShipment(
            village.resources,
            village.capacity,
            village.merchantsFree,
            snapshot.partners,
        );
        if (!shipment) continue;
        intents.push({
            kind: 'ship',
            originVillageId: village.id,
            targetVillageId: shipment.partner.villageId,
            resources: shipment.resources,
        });
    }

    const factor = DIFFICULTY_THINK_FACTOR[snapshot.difficulty];
    const nextIn = Duration.atLeast(
        Duration.scale(
            // Nach einer ausgeführten Aktion gleich wieder schauen: Die Lage
            // hat sich geändert (Lager leerer, Schleife länger).
            intents.length > 0 ? MIN_THINK_INTERVAL : soonest,
            factor,
        ),
        MIN_THINK_INTERVAL,
    );

    return { intents, nextIn, state: { savingFor } };
}

export function scheduleBotTick(
    world: World,
    playerId: number,
    delay: Duration,
): void {
    world.scheduler.insert(
        'bot_tick',
        GameTime.add(world.now(), delay),
        { playerId },
    );
}

export function handleBotTick(
    world: World,
    payload: { playerId: number },
): void {
    const snapshot = perceiveBot(world, payload.playerId);
    // Kein Dorf mehr oder kein Bot: Kette endet hier, ohne Fehler.
    if (!snapshot) return;

    const { intents, nextIn, state } = planBot(snapshot);
    const budget = DIFFICULTY_ACTION_BUDGET[snapshot.difficulty];
    const result = executeIntents(world, intents, budget);

    for (const { intent, code } of result.rejected) {
        console.warn(
            `[world ${world.id}] Bot ${payload.playerId}: ${intent.kind} abgewiesen (${code})`,
        );
    }

    if (keysOf(state.savingFor).length > 0) {
        writeBotState(world, payload.playerId, state);
    }
    scheduleBotTick(world, payload.playerId, nextIn);
}

/**
 * Startet die Ketten für alle Bots.
 *
 * **Idempotent**, aus demselben Grund wie bei den Barbaren (Plan 14): Ohne die
 * Prüfung würde jedes Öffnen einer Welt die Zahl der Events verdoppeln.
 * Der zufällige Versatz verhindert, dass 30 Bots im selben Moment denken.
 */
export function startBotTicks(world: World): number {
    const running = world.db
        .select({ id: events.id })
        .from(events)
        .where(eq(events.type, 'bot_tick'))
        .limit(1)
        .all();
    if (running.length > 0) return 0;

    const ids = botPlayerIds(world);
    for (const id of ids) {
        scheduleBotTick(
            world,
            id,
            Duration.scale(MIN_THINK_INTERVAL, world.rng.next() * 10),
        );
    }
    return ids.length;
}
