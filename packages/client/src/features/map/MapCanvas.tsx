import {
    type GameTimeLike,
    type MapVillage,
    type MovementsResponse,
    terrainAt,
} from '@medival/shared';
import type { RefObject } from 'react';
import { MAP_COLORS } from './colors.js';
import {
    KIND_ICONS,
    movementLines,
    movementProgress,
    TERRAIN_SPRITES,
} from './derive.js';
import { ResizableCanvas } from './ResizableCanvas.js';
import type { MapCameraHandlers } from './useMapCamera.js';
import { TILE } from './useMapCamera.js';
import type { FrameSize } from './useResizableFrame.js';
import type { LoadedSprites } from './useSpriteAtlas.js';

/** Dorfsprites sind 32 px und werden 1:1 gezeichnet — verkleinert fransen sie. */
const VILLAGE_SPRITE = 32;
/** Das Zeichen einer unterwegs befindlichen Truppe. */
const MARKER_SPRITE = 16;

export interface MapScene {
    camera: { x: number; y: number };
    villages: MapVillage[];
    movements: MovementsResponse | undefined;
    mapSize: number;
    seed: number;
    gameTime: GameTimeLike;
    selectedId: number | null;
    activeVillageId: number | null;
    /** Mein Spieler — eigene Dörfer werden anders gezeichnet (19-9). */
    playerId: number | null;
    sprites: LoadedSprites;
}

/** Die Farbe eines Dorfes nach Besitzer — auch die Übersichtskarte färbt so. */
export function villageColor(
    village: MapVillage,
    ownPlayerId: number | null,
): string {
    if (ownPlayerId !== null && village.playerId === ownPlayerId)
        return MAP_COLORS.own;
    return village.playerId === null
        ? MAP_COLORS.barbarian
        : MAP_COLORS.enemy;
}

/**
 * Ein zweifarbiger Ring: außen dunkel, innen hell. Der dunkle Rand trägt den
 * Kontrast zur hellen Wiese, der helle Kern macht den Ring erkennbar.
 */
function ring(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    core: string,
    edge: string,
): void {
    const half = VILLAGE_SPRITE / 2 + 3;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 4;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.strokeStyle = core;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
}

/**
 * Zeichnet die Nahansicht. Reine Funktion auf dem Kontext — alles, was sie
 * braucht, steht in `scene`.
 */
function drawScene(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scene: MapScene,
): void {
    const { camera, mapSize } = scene;
    const px = (wx: number) => width / 2 + (wx - camera.x) * TILE;
    const py = (wy: number) => height / 2 + (wy - camera.y) * TILE;
    /* Auf halbe Pixel gesetzt: Eine 1 px breite Linie auf einer ganzen
     * Koordinate deckt zwei halbe Pixel ab und wird grau statt scharf. */
    const crisp = (v: number) => Math.floor(v) + 0.5;

    // Erst die Fläche jenseits der Welt, dann die Welt darüber — so ist der
    // Rand ohne eine einzige Linie sichtbar.
    ctx.fillStyle = MAP_COLORS.outside;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = MAP_COLORS.ground;
    ctx.fillRect(px(-0.5), py(-0.5), mapSize * TILE, mapSize * TILE);

    // Sichtbarer Ausschnitt in Feldern, auf die Welt beschnitten.
    const first = (center: number, extent: number) =>
        Math.max(0, Math.floor(center - extent / (2 * TILE)) - 1);
    const last = (center: number, extent: number) =>
        Math.min(
            mapSize - 1,
            Math.ceil(center + extent / (2 * TILE)) + 1,
        );
    const fromX = first(camera.x, width);
    const toX = last(camera.x, width);
    const fromY = first(camera.y, height);
    const toY = last(camera.y, height);

    /*
     * Gelände. Auf einem belegten Feld wird nie welches gezeichnet: Dörfer
     * aus Welten von vor diesem Ticket stehen dort, wo der Zufall sie
     * hingesetzt hat, notfalls mitten im See. So sehen auch alte Spielstände
     * stimmig aus, ohne dass etwas migriert werden müsste.
     */
    const occupied = new Set(
        scene.villages.map((v) => `${v.x},${v.y}`),
    );
    for (let y = fromY; y <= toY; y++) {
        for (let x = fromX; x <= toX; x++) {
            if (occupied.has(`${x},${y}`)) continue;
            const id = TERRAIN_SPRITES[terrainAt(scene.seed, x, y)];
            const sprite = id === null ? undefined : scene.sprites[id];
            if (!sprite) continue;
            ctx.drawImage(
                sprite,
                px(x) - TILE / 2,
                py(y) - TILE / 2,
                TILE,
                TILE,
            );
        }
    }

    // Feldraster
    ctx.strokeStyle = MAP_COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = fromX; x <= toX + 1; x++) {
        const at = crisp(px(x - 0.5));
        ctx.moveTo(at, crisp(py(fromY - 0.5)));
        ctx.lineTo(at, crisp(py(toY + 0.5)));
    }
    for (let y = fromY; y <= toY + 1; y++) {
        const at = crisp(py(y - 0.5));
        ctx.moveTo(crisp(px(fromX - 0.5)), at);
        ctx.lineTo(crisp(px(toX + 0.5)), at);
    }
    ctx.stroke();

    drawMovements(ctx, scene, px, py);
    drawVillages(ctx, scene, px, py, width, height);
}

