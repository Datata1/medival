import { recruitTime, UNITS, type UnitType } from '@medival/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { ResourceCost } from '../../components/ResourceCost.js';
import { Td } from '../../components/Table.js';
import { formatDuration } from '../../lib/format.js';

export function RecruitRow({
    type,
    max,
    speed,
    busy,
    onRecruit,
}: {
    type: UnitType;
    max: number;
    speed: number;
    busy: boolean;
    onRecruit: (count: number) => void;
}) {
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    const count = Math.max(0, Math.floor(Number(value) || 0));

    return (
        <tr>
            <Td>
                <span className="inline-flex items-center gap-2">
                    <Icon name={`unit.${type}`} />
                    {t(`units.${type}`)}
                </span>
            </Td>
            <Td>
                <ResourceCost resources={UNITS[type].cost} />
            </Td>
            <Td>{formatDuration(recruitTime(type, speed))}</Td>
            <Td>
                <input
                    className="w-22"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
                <Button
                    variant="link"
                    onClick={() => setValue(String(max))}
                >
                    {t('common.max', { count: max })}
                </Button>
            </Td>
            <Td>
                <Button
                    disabled={count < 1 || count > max || busy}
                    onClick={() => {
                        onRecruit(count);
                        setValue('');
                    }}
                >
                    {t('village.recruit')}
                </Button>
            </Td>
        </tr>
    );
}
