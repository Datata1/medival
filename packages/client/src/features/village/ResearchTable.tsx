import {
    canAfford,
    Duration,
    entriesOf,
    RESEARCH,
    type Resources,
    researchBlock,
    researchCost,
    researchTimeS,
    type UnitType,
    type VillageView,
} from '@medival/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Countdown } from '../../components/Countdown.js';
import { Icon } from '../../components/Icon.js';
import { ResourceCost } from '../../components/ResourceCost.js';
import { Table, Td, Th } from '../../components/Table.js';
import { formatDuration } from '../../lib/format.js';

/**
 * Die Forschung in der Schmiede (plans/19-prototyp/19-13): jede Einheit
 * dieser Welt mit ihrem Stand. Was fehlt, steht in der Zeile — eine
 * ausgegraute Zeile ohne Grund lässt raten.
 */
export function ResearchTable({
    village,
    live,
    speed,
    enabledUnits,
    busy,
    error,
    onResearch,
}: {
    village: VillageView;
    live: Resources;
    speed: number;
    enabledUnits: readonly UnitType[];
    busy: boolean;
    error: string | null;
    onResearch: (unit: UnitType) => void;
}) {
    const { t } = useTranslation();
    const running = village.research;

    return (
        <Card>
            <h2>{t('village.research.title')}</h2>
            <Table>
                <thead>
                    <tr>
                        <Th>{t('village.research.colUnit')}</Th>
                        <Th>{t('village.research.colNeeds')}</Th>
                        <Th>{t('village.research.colCost')}</Th>
                        <Th>{t('village.research.colTime')}</Th>
                        <Th />
                    </tr>
                </thead>
                <tbody>
                    {enabledUnits.map((unit) => {
                        const spec = RESEARCH[unit];
                        const block = researchBlock(
                            unit,
                            village.buildings,
                            village.researched,
                        );
                        const cost = researchCost(unit);
                        return (
                            <tr key={unit}>
                                <Td>
                                    <span className="inline-flex items-center gap-2">
                                        <Icon name={`unit.${unit}`} />
                                        {t(`units.${unit}`)}
                                    </span>
                                </Td>
                                <Td>
                                    {spec === null
                                        ? t('village.research.free')
                                        : [
                                              t(
                                                  'village.research.smithyLevel',
                                                  {
                                                      level: spec.smithy,
                                                  },
                                              ),
                                              ...entriesOf(
                                                  spec.requires ?? {},
                                              ).map(
                                                  ([b, level]) =>
                                                      `${t(`buildings.${b}`)} ${level}`,
                                              ),
                                          ].join(', ')}
                                </Td>
                                <Td>
                                    {spec !== null && (
                                        <ResourceCost
                                            resources={cost}
                                        />
                                    )}
                                </Td>
                                <Td>
                                    {spec !== null &&
                                        formatDuration(
                                            Duration.seconds(
                                                researchTimeS(unit) /
                                                    speed,
                                            ),
                                        )}
                                </Td>
                                <Td>
                                    {running?.unit === unit ? (
                                        <span>
                                            {t(
                                                'village.research.running',
                                            )}{' '}
                                            <Countdown
                                                until={
                                                    running.completesAt
                                                }
                                            />
                                        </span>
                                    ) : block ===
                                      'already_researched' ? (
                                        t('village.research.done')
                                    ) : spec === null ? null : (
                                        <Button
                                            disabled={
                                                block !== null ||
                                                running !== null ||
                                                !canAfford(
                                                    live,
                                                    cost,
                                                ) ||
                                                busy
                                            }
                                            title={
                                                block === null
                                                    ? undefined
                                                    : t(
                                                          `errors.${block}`,
                                                      )
                                            }
                                            onClick={() =>
                                                onResearch(unit)
                                            }
                                        >
                                            {t(
                                                'village.research.start',
                                            )}
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
