import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { SpriteId } from '../../assets/registry.js';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { Icon } from '../../components/Icon.js';
import { useStores } from '../../stores/StoreContext.js';
import { MapCanvas, type MapScene } from './MapCanvas.js';
import { MiniMap } from './MiniMap.js';
import { MovementsPanel } from './MovementsPanel.js';
import { TargetPanel } from './TargetPanel.js';
import { useMapCamera } from './useMapCamera.js';
import { useSpriteAtlas } from './useSpriteAtlas.js';

/** Die Sprites, die die Karte zeichnet — Dörfer, Gelände, Bewegungszeichen. */
const MAP_SPRITE_IDS = [
    'map.village.player',
    'map.village.bot',
    'map.village.barbarian',
    'terrain.forest',
    'terrain.hill',
    'terrain.water',
    'icon.attack',
    'icon.support',
    'icon.return',
    'icon.trade',
] as const satisfies readonly SpriteId[];

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

/**
 * Die vier Pfeilknöpfe rund um die Nahansicht, wie in der Vorlage.
 *
 * Sie sind zugleich der Einstieg für die Tastatur: Wer einen von ihnen
 * angesteuert hat, verschiebt die Karte mit allen vier Pfeiltasten. Der
 * Rahmen selbst trägt die Tastenbedienung bewusst nicht — ein `<div>` mit
 * `tabIndex` ist ein Bedienelement, das sich für Screenreader nach nichts
 * anfühlt, während ein Knopf sich ansagt und beschriften lässt.
 */
function PanButton({
    onClick,
    onKeyDown,
    title,
    children,
}: {
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
    title: string;
    children: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            onKeyDown={onKeyDown}
            title={title}
            aria-label={title}
            className="rounded-xs px-2 py-0.5 text-ink-light leading-none hover:bg-parchment-dark hover:text-ink"
        >
            {children}
        </button>
    );
}

export const MapView = observer(function MapView() {
    const { t } = useTranslation();
    const { map, world, village, movements } = useStores();

    const activeVillageId = village.villageId;
    const home =
        activeVillageId === null
            ? undefined
            : map.villageById(activeVillageId);
    const mapSize = world.summary?.settings.mapSize ?? 100;
    const sprites = useSpriteAtlas(MAP_SPRITE_IDS);
    const {
        camera,
        canvasRef,
        handlers,
        pan,
        centerOn,
        reset,
        keyStep,
    } = useMapCamera(home, map.list, mapSize, (target) =>
        map.select(target),
    );

    const scene: MapScene | null = camera
        ? {
              camera,
              villages: map.list,
              movements: movements.movements.value ?? undefined,
              mapSize,
              seed: world.summary?.settings.seed ?? 0,
              gameTime: world.gameTime,
              selectedId: map.selectedVillageId,
              activeVillageId,
              sprites,
          }
        : null;

    /* Die Karte ohne Maus. `preventDefault`, sonst scrollt neben der
     * Verschiebung auch noch die Seite. */
    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        const step: Record<string, [number, number]> = {
            ArrowLeft: [-keyStep, 0],
            ArrowRight: [keyStep, 0],
            ArrowUp: [0, -keyStep],
            ArrowDown: [0, keyStep],
        };
        const move = step[e.key];
        if (!move) return;
        e.preventDefault();
        pan(move[0], move[1]);
    };

    return (
        <div className="flex flex-wrap items-start gap-4">
            <div>
                <div className="grid grid-cols-[auto_1fr_auto] items-center justify-items-center">
                    <span />
                    <PanButton
                        onClick={() => pan(0, -keyStep)}
                        onKeyDown={onKeyDown}
                        title={t('map.panUp')}
                    >
                        ▲
                    </PanButton>
                    <span />
                    <PanButton
                        onClick={() => pan(-keyStep, 0)}
                        onKeyDown={onKeyDown}
                        title={t('map.panLeft')}
                    >
                        ◀
                    </PanButton>
                    <MapCanvas
                        canvasRef={canvasRef}
                        scene={scene}
                        handlers={handlers}
                        size={map.frameSize}
                        onResized={(size) => map.setFrameSize(size)}
                        label={t('map.nearView')}
                    />
                    <PanButton
                        onClick={() => pan(keyStep, 0)}
                        onKeyDown={onKeyDown}
                        title={t('map.panRight')}
                    >
                        ▶
                    </PanButton>
                    <span />
                    <PanButton
                        onClick={() => pan(0, keyStep)}
                        onKeyDown={onKeyDown}
                        title={t('map.panDown')}
                    >
                        ▼
                    </PanButton>
                    <span />
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-2">
                    <Button
                        variant="link"
                        onClick={reset}
                        disabled={!home}
                    >
                        {t('map.toOwnVillage')}
                    </Button>
                    <span className="ml-2">
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
                        <LegendEntry
                            sprite="terrain.forest"
                            label={t('map.legendForest')}
                        />
                        <LegendEntry
                            sprite="terrain.hill"
                            label={t('map.legendHill')}
                        />
                        <LegendEntry
                            sprite="terrain.water"
                            label={t('map.legendWater')}
                        />
                    </span>
                </p>
            </div>
            <div className="min-w-70 flex-1">
                <MiniMap
                    villages={map.list}
                    mapSize={mapSize}
                    camera={camera}
                    nearView={map.frameSize}
                    size={map.miniSize}
                    onResized={(size) => map.setMiniSize(size)}
                    onPick={centerOn}
                    label={t('map.overview')}
                />
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
                    </Card>
                )}
                <MovementsPanel />
            </div>
        </div>
    );
});
