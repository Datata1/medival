import type { MapVillage } from '@medival/shared';
import { useRef } from 'react';
import { MAP_COLORS } from './colors.js';
import { villageColor } from './MapCanvas.js';
import { ResizableCanvas } from './ResizableCanvas.js';
import { TILE } from './useMapCamera.js';
import type { FrameSize } from './useResizableFrame.js';

/** Kantenlänge eines Dorfes in der Übersicht — mindestens zwei Pixel. */
const DOT = 2;

interface MiniScene {
    villages: MapVillage[];
    mapSize: number;
    /** Der Ausschnitt der Nahansicht, in Feldern. */
    view: { x: number; y: number; width: number; height: number };
}

/** Weltkoordinaten → Bildpunkte. Die ganze Welt passt in den Rahmen. */
function fitWorld(width: number, height: number, mapSize: number) {
    const scale = Math.min(width, height) / mapSize;
    return {
        scale,
        left: (width - mapSize * scale) / 2,
        top: (height - mapSize * scale) / 2,
    };
}

function drawMini(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scene: MiniScene | null,
): void {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = MAP_COLORS.ground;
    ctx.fillRect(0, 0, width, height);
    if (!scene) return;

    const { scale, left, top } = fitWorld(width, height, scene.mapSize);

    for (const village of scene.villages) {
        ctx.fillStyle = villageColor(village);
        ctx.fillRect(
            left + village.x * scale,
            top + village.y * scale,
            Math.max(DOT, scale),
            Math.max(DOT, scale),
        );
    }

    /*
     * Der Ausschnittrahmen, wieder zweifarbig: Auf einer Fläche, die je nach
     * Gegend hell (Wiese) oder dunkel (dichte Dörfer) ist, hält nur ein
     * heller Strich mit dunklem Rand überall stand.
     */
    const { view } = scene;
    const box = {
        x: left + (view.x - view.width / 2) * scale,
        y: top + (view.y - view.height / 2) * scale,
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
 * Die Übersichtskarte: die ganze Welt auf einmal, ein bis zwei Pixel je Dorf
 * (plans/18-ux/18-3-karte.md).
 *
 * Sie beantwortet die Frage, die die Nahansicht nicht beantworten kann — „wo
 * bin ich eigentlich?" — und ist zugleich der schnellste Weg quer über die
 * Karte: ein Klick, und die Nahansicht steht dort.
 */
export function MiniMap({
    villages,
    mapSize,
    camera,
    nearView,
    size,
    onResized,
    onPick,
    label,
}: {
    villages: MapVillage[];
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
    const scene: MiniScene | null = camera
        ? {
              villages,
              mapSize,
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
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const { scale, left, top } = fitWorld(
                    rect.width,
                    rect.height,
                    mapSize,
                );
                onPick(
                    (e.clientX - rect.left - left) / scale,
                    (e.clientY - rect.top - top) / scale,
                );
            }}
        />
    );
}
