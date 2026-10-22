import type {
    BuildingType,
    Resources,
    Units,
    UnitType,
} from '@medival/shared';
import { recruitUnits, sendUnits } from '../../src/engine/military.js';
import { sendResources } from '../../src/engine/trade.js';
import type { World } from '../../src/engine/world.js';

/**
 * Handlungen in einer Testwelt (plans/19-prototyp/19-1).
 *
 * Dünne Hüllen um die echten Kommandos — ohne eigene Logik. Sie existieren
 * nur, damit ein Szenario sich wie eine Spielbeschreibung liest; ein Test,
 * der hier eine Abkürzung bräuchte, prüft das falsche Programm.
 */
export const act = {
    attack(world: World, from: number, to: number, units: Units) {
        return sendUnits(world, from, to, 'attack', units);
    },
    support(world: World, from: number, to: number, units: Units) {
        return sendUnits(world, from, to, 'support', units);
    },
    build(world: World, villageId: number, building: BuildingType) {
        world.upgradeBuilding(villageId, building);
    },
    recruit(
        world: World,
        villageId: number,
        unit: UnitType,
        count: number,
    ) {
        recruitUnits(world, villageId, unit, count);
    },
    ship(world: World, from: number, to: number, resources: Resources) {
        return sendResources(world, from, to, { ...resources });
    },
};
