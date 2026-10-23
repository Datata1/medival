import type { BuildingType } from '@medival/shared';
import {
    farmCapacity,
    hiddenCapacity,
    marketCapacity,
    merchantCount,
    resourceRatePerHour,
    WALL_BASE_DEFENSE_PER_LEVEL,
    WALL_DEFENSE_FACTOR_PER_LEVEL,
    warehouseCapacity,
} from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { formatNumber } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';
import { SendResourcesForm } from '../map/SendResourcesForm.js';
import { BuildingsTable } from './BuildingsTable.js';
import { effectiveLevels, liveResources } from './derive.js';
import { RecruitTable } from './RecruitTable.js';
import { ResearchTable } from './ResearchTable.js';
import { TargetPicker } from './TargetPicker.js';

/** Höchstzahl offener Bauaufträge — der Server lehnt den sechsten ab. */
const _QUEUE_LIMIT = 5;

/**
 * Was ein Gebäude auf einer bestimmten Stufe leistet.
 *
 * Die Zahlen stammen aus denselben Funktionen, nach denen der Server rechnet —
 * eine hier abgeschriebene Formel wäre nach der ersten Balance-Änderung falsch.
 *
 * Jeder Fall nennt seinen Schlüssel ausdrücklich statt
 * `t(`…effect.${type}`, params)`: Die Texte haben unterschiedliche Platzhalter,
 * und nur so prüft der Compiler, dass jeder von ihnen bedient wird.
 */
function Effect({
    type,
    level,
    speed,
}: {
    type: BuildingType;
    level: number;
    speed: number;
}) {
    const { t } = useTranslation();
    switch (type) {
        case 'headquarters':
            // Jede Stufe kürzt die Bauzeit um 4 % (multiplikativ).
            return t('village.building.effect.headquarters', {
                percent: Math.round((1 - 0.96 ** level) * 100),
            });
        case 'timber_camp':
            return t('village.building.effect.timber_camp', {
                amount: formatNumber(resourceRatePerHour(level, speed)),
            });
        case 'clay_pit':
            return t('village.building.effect.clay_pit', {
                amount: formatNumber(resourceRatePerHour(level, speed)),
            });
        case 'iron_mine':
            return t('village.building.effect.iron_mine', {
                amount: formatNumber(resourceRatePerHour(level, speed)),
            });
        case 'warehouse':
            return t('village.building.effect.warehouse', {
                amount: formatNumber(warehouseCapacity(level)),
            });
        case 'farm':
            return t('village.building.effect.farm', {
                amount: formatNumber(farmCapacity(level)),
            });
        case 'wall':
            return t('village.building.effect.wall', {
                percent: Math.round(
                    WALL_DEFENSE_FACTOR_PER_LEVEL * level * 100,
                ),
                flat: formatNumber(WALL_BASE_DEFENSE_PER_LEVEL * level),
            });
        case 'market':
            return t('village.building.effect.market', {
                merchants: merchantCount(level),
                capacity: formatNumber(marketCapacity(level)),
            });
        case 'barracks':
            return t('village.building.effect.barracks');
        case 'stable':
            return t('village.building.effect.stable');
        case 'workshop':
            return t('village.building.effect.workshop');
        case 'academy':
            return t('village.building.effect.academy');
        case 'smithy':
            return t('village.building.effect.smithy');
        case 'rally_point':
            return t('village.building.effect.rally_point');
        case 'hiding_place':
            return t('village.building.effect.hiding_place', {
                amount: formatNumber(hiddenCapacity(level)),
            });
    }
}

/**
 * Der Kopf einer Gebäudeseite: Name, Stufe, was das Gebäude leistet.
 *
 * **Ohne Ausbauteil.** Kosten, Bauzeit und Bau-Knopf stehen ausschließlich im
 * Hauptgebäude — dort steht die ganze Liste, und man erteilt Aufträge ohnehin
 * mehrere hintereinander. Hier stünde dieselbe Handlung ein zweites Mal, mit
 * einer zweiten Stelle, an der Schleifengrenze, Voraussetzungen und Fehlerfall
 * stimmen müssten.
 */