function drawMovements(
    ctx: CanvasRenderingContext2D,
    scene: MapScene,
    px: (x: number) => number,
    py: (y: number) => number,
): void {
    for (const { movement, incoming } of movementLines(
        scene.movements,
    )) {
        const { origin, target } = movement;
        if (!origin || !target) continue;
        const color = incoming
            ? MAP_COLORS.movementIncoming
            : MAP_COLORS.movementOutgoing;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px(origin.x), py(origin.y));
        ctx.lineTo(px(target.x), py(target.y));
        ctx.stroke();

        // Der Marker sitzt dort, wo die Truppe gerade steht.
        const done = movementProgress(movement, scene.gameTime);
        const x = px(origin.x + (target.x - origin.x) * done);
        const y = py(origin.y + (target.y - origin.y) * done);
        const sprite = scene.sprites[KIND_ICONS[movement.kind]];
        // Eine Scheibe unter dem Zeichen: Die Icons sind für Pergament
        // gezeichnet und gehen auf der Wiese sonst unter.
        ctx.fillStyle = MAP_COLORS.labelHalo;
        ctx.beginPath();
        ctx.arc(x, y, MARKER_SPRITE * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (sprite) {
            ctx.drawImage(
                sprite,
                x - MARKER_SPRITE / 2,
                y - MARKER_SPRITE / 2,
                MARKER_SPRITE,
                MARKER_SPRITE,
            );
        }
    }
}

function drawVillages(
    ctx: CanvasRenderingContext2D,
    scene: MapScene,
    px: (x: number) => number,
    py: (y: number) => number,
    width: number,
    height: number,
): void {
    const half = VILLAGE_SPRITE / 2;
    ctx.font = '12px "EB Garamond", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';

    for (const village of scene.villages) {
        const x = px(village.x);
        const y = py(village.y);
        if (
            x < -TILE ||
            x > width + TILE ||
            y < -TILE ||
            y > height + TILE
        )
            continue;

        const spriteId =
            scene.playerId !== null &&
            village.playerId === scene.playerId
                ? 'map.village.player'
                : village.playerId === null
                  ? 'map.village.barbarian'
                  : 'map.village.bot';
        const sprite = scene.sprites[spriteId];
        if (sprite) {
            ctx.drawImage(
                sprite,
                x - half,
                y - half,
                VILLAGE_SPRITE,
                VILLAGE_SPRITE,
            );
        } else {
            // Fällt ein Sprite aus, bleibt die Karte lesbar statt leer.
            ctx.fillStyle = villageColor(village, scene.playerId);
            ctx.fillRect(
                x - half,
                y - half,
                VILLAGE_SPRITE,
                VILLAGE_SPRITE,
            );
        }

        if (village.id === scene.activeVillageId) {
            ring(
                ctx,
                x,
                y,
                MAP_COLORS.activeOutline,
                MAP_COLORS.activeOutlineEdge,
            );
        } else if (village.id === scene.selectedId) {
            ring(
                ctx,
                x,
                y,
                MAP_COLORS.selectedOutline,
                MAP_COLORS.activeOutlineEdge,
            );
        }

        /*
         * Der Name, nicht die Koordinaten: „Ragnars Dorf" sagt mehr als
         * „357|368", und die Koordinaten stehen daneben in der Zielleiste.
         * Die helle Aura hält ihn auch über einem Wald lesbar.
         */
        const label = village.name;
        const baseline = y + half + 12;
        ctx.strokeStyle = MAP_COLORS.labelHalo;
        ctx.lineWidth = 3;
        ctx.strokeText(label, x, baseline);
        ctx.fillStyle = MAP_COLORS.label;
        ctx.fillText(label, x, baseline);
    }
}

/** Die Nahansicht: ein ziehbarer Rahmen mit fester Feldgröße. */
export function MapCanvas({
    canvasRef,
    scene,
    handlers,
    size,
    onResized,
    label,
}: {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    scene: MapScene | null;
    handlers: MapCameraHandlers;
    size: FrameSize;
    onResized: (size: FrameSize) => void;
    label: string;
}) {
    return (
        <ResizableCanvas
            canvasRef={canvasRef}
            size={size}
            onResized={onResized}
            label={label}
            className="cursor-grab active:cursor-grabbing"
            draw={(ctx, width, height) => {
                if (scene) {
                    drawScene(ctx, width, height, scene);
                    return;
                }
                ctx.fillStyle = MAP_COLORS.ground;
                ctx.fillRect(0, 0, width, height);
            }}
            {...handlers}
        />
    );
}
