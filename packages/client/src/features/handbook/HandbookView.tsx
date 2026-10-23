import {
    BUILDING_ORDER,
    BUILDINGS,
    Duration,
    entriesOf,
    farmCapacity,
    MERCHANT_CAPACITY,
    MERCHANT_MIN_PER_FIELD,
    marketCapacity,
    productionPerHour,
    UNITS,
    type UnitType,
    WALL_BASE_DEFENSE_PER_LEVEL,
    WALL_DEFENSE_FACTOR_PER_LEVEL,
    warehouseCapacity,
} from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { ResourceCost } from '../../components/ResourceCost.js';
import { Table, Td, Th } from '../../components/Table.js';
import { formatDuration, formatNumber } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Das Nachschlagewerk: alle Zahlen, nach denen das Spiel rechnet.
 *
 * Es liest ausschließlich aus `@medival/shared` — denselben Tabellen, die
 * Server und Kampfrechner benutzen. Damit kann es nicht veralten: Ändert sich
 * eine Einheit, ändert sich diese Seite mit. Eine handgeschriebene Hilfeseite
 * wäre nach der ersten Balance-Änderung falsch.
 */
export const HandbookView = observer(function HandbookView() {
    const { t } = useTranslation();
    const { world } = useStores();
    const speed = world.summary?.settings.speed ?? 1;
    const unitSpeed = world.summary?.settings.unitSpeed ?? 1;

    return (
        <div>
            <h1>{t('nav.handbook')}</h1>
            <p className="text-ink-light">
                {t('handbook.intro', { speed, unitSpeed })}
            </p>

            <UnitTable
                units={world.enabledUnits}
                unitSpeed={unitSpeed}
                speed={speed}
            />
            <BuildingTable speed={speed} />
            <EffectsCard speed={speed} />
        </div>
    );
});

