import {
    canAfford,
    Duration,
    GameTime,
    keysOf,
    type Resources,
    researchCost,
    subtractResources,
    unitCost,
} from '@medival/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { events } from '../db/schema.js';
import { GameError } from '../engine/errors.js';
import { botTickTimings } from '../engine/health.js';
import {
    acceptInvitation,
    foundTribe,
    invitePlayer,
} from '../engine/tribes.js';
import type { World } from '../engine/world.js';
import { decideBuild, QUEUE_LIMIT } from './decide/build.js';
import {
    decideFounding,
    decideInvitation,
} from './decide/diplomacy.js';
import {
    decideAttack,
    decideScouting,
    decideSupport,
} from './decide/military.js';
import { decidePaladin, decideRecruit } from './decide/recruit.js';
import { decideResearch } from './decide/research.js';
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
 * Spätestens so lange wartet ein Bot, auch wenn sein Sparziel noch fern ist —
 * in **Spielzeit** bei Speed 1 (plans/19-prototyp/19-4).
 *
 * Vorher waren es feste 10 Minuten Echtzeit. Bei Speed 200 sind das ~33
 * Spielstunden, und weil eine volle Bauschleife kein Ziel lieferte, schlief
 * jeder Bot nach zwei Aufträgen genau so lange — die Bauten waren nach
 * Sekunden fertig. Ereignisse, die die Lage ändern, wecken ihn zusätzlich
 * (`wakeBot`); die Obergrenze ist nur das Netz darunter.
 */
const MAX_THINK_GAME_TIME = Duration.hours(2);
/** Untergrenze des Höchstintervalls in Echtzeit, auch bei hohem Speed. */
const MAX_THINK_FLOOR = Duration.seconds(10);
/** Untergrenze, damit ein Bot mit vollem Lager nicht in Dauerschleife denkt. */
const MIN_THINK_INTERVAL = Duration.seconds(2);