function BuildingHeader({
    type,
    level,
    speed,
    numericEffect,
}: {
    type: BuildingType;
    level: number;
    speed: number;
    /** Kaserne, Stall und Adelshof wirken nicht in Zahlen, sondern schalten
     *  Einheiten frei — ihre Wirkung steht schon in der Beschreibung. */
    numericEffect: boolean;
}) {
    const { t } = useTranslation();
    return (
        <Card>
            <h1 className="flex items-center gap-2">
                <Icon name={`yard.${type}`} size={32} />
                {t(`buildings.${type}`)}
            </h1>
            <p className="m-0 text-ink-light">
                {level > 0
                    ? t('village.building.level', { level })
                    : t('village.building.notBuilt')}{' '}
                · {t(`handbook.effect.${type}`)}
            </p>
            {level > 0 && numericEffect && (
                // Was das Gebäude **jetzt** leistet — kein Ausblick auf die
                // nächste Stufe, den gibt es im Hauptgebäude.
                <p className="m-0">
                    <Effect type={type} level={level} speed={speed} />
                </p>
            )}
        </Card>
    );
}

/**
 * Die Seite eines Gebäudes (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Oben für alle gleich: Name, Stufe, Wirkung. Darunter das, was nur dieses
 * Gebäude kann.
 *
 * Das Hauptgebäude trägt zusätzlich die Bauübersicht — **nur** sie. Bewegungen
 * stehen auf dem Versammlungsplatz, Truppen schickt man von der Karte.
 */
export const BuildingView = observer(function BuildingView({
    building,
}: {
    building: BuildingType;
}) {
    const { t } = useTranslation();
    const { village, world } = useStores();
    const view = village.view;

    if (!view)
        return <p className="text-ink-light">{t('village.loading')}</p>;

    const speed = world.summary?.settings.speed ?? 1;
    const level = view.buildings[building];
    const live = liveResources(view, world.gameTime);

    const recruits =
        building === 'barracks' ||
        building === 'stable' ||
        building === 'workshop' ||
        building === 'academy';

    return (
        <div>
            <BuildingHeader
                type={building}
                level={level}
                speed={speed}
                // Schmiede und Versammlungsplatz wirken wie die Kaserne nicht
                // in Zahlen; ihre Wirkung steht schon in der Beschreibung.
                numericEffect={
                    !recruits &&
                    building !== 'smithy' &&
                    building !== 'rally_point'
                }
            />

            {recruits && level > 0 && (
                <RecruitTable
                    building={building}
                    village={view}
                    live={live}
                    speed={speed}
                    enabledUnits={world.enabledUnits}
                    busy={village.isRecruiting}
                    error={village.recruitError}
                    onRecruit={(unit, count) =>
                        void village.recruit(unit, count)
                    }
                />
            )}

            {building === 'smithy' && level > 0 && (
                <ResearchTable
                    village={view}
                    live={live}
                    speed={speed}
                    enabledUnits={world.enabledUnits}
                    busy={village.isResearching}
                    error={village.researchError}
                    onResearch={(unit) => void village.research(unit)}
                />
            )}

            {building === 'market' && level > 0 && (
                <Card>
                    <h2>{t('map.shipTitle')}</h2>
                    <TargetPicker>
                        {(target, home) => (
                            <SendResourcesForm
                                originVillageId={view.id}
                                home={home}
                                target={target}
                            />
                        )}
                    </TargetPicker>
                </Card>
            )}

            {/*
             * Alle Gebäude an einem Ort — auch die gesperrten, mit dem, was
             * ihnen fehlt. Die Tabelle war zwischenzeitlich ganz verschwunden;
             * das hieß, für jeden Ausbau erst das Gebäude anzusteuern, und ein
             * Bauauftrag ist die häufigste Handlung im Spiel.
             */}
            {building === 'headquarters' && (
                <BuildingsTable
                    village={view}
                    live={live}
                    effLevels={effectiveLevels(view)}
                    speed={speed}
                    worldId={world.worldId ?? 0}
                    onBuild={(type) => void village.build(type)}
                    busy={village.isBuilding}
                    error={village.buildError}
                />
            )}
        </div>
    );
});
