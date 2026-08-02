import type { VillageView } from '@medival/shared';
import {
    BUILDING_ORDER,
    BUILDINGS,
    type BuildingLevels,
    type BuildingType,
    buildCost,
    buildTime,
    canAfford,
    type Resources,
    requirementsMet,
} from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { ResourceCost } from '../../components/ResourceCost.js';
import { Table, Td, Th } from '../../components/Table.js';
import { formatDuration } from '../../lib/format.js';

export function BuildingsTable({
    village,
    live,
    effLevels,
    speed,
    onBuild,
    busy,
    error,
}: {
    village: VillageView;
    live: Resources;
    effLevels: BuildingLevels;
    speed: number;
    onBuild: (type: BuildingType) => void;
    busy: boolean;
    error: string | null;
}) {
    const { t } = useTranslation();
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
                    {BUILDING_ORDER.map((type) => {
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
                                    <span className="inline-flex items-center gap-2">
                                        <Icon
                                            name={`building.${type}`}
                                        />
                                        {t(`buildings.${type}`)}
                                    </span>
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
                                        <span className="text-ink-light">
                                            {t(
                                                'village.requirementsMissing',
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
