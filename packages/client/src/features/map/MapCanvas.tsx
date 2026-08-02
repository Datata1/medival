import {
    type MapVillage,
    type MovementsResponse,
    PLAYER_ID,
} from '@medival/shared';
import { type RefObject, useEffect } from 'react';
import type { Camera, MapCameraHandlers } from './useMapCamera.js';
import type { LoadedSprites } from './useSpriteAtlas.js';

/**
 * Kartenfarben. Sie leben hier statt im CSS-Theme, weil Canvas keine
 * CSS-Variablen kennt — abgestimmt auf die Palette aus plans/11.
 */
export const MAP_COLORS = {
    ground: '#241a10', // timber
    grid: 'rgba(242, 230, 208, 0.07)', // Pergament, sehr schwach
    own: '#c8973f', // Blattgold, hell genug zum Leuchten
    enemy: '#a8392a', // Siegelrot, auf dunklem Grund aufgehellt
    barbarian: '#8a7f6a', // stumpfes Grau-Braun
    activeOutline: '#f2e6d0', // Pergament
    selectedOutline: '#7fb8d4',
    label: 'rgba(242, 230, 208, 0.8)',
} as const;

/** Pure canvas rendering: draws grid, movement lines and villages from props. */
export function MapCanvas({
    canvasRef,
    camera,
    villages,
    movements,
    mapSize,
    selectedId,
    activeVillageId,
    handlers,
    sprites,
}: {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    camera: Camera | null;
    villages: MapVillage[] | undefined;
    movements: MovementsResponse | undefined;
    mapSize: number;
    selectedId: number | null;
    activeVillageId: number | null;
    handlers: MapCameraHandlers;
    sprites: LoadedSprites;
}) {
    // Canvas is an external imperative system — synchronizing via an effect is the intended use.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !camera || !villages) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height } = canvas;
        const px = (wx: number) =>
            width / 2 + (wx - camera.x) * camera.zoom;
        const py = (wy: number) =>
            height / 2 + (wy - camera.y) * camera.zoom;

        // Dunkler Grund als Gegenpol zum Pergament (plans/11): Dörfer leuchten
        // darauf, und die Karte hebt sich klar vom Blatt ab.
        // Ohne das verwaschen die Pixel beim Hineinzoomen zu Matsch.
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = MAP_COLORS.ground;
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = MAP_COLORS.grid;
        ctx.lineWidth = 1;
        for (let gx = 0; gx <= mapSize; gx++) {
            const x = px(gx - 0.5);
            if (x < 0 || x > width) continue;
            ctx.beginPath();
            ctx.moveTo(x, py(-0.5));
            ctx.lineTo(x, py(mapSize - 0.5));
            ctx.stroke();
        }
        for (let gy = 0; gy <= mapSize; gy++) {
            const y = py(gy - 0.5);
            if (y < 0 || y > height) continue;
            ctx.beginPath();
            ctx.moveTo(px(-0.5), y);
            ctx.lineTo(px(mapSize - 0.5), y);
            ctx.stroke();
        }

        // Movement lines (player-related)
        const all = [
            ...(movements?.outgoing ?? []),
            ...(movements?.incoming ?? []),
        ];
        for (const m of all) {
            if (!m.origin || !m.target) continue;
            const isIncoming = movements?.incoming.includes(m) ?? false;
            ctx.strokeStyle = isIncoming
                ? 'rgba(220,80,60,0.65)'
                : 'rgba(200,151,63,0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px(m.origin.x), py(m.origin.y));
            ctx.lineTo(px(m.target.x), py(m.target.y));
            ctx.stroke();
        }

        // Villages
        const half = Math.max(3, camera.zoom * 0.36);
        for (const v of villages) {
            const x = px(v.x);
            const y = py(v.y);
            if (x < -20 || x > width + 20 || y < -20 || y > height + 20)
                continue;
            const spriteId =
                v.playerId === PLAYER_ID
                    ? 'map.village.player'
                    : v.playerId === null
                      ? 'map.village.barbarian'
                      : 'map.village.bot';
            const sprite = sprites[spriteId];
            if (sprite) {
                ctx.drawImage(
                    sprite,
                    x - half,
                    y - half,
                    half * 2,
                    half * 2,
                );
            } else {
                // Fällt ein Sprite aus, bleibt die Karte lesbar statt leer.
                ctx.fillStyle =
                    v.playerId === PLAYER_ID
                        ? MAP_COLORS.own
                        : v.playerId === null
                          ? MAP_COLORS.barbarian
                          : MAP_COLORS.enemy;
                ctx.fillRect(x - half, y - half, half * 2, half * 2);
            }
            if (v.id === selectedId || v.id === activeVillageId) {
                ctx.strokeStyle =
                    v.id === activeVillageId
                        ? MAP_COLORS.activeOutline
                        : MAP_COLORS.selectedOutline;
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    x - half - 2,
                    y - half - 2,
                    half * 2 + 4,
                    half * 2 + 4,
                );
            }
            if (camera.zoom >= 18) {
                ctx.fillStyle = MAP_COLORS.label;
                ctx.font = '11px "EB Garamond", Georgia, serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${v.x}|${v.y}`, x, y + half + 11);
            }
        }
    }, [
        canvasRef,
        camera,
        villages,
        movements,
        mapSize,
        selectedId,
        activeVillageId,
        sprites,
    ]);

    return (
        <canvas
            ref={canvasRef}
            width={720}
            height={560}
            className="w-full cursor-grab touch-none rounded-xs border-2 border-oak active:cursor-grabbing"
            {...handlers}
        />
    );
}
