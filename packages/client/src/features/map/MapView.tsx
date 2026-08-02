import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { SpriteId } from '../../assets/registry.js';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { useStores } from '../../stores/StoreContext.js';
import { MapCanvas } from './MapCanvas.js';
import { MovementsPanel } from './MovementsPanel.js';
import { TargetPanel } from './TargetPanel.js';
import { useMapCamera } from './useMapCamera.js';
import { useSpriteAtlas } from './useSpriteAtlas.js';

/** Die Legende zeigt genau die Sprites, die auch auf der Karte stehen. */
function LegendEntry({
    sprite,
    label,
}: {
    sprite: SpriteId;
    label: string;
}) {
    return (
        <span className="mr-3 inline-flex items-center gap-1.5">
            <Icon name={sprite} /> {label}
        </span>
    );
}

/** Die Sprites, die die Karte zeichnet. */
const MAP_SPRITE_IDS = [
    'map.village.player',
    'map.village.bot',
    'map.village.barbarian',
] as const;

export const MapView = observer(function MapView() {
    const { t } = useTranslation();
    const { map, world, village, movements } = useStores();

    const activeVillageId = village.villageId;
    const home =
        activeVillageId === null
            ? undefined
            : map.villageById(activeVillageId);
    const sprites = useSpriteAtlas(MAP_SPRITE_IDS);
    const { camera, canvasRef, handlers } = useMapCamera(
        home,
        map.list,
        (target) => map.select(target),
    );

    return (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
            <MapCanvas
                canvasRef={canvasRef}
                camera={camera}
                villages={map.list}
                movements={movements.movements.value ?? undefined}
                mapSize={world.summary?.settings.mapSize ?? 100}
                selectedId={map.selectedVillageId}
                activeVillageId={activeVillageId}
                handlers={handlers}
                sprites={sprites}
            />
            <div>
                {map.selected && activeVillageId !== null ? (
                    <TargetPanel
                        target={map.selected}
                        home={home}
                        activeVillageId={activeVillageId}
                        worldId={world.summary?.id ?? 0}
                    />
                ) : (
                    <Card>
                        <h2>{t('map.title')}</h2>
                        <p className="text-ink-light">
                            {t('map.hint')}
                        </p>
                        <p className="mt-2">
                            <LegendEntry
                                sprite="map.village.player"
                                label={t('map.legendYou')}
                            />
                            <LegendEntry
                                sprite="map.village.bot"
                                label={t('map.legendBots')}
                            />
                            <LegendEntry
                                sprite="map.village.barbarian"
                                label={t('map.legendBarbarians')}
                            />
                        </p>
                    </Card>
                )}
                <MovementsPanel />
            </div>
        </div>
    );
});
