import type { VillageView } from '@medival/shared';
import {
    BUILDINGS,
    type BuildingLevels,
    type BuildingType,
    buildCost,
    buildTime,
    canAfford,
    entriesOf,
    type Resources,
    requirementsMet,
} from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { ResourceCost } from '../../components/ResourceCost.js';
import { Table, Td, Th } from '../../components/Table.js';
import { formatDuration } from '../../lib/format.js';

/** „Hauptgebäude 20, Stall 10" — was diesem Gebäude noch fehlt. */
function useRequirementList() {
    const { t } = useTranslation();
    return (type: BuildingType): string => {
        const requires = BUILDINGS[type].requires;
        if (!requires) return '';
        return entriesOf(requires)
            .map(([req, min]) => `${t(`buildings.${req}`)} ${min}`)
            .join(', ');
    };
}

/**
 * Alle Gebäude mit Stufe, Kosten und Bau-Knopf — seit Plan 18-2 nicht mehr auf
 * der Dorfübersicht, sondern im Hauptgebäude.
 *
 * Sie stand vorher auf der Übersicht und schob mit ihren elf Zeilen alles
 * Wichtige unter die Falz. Weg konnte sie trotzdem nicht: Bauen ist die
 * häufigste Handlung im Spiel, und dafür jedes Gebäude einzeln anzusteuern
 * wäre ein Klick mehr für jeden einzelnen Auftrag.
 */
export function BuildingsTable({
    village,
    live,
    effLevels,
    speed,
    worldId,
    onBuild,
    busy,
    error,
    buildings,
}: {
    /** Die Gebäude dieser Welt (`world.enabledBuildings`, 19-14). */
    buildings: readonly BuildingType[];
    village: VillageView;
    live: Resources;
    effLevels: BuildingLevels;
    speed: number;
    worldId: number;
    onBuild: (type: BuildingType) => void;
    busy: boolean;
    error: string | null;
}) {
    const { t } = useTranslation();
    const requirementList = useRequirementList();
    return (
        <Card>
            <h2>{t('village.buildings')}</h2>
            <Table>
                <thead>
                    <tr>
                        <Th>{t('village.colBuilding')}</Th>
                        <Th>{t('village.colLevel')}</Th>
                        <Th>{t('village.colCost')}</Th>
                        <Th>{t('village.colBuildTime')}</Th>
                        <Th />
                    </tr>
                </thead>
                <tbody>
                    {buildings.map((type) => {
                        const target = effLevels[type] + 1;
                        const maxed = target > BUILDINGS[type].maxLevel;
                        const unlocked = requirementsMet(
                            type,
                            village.buildings,
                        );
                        const cost = maxed
                            ? null
                            : buildCost(type, target);
                        const affordable =
                            cost !== null && canAfford(live, cost);
                        return (
                            <tr
                                key={type}
                                className={
                                    unlocked ? '' : 'text-ink-light'
                                }
                            >
                                <Td>
                                    {/* Der Name führt auf die Gebäudeseite —
                                        von dort aus rekrutiert man, liefert
                                        man und sieht die Wirkung der
                                        nächsten Stufe. */}
                                    <Link
                                        to="/worlds/$worldId/village/$villageId/$building"
                                        params={{
                                            worldId: String(worldId),
                                            villageId: String(
                                                village.id,
                                            ),
                                            building: type,
                                        }}
                                        className="inline-flex items-center gap-2 hover:text-seal"
                                    >
                                        <Icon
                                            name={`building.${type}`}
                                        />
                                        {t(`buildings.${type}`)}
                                    </Link>
                                </Td>
                                <Td>{village.buildings[type]}</Td>
                                <Td>
                                    {maxed ? (
                                        <span className="text-ink-light">
                                            {t('village.maxLevel')}
                                        </span>
                                    ) : unlocked && cost ? (
                                        <ResourceCost
                                            resources={cost}
                                        />
                                    ) : (
                                        /*
                                         * Gesperrte Gebäude stehen mit in der
                                         * Liste — sonst weiß niemand, dass es
                                         * sie gibt. Dann muss aber auch
                                         * dastehen, **was** fehlt: „Braucht
                                         * Hauptgebäude 20, Stall 10" statt
                                         * eines allgemeinen „Voraussetzungen
                                         * fehlen".
                                         */
                                        <span className="text-ink-light">
                                            {t(
                                                'village.building.requires',
                                                {
                                                    list: requirementList(
                                                        type,
                                                    ),
                                                },
                                            )}
                                        </span>
                                    )}
                                </Td>
                                <Td>
                                    {maxed || !unlocked
                                        ? '—'
                                        : formatDuration(
                                              buildTime(
                                                  type,
                                                  target,
                                                  village.buildings
                                                      .headquarters,
                                                  speed,
                                              ),
                                          )}
                                </Td>
                                <Td>
                                    {!maxed && unlocked && (
                                        <Button
                                            disabled={
                                                !affordable ||
                                                busy ||
                                                village.buildQueue
                                                    .length >= 5
                                            }
                                            onClick={() =>
                                                onBuild(type)
                                            }
                                        >
                                            {t('village.upgrade', {
                                                level: target,
                                            })}
                                        </Button>
                                    )}
                                </Td>
                            </tr>
                        );
                    })}
                </tbody>
            </Table>
            {error && <p className="text-seal">{error}</p>}
        </Card>
    );
}