/** Höchstintervall bei dieser Weltgeschwindigkeit. */
export function maxThinkInterval(speed: number): Duration {
    return Duration.atLeast(
        Duration.scale(MAX_THINK_GAME_TIME, 1 / Math.max(1, speed)),
        MAX_THINK_FLOOR,
    );
}

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
    let soonest = maxThinkInterval(snapshot.speed);
    /*
     * Wann eine volle Bauschleife wieder Platz hat. Ohne diese Zeile lieferte
     * `decideBuild` bei voller Schleife nichts, `soonest` blieb auf dem
     * Höchstintervall, und der Bot verschlief die Fertigstellung.
     */
    for (const village of snapshot.villages) {
        if (village.queueLength < QUEUE_LIMIT) continue;
        if (village.queueFreeAt == null) continue;
        const wait = Duration.ms(
            Math.max(0, village.queueFreeAt - snapshot.gameTime),
        );
        if (wait < soonest) soonest = wait;
    }
    /*
     * Was nach dem Bauen noch im Lager liegt.
     *
     * Intents werden gegen *einen* Snapshot geplant, aber nacheinander
     * ausgeführt — jeder ändert den Zustand für den nächsten. Ohne diese
     * Buchführung schlägt ein Bot eine Lieferung vor, die der Bau soeben
     * unbezahlbar gemacht hat, und die Ausführung meldet
     * `not_enough_resources`.
     */
    const leftover = new Map<number, Resources>(
        snapshot.villages.map((v) => [v.id, { ...v.resources }]),
    );

    for (const village of snapshot.villages) {
        const choice = decideBuild(
            village,
            snapshot.personality,
            snapshot.speed,
        );
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
            leftover.set(
                village.id,
                subtractResources(village.resources, choice.cost),
            );
            continue;
        }
        // Noch nicht bezahlbar: nachdenken, sobald es so weit ist.
        if (choice.waitFor !== null && choice.waitFor < soonest) {
            soonest = choice.waitFor;
        }
    }

    // Forschung vor den Truppen (19-13): Ohne sie gibt es nur Speerträger.
    for (const village of snapshot.villages) {
        const rest = leftover.get(village.id) ?? village.resources;
        const unit = decideResearch(
            village,
            rest,
            snapshot.personality,
            snapshot.enabledUnits,
        );
        if (!unit) continue;
        intents.push({ kind: 'research', villageId: village.id, unit });
        leftover.set(
            village.id,
            subtractResources(rest, researchCost(unit)),
        );
    }

    // Der Paladin (19-14): einer für alle Dörfer.
    const paladin = decidePaladin(
        snapshot.villages,
        (id) =>
            leftover.get(id) ??
            snapshot.villages.find((v) => v.id === id)?.resources ?? {
                wood: 0,
                clay: 0,
                iron: 0,
            },
        snapshot.paladin,
        snapshot.enabledUnits,
    );
    if (paladin) {
        intents.push({
            kind: 'recruit',
            villageId: paladin.villageId,
            unit: 'paladin',
            count: 1,
        });
        const rest =
            leftover.get(paladin.villageId) ??
            snapshot.villages.find((v) => v.id === paladin.villageId)
                ?.resources;
        if (rest)
            leftover.set(
                paladin.villageId,
                subtractResources(rest, paladin.cost),
            );
    }

    // Truppen aus dem, was nach dem Bauen übrig ist (Plan 17).
    for (const village of snapshot.villages) {
        const rest = leftover.get(village.id) ?? village.resources;
        const order = decideRecruit(
            village,
            rest,
            snapshot.personality,
            village.recruiting,
            snapshot.enabledUnits,
        );
        if (!order) continue;
        intents.push({
            kind: 'recruit',
            villageId: village.id,
            unit: order.unit,
            count: order.count,
        });
        leftover.set(
            village.id,
            subtractResources(rest, unitCost(order.unit, order.count)),
        );
    }

    /*
     * Liefern, was übrig ist (Plan 16). Bewusst *nach* dem Bauen: Ein Bot
     * verschenkt nur, was er für sein eigenes Ziel nicht braucht — deshalb
     * zählt hier der Überschuss über der Schwelle, nicht das ganze Lager.
     */
    for (const village of snapshot.villages) {
        if (village.merchantsFree <= 0) continue;
        const shipment = decideShipment(
            leftover.get(village.id) ?? village.resources,
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

    /*
     * Verteidigen geht vor angreifen: Wer ein Stammesmitglied verliert, hat
     * nichts davon, dass er zeitgleich anderswo Beute gemacht hat.
     */
    for (const village of snapshot.villages) {
        if (snapshot.distressCalls.length === 0) break;
        const support = decideSupport(
            { x: village.x, y: village.y, units: village.units },
            snapshot.distressCalls,
            snapshot.gameTime,
            snapshot.unitSpeed,
        );
        if (!support) continue;
        intents.push({
            kind: 'send',
            originVillageId: village.id,
            targetVillageId: support.targetVillageId,
            movement: 'support',
            units: support.units,
        });
    }

    // Erst ausspähen, dann angreifen (19-10): Der Angriff nutzt beim
    // nächsten Mal, was die Späher gesehen haben.
    for (const village of snapshot.villages) {
        if (snapshot.targets.length === 0) break;
        const scout = decideScouting(
            {
                x: village.x,
                y: village.y,
                units: village.units,
                scoutsInFlight: village.scoutsInFlight,
            },
            snapshot.targets,
            snapshot.personality,
        );
        if (!scout) continue;
        intents.push({
            kind: 'send',
            originVillageId: village.id,
            targetVillageId: scout.targetVillageId,
            movement: 'attack',
            units: scout.units,
        });
    }

    for (const village of snapshot.villages) {
        if (snapshot.targets.length === 0) break;
        const attack = decideAttack(
            { x: village.x, y: village.y, units: village.units },
            snapshot.targets,
            snapshot.personality,
        );
        if (!attack) continue;
        intents.push({
            kind: 'send',
            originVillageId: village.id,
            targetVillageId: attack.targetVillageId,
            movement: 'attack',
            units: attack.units,
            catapultTarget: attack.catapultTarget,
        });
    }

    const factor = DIFFICULTY_THINK_FACTOR[snapshot.difficulty];
    /*
     * Nach einem Bau oder einer Rekrutierung gleich wieder schauen: Lager und
     * Schleife haben sich geändert, vielleicht passt noch ein Auftrag.
     * Lieferungen und Truppenbewegungen zählen bewusst nicht — sie ändern
     * nichts, worüber der Bot zwei Sekunden später anders entschiede. Genau
     * diese Abkürzung machte aus jeder Lieferung eine Schleife (19-4).
     */
    const changedOwnState = intents.some(
        (i) => i.kind === 'build' || i.kind === 'recruit',
    );
    const nextIn = Duration.atLeast(
        Duration.scale(
            changedOwnState ? MIN_THINK_INTERVAL : soonest,
            factor,
        ),
        MIN_THINK_INTERVAL,
    );

    return { intents, nextIn, state: { savingFor } };
}

/**
 * Weckt einen Bot, weil sich seine Lage geändert hat (plans/19-prototyp/19-4):
 * ein Bau ist fertig, ein Angriff ist unterwegs, Truppen oder Waren sind
 * angekommen.
 *
 * Plan 15 sah das vor („Ereignisse, die die Lage ändern, planen den Tick
 * sofort neu"), umgesetzt war es nie — ein Bot erfuhr von allem erst beim
 * nächsten regulären Tick. Es entsteht **kein zweiter Tick**: Der vorhandene
 * wird vorgezogen, die Invariante „eine Kette je Bot" bleibt. Für Menschen,
 * Barbaren und Bots ohne laufende Kette ist der Aufruf ein No-op.
 */
export function wakeBot(
    world: World,
    playerId: number | null,
    at: GameTime = world.now(),
): void {
    if (playerId === null) return;
    const tick = world.sqlite
        .prepare(
            `SELECT e.id, e.due_game_time AS due FROM events e
             JOIN players p ON p.id = json_extract(e.payload_json, '$.playerId')
             WHERE e.type = 'bot_tick' AND p.id = ? AND p.is_bot = 1
             LIMIT 1`,
        )
        .get(playerId);
    const parsed = BotTickRowSchema.safeParse(tick);
    if (!parsed.success) return;
    // Schon bald dran: nicht noch weiter vorziehen.
    if (parsed.data.due <= GameTime.add(at, MIN_THINK_INTERVAL)) return;
    world.scheduler.pullForward(parsed.data.id, at);
}

const BotTickRowSchema = z.object({
    id: z.number().int(),
    due: z.number(),
});

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
    const started = performance.now();
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

    runDiplomacy(world, snapshot);

    if (keysOf(state.savingFor).length > 0) {
        writeBotState(world, payload.playerId, state);
    }
    scheduleBotTick(world, payload.playerId, nextIn);
    botTickTimings.record(performance.now() - started);
}