function UnitTable({
    units,
    unitSpeed,
    speed,
}: {
    units: readonly UnitType[];
    unitSpeed: number;
    speed: number;
}) {
    const { t } = useTranslation();
    // Die dritte Verteidigung zählt nur, wo es Bogenschützen gibt (19-12).
    const archers = units.some(
        (u) => UNITS[u].attackClass === 'archer',
    );
    return (
        <Card>
            <h2>{t('handbook.units')}</h2>
            <div className="overflow-x-auto">
                <Table>
                    <thead>
                        <tr>
                            <Th>{t('handbook.colUnit')}</Th>
                            <Th>{t('handbook.colAttack')}</Th>
                            <Th>{t('handbook.colDefense')}</Th>
                            <Th>{t('handbook.colDefenseCav')}</Th>
                            {archers && (
                                <Th>
                                    {t('handbook.colDefenseArcher')}
                                </Th>
                            )}
                            <Th>{t('handbook.colSpeed')}</Th>
                            <Th>{t('handbook.colCarry')}</Th>
                            <Th>{t('handbook.colPop')}</Th>
                            <Th>{t('handbook.colCost')}</Th>
                            <Th>{t('handbook.colRecruitTime')}</Th>
                            <Th>{t('handbook.colRecruitedAt')}</Th>
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        {units.map((type) => {
                            const u = UNITS[type];
                            return (
                                <tr key={type}>
                                    <Td className="whitespace-nowrap">
                                        <Icon name={`unit.${type}`} />{' '}
                                        {t(`units.${type}`)}
                                    </Td>
                                    <Td>{u.attack}</Td>
                                    <Td>{u.defense}</Td>
                                    <Td>{u.defenseCavalry}</Td>
                                    {archers && (
                                        <Td>{u.defenseArcher}</Td>
                                    )}
                                    <Td className="whitespace-nowrap">
                                        {t('handbook.minPerField', {
                                            minutes: (
                                                u.speedMinPerField /
                                                unitSpeed
                                            ).toFixed(1),
                                        })}
                                    </Td>
                                    <Td>{u.carry}</Td>
                                    <Td>{u.pop}</Td>
                                    <Td className="whitespace-nowrap">
                                        <ResourceCost
                                            resources={u.cost}
                                        />
                                    </Td>
                                    <Td className="whitespace-nowrap">
                                        {formatDuration(
                                            Duration.seconds(
                                                u.recruitTimeS / speed,
                                            ),
                                        )}
                                    </Td>
                                    <Td className="whitespace-nowrap">
                                        {t(
                                            `buildings.${u.recruitedAt}`,
                                        )}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </div>
            <p className="text-ink-light">
                {t('handbook.unitsHint')}
                {archers && ` ${t('handbook.unitsHintArchers')}`}
            </p>
        </Card>
    );
}

function BuildingTable({ speed }: { speed: number }) {
    const { t } = useTranslation();
    return (
        <Card>
            <h2>{t('handbook.buildings')}</h2>
            <div className="overflow-x-auto">
                <Table>
                    <thead>
                        <tr>
                            <Th>{t('handbook.colBuilding')}</Th>
                            <Th>{t('handbook.colMaxLevel')}</Th>
                            <Th>{t('handbook.colBaseCost')}</Th>
                            <Th>{t('handbook.colBaseTime')}</Th>
                            <Th>{t('handbook.colRequires')}</Th>
                            <Th>{t('handbook.colEffect')}</Th>
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        {BUILDING_ORDER.map((type) => {
                            const b = BUILDINGS[type];
                            const requires = b.requires
                                ? entriesOf(b.requires)
                                      .map(
                                          ([r, lvl]) =>
                                              `${t(`buildings.${r}`)} ${lvl}`,
                                      )
                                      .join(', ')
                                : '—';
                            return (
                                <tr key={type}>
                                    <Td className="whitespace-nowrap">
                                        <Icon
                                            name={`building.${type}`}
                                        />{' '}
                                        {t(`buildings.${type}`)}
                                    </Td>
                                    <Td>{b.maxLevel}</Td>
                                    <Td className="whitespace-nowrap">
                                        <ResourceCost
                                            resources={b.baseCost}
                                        />
                                    </Td>
                                    <Td className="whitespace-nowrap">
                                        {formatDuration(
                                            Duration.seconds(
                                                b.baseTimeS / speed,
                                            ),
                                        )}
                                    </Td>
                                    <Td>{requires}</Td>
                                    <Td className="font-body">
                                        {t(`handbook.effect.${type}`)}
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
            </div>
            <p className="text-ink-light">
                {t('handbook.buildingsHint')}
            </p>
        </Card>
    );
}

/**
 * Die Stufentabellen, die man beim Planen wirklich nachschlägt: Wie viel
 * produziert Stufe 15? Wie viele Bauernhofplätze bringt der nächste Ausbau?
 */
function EffectsCard({ speed }: { speed: number }) {
    const { t } = useTranslation();
    const levels = [1, 5, 10, 15, 20, 25, 30];
    return (
        <Card>
            <h2>{t('handbook.levels')}</h2>
            <div className="overflow-x-auto">
                <Table>
                    <thead>
                        <tr>
                            <Th>{t('handbook.colLevel')}</Th>
                            {levels.map((l) => (
                                <Th key={l}>{l}</Th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="tabular-nums">
                        <tr>
                            <Th>{t('handbook.rowProduction')}</Th>
                            {levels.map((l) => (
                                <Td key={l}>
                                    {formatNumber(
                                        productionPerHour(l) * speed,
                                    )}
                                </Td>
                            ))}
                        </tr>
                        <tr>
                            <Th>{t('handbook.rowStorage')}</Th>
                            {levels.map((l) => (
                                <Td key={l}>
                                    {formatNumber(warehouseCapacity(l))}
                                </Td>
                            ))}
                        </tr>
                        <tr>
                            <Th>{t('handbook.rowFarm')}</Th>
                            {levels.map((l) => (
                                <Td key={l}>
                                    {formatNumber(farmCapacity(l))}
                                </Td>
                            ))}
                        </tr>
                        <tr>
                            <Th>{t('handbook.rowMarket')}</Th>
                            {levels.map((l) => (
                                <Td key={l}>
                                    {formatNumber(marketCapacity(l))}
                                </Td>
                            ))}
                        </tr>
                        <tr>
                            <Th>{t('handbook.rowWall')}</Th>
                            {levels.map((l) => (
                                <Td key={l}>
                                    +
                                    {Math.round(
                                        l *
                                            WALL_DEFENSE_FACTOR_PER_LEVEL *
                                            100,
                                    )}
                                    %
                                </Td>
                            ))}
                        </tr>
                    </tbody>
                </Table>
            </div>
            <ul className="mt-3 text-ink-light">
                <li>
                    {t('handbook.noteMerchant', {
                        capacity: formatNumber(MERCHANT_CAPACITY),
                        minutes: MERCHANT_MIN_PER_FIELD,
                    })}
                </li>
                <li>
                    {t('handbook.noteWall', {
                        flat: WALL_BASE_DEFENSE_PER_LEVEL,
                    })}
                </li>
            </ul>
        </Card>
    );
}
