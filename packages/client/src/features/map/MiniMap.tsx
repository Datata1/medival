import { continentOf, type MapVillage } from '@medival/shared';
import { useRef } from 'react';
import { MAP_COLORS } from './colors.js';
import { miniWindow } from './derive.js';
import { villageColor } from './MapCanvas.js';
import { ResizableCanvas } from './ResizableCanvas.js';
import { TILE } from './useMapCamera.js';
import type { FrameSize } from './useResizableFrame.js';

/** Kantenlänge eines Dorfes in der Übersicht — mindestens zwei Pixel. */
const DOT = 2;

/** Kontinentgröße in Feldern (`continentOf` teilt in Hunderterblöcke). */
const CONTINENT = 100;

interface MiniScene {
    villages: MapVillage[];
    playerId: number | null;
    mapSize: number;
    /** Gezeigter Ausschnitt der Welt, in Feldern. */
    window: { x0: number; y0: number; span: number };
    /** Der Ausschnitt der Nahansicht, in Feldern. */
    view: { x: number; y: number; width: number; height: number };
}

/** Ausschnitt → Bildpunkte: quadratisch, mittig im Rahmen. */
function fitWindow(width: number, height: number, span: number) {
    const scale = Math.min(width, height) / span;
    return {
        scale,
        left: (width - span * scale) / 2,
        top: (height - span * scale) / 2,
    };
}

function drawMini(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scene: MiniScene | null,
): void {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = MAP_COLORS.outside;
    ctx.fillRect(0, 0, width, height);
    if (!scene) return;

    const { window: win, mapSize } = scene;
    const { scale, left, top } = fitWindow(width, height, win.span);
    const px = (x: number) => left + (x - win.x0) * scale;
    const py = (y: number) => top + (y - win.y0) * scale;

    // Wiese nur, wo Welt ist — jenseits des Rands bleibt der dunkle Ton.
    const x0 = Math.max(0, win.x0);
    const y0 = Math.max(0, win.y0);
    const x1 = Math.min(mapSize, win.x0 + win.span);
    const y1 = Math.min(mapSize, win.y0 + win.span);
    ctx.fillStyle = MAP_COLORS.ground;
    ctx.fillRect(px(x0), py(y0), (x1 - x0) * scale, (y1 - y0) * scale);

    /*
     * Kontinentgrenzen mit Nummer: Im Ausschnitt fehlt sonst jeder Hinweis,
     * wo in der Welt man gerade ist. Die Nummer steht in der oberen linken
     * Ecke jedes Kontinents, der im Ausschnitt beginnt oder ihn ausfüllt.
     */
    ctx.strokeStyle = MAP_COLORS.grid;
    ctx.lineWidth = 1;
    for (
        let c = Math.ceil(x0 / CONTINENT) * CONTINENT;
        c < x1;
        c += CONTINENT
    ) {
        if (c === 0) continue;
        ctx.beginPath();
        ctx.moveTo(px(c), py(y0));
        ctx.lineTo(px(c), py(y1));
        ctx.stroke();
    }
    for (
        let c = Math.ceil(y0 / CONTINENT) * CONTINENT;
        c < y1;
        c += CONTINENT
    ) {
        if (c === 0) continue;
        ctx.beginPath();
        ctx.moveTo(px(x0), py(c));
        ctx.lineTo(px(x1), py(c));
        ctx.stroke();
    }
    if (mapSize > CONTINENT) {
        ctx.fillStyle = MAP_COLORS.label;
        ctx.font = '11px serif';
        ctx.textBaseline = 'top';
        for (
            let cy = Math.floor(y0 / CONTINENT) * CONTINENT;
            cy < y1;
            cy += CONTINENT
        )
            for (
                let cx = Math.floor(x0 / CONTINENT) * CONTINENT;
                cx < x1;
                cx += CONTINENT
            ) {
                const k = String(continentOf(cx, cy)).padStart(2, '0');
                ctx.fillText(
                    `K${k}`,
                    px(Math.max(cx, x0)) + 3,
                    py(Math.max(cy, y0)) + 3,
                );
            }
    }

    // Ein Feld wird bei 100 Feldern auf ~300 px zu ~3 px — Dörfer sind
    // einzeln erkennbar.
    const dot = Math.max(DOT, scale * 0.8);
    for (const village of scene.villages) {
        if (
            village.x < win.x0 ||
            village.y < win.y0 ||
            village.x >= win.x0 + win.span ||
            village.y >= win.y0 + win.span
        )
            continue;
        ctx.fillStyle = villageColor(village, scene.playerId);
        ctx.fillRect(px(village.x), py(village.y), dot, dot);
    }

    /*
     * Der Ausschnittrahmen, wieder zweifarbig: Auf einer Fläche, die je nach
     * Gegend hell (Wiese) oder dunkel (dichte Dörfer) ist, hält nur ein
     * heller Strich mit dunklem Rand überall stand.
     */
    const { view } = scene;
    const box = {
        x: px(view.x - view.width / 2),
        y: py(view.y - view.height / 2),
        w: view.width * scale,
        h: view.height * scale,
    };
    ctx.strokeStyle = MAP_COLORS.viewportEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = MAP_COLORS.viewport;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
}

/**
 * Die Übersichtskarte: ein Ausschnitt von 100×100 Feldern um die Kamera
 * (plans/18-ux/18-3-karte.md, Maßstab seit 19-6).
 *
 * Sie beantwortet die Frage, die die Nahansicht nicht beantworten kann — „was
 * liegt in der Gegend?" — und ist zugleich der schnellste Weg durch sie: ein
 * Klick, und die Nahansicht steht dort. Die ganze Welt auf einmal zu zeigen
 * war bis 500×500 brauchbar; auf 1000×1000 wurde daraus ein Punktehaufen.
 */
export function MiniMap({
    villages,
    playerId,
    mapSize,
    camera,
    nearView,
    size,
    onResized,
    onPick,
    label,
}: {
    villages: MapVillage[];
    /** Mein Spieler — eigene Dörfer in eigener Farbe (19-9). */
    playerId: number | null;
    mapSize: number;
    camera: { x: number; y: number } | null;
    /** Größe der Nahansicht in CSS-Pixeln — daraus wird ihr Ausschnitt. */
    nearView: FrameSize;
    size: FrameSize;
    onResized: (size: FrameSize) => void;
    onPick: (x: number, y: number) => void;
    label: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const win = camera ? miniWindow(camera, mapSize) : null;
    const scene: MiniScene | null =
        camera && win
            ? {
                  villages,
                  playerId,
                  mapSize,
                  window: win,
                  view: {
                      x: camera.x,
                      y: camera.y,
                      width: nearView.width / TILE,
                      height: nearView.height / TILE,
                  },
              }
            : null;

    return (
        <ResizableCanvas
            canvasRef={canvasRef}
            size={size}
            onResized={onResized}
            label={label}
            className="cursor-pointer"
            draw={(ctx, width, height) =>
                drawMini(ctx, width, height, scene)
            }
            onClick={(e) => {
                const canvas = canvasRef.current;
                if (!canvas || !win) return;
                const rect = canvas.getBoundingClientRect();
                const { scale, left, top } = fitWindow(
                    rect.width,
                    rect.height,
                    win.span,
                );
                onPick(
                    win.x0 + (e.clientX - rect.left - left) / scale,
                    win.y0 + (e.clientY - rect.top - top) / scale,
                );
            }}
        />
    );
}