/**
 * Einladungen annehmen und Stämme gründen (Plan 17).
 *
 * Getrennt von `planBot`, weil beides keine `Intent`s sind: Es sind
 * Zustandswechsel ohne Kosten und ohne Marschzeit, und sie brauchen kein
 * Budget.
 */
function runDiplomacy(world: World, snapshot: BotSnapshot): void {
    const inTribe = snapshot.tribeId !== null;

    const joining = decideInvitation(snapshot.invitations, inTribe);
    if (joining !== null) {
        try {
            acceptInvitation(world, snapshot.playerId, joining);
            return;
        } catch (error) {
            if (!(error instanceof GameError)) throw error;
        }
    }

    const partnerId = decideFounding(
        snapshot.foundingCandidates,
        inTribe,
        world.rng.next(),
    );
    if (partnerId === null) return;
    try {
        // Der Gründer lädt sofort ein; angenommen wird beim nächsten Tick des
        // Partners — dieselbe Kette wie beim Spieler, kein Sonderweg.
        const tribeId = foundTribe(
            world,
            snapshot.playerId,
            `Bund von ${snapshot.playerId}`,
            `B${snapshot.playerId}`,
        );
        void tribeId;
        invitePlayer(world, snapshot.playerId, partnerId);
    } catch (error) {
        if (!(error instanceof GameError)) throw error;
    }
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
