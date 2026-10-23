import { GameError } from '../engine/errors.js';
import { recruitUnits, sendUnits } from '../engine/military.js';
import { researchUnit } from '../engine/research.js';
import { sendResources } from '../engine/trade.js';
import type { World } from '../engine/world.js';
import type { Intent } from './intents.js';

/**
 * Ausführung: Intents auf Kommandos abbilden (plans/15-bot-grundgeruest.md).
 *
 * **Über dieselben Kommandos, die auch der Spieler benutzt.** Bots haben keine
 * Sonderrechte, keine Rabatte und keinen zweiten Regelsatz; eine
 * Balancing-Änderung wirkt damit automatisch auf beiden Seiten. Genau hier
 * gehen Spiele dieser Art sonst kaputt: Der Bot bekommt „aus Vereinfachung"
 * eine eigene Bauroutine, und ein halbes Jahr später baut er Gebäude, die es
 * für den Spieler gar nicht mehr gibt.
 */

export interface ExecutionResult {
    /** Wie viele Intents tatsächlich ausgeführt wurden. */
    done: number;
    /** Abgewiesene Intents — jeder davon ist ein Fehler in der Entscheidung. */
    rejected: { intent: Intent; code: string }[];
}

export function executeIntents(
    world: World,
    intents: readonly Intent[],
    budget: number,
): ExecutionResult {
    const result: ExecutionResult = { done: 0, rejected: [] };

    for (const intent of intents) {
        if (result.done >= budget) break;
        try {
            runIntent(world, intent);
            result.done++;
        } catch (error) {
            /*
             * Ein `GameError` heißt: Die Entscheidungsschicht hat etwas
             * Unbezahlbares oder Unerlaubtes vorgeschlagen. Das ist ein Fehler
             * im Bot, kein Alltagsfall — deshalb wird er gemeldet und nicht
             * stillschweigend verschluckt. Andere Fehler gehören nach oben.
             */
            if (!(error instanceof GameError)) throw error;
            result.rejected.push({ intent, code: error.message });
        }
    }
    return result;
}

function runIntent(world: World, intent: Intent): void {
    switch (intent.kind) {
        case 'build':
            world.upgradeBuilding(intent.villageId, intent.building);
            break;
        case 'recruit':
            recruitUnits(
                world,
                intent.villageId,
                intent.unit,
                intent.count,
            );
            break;
        case 'research':
            researchUnit(world, intent.villageId, intent.unit);
            break;
        case 'ship':
            sendResources(
                world,
                intent.originVillageId,
                intent.targetVillageId,
                intent.resources,
            );
            break;
        case 'send':
            sendUnits(
                world,
                intent.originVillageId,
                intent.targetVillageId,
                intent.movement,
                intent.units,
                intent.catapultTarget,
            );
            break;
    }
}
