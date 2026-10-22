import { type RefObject, useEffect, useRef } from 'react';
import {
    type FrameSize,
    useDevicePixelRatio,
    useResizableFrame,
} from './useResizableFrame.js';

/** Zeichnet auf eine Fläche der Größe `width`×`height` in CSS-Pixeln. */
export type DrawFn = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
) => void;

/**
 * Ein Canvas in einem an der Ecke ziehbaren Rahmen.
 *
 * Der gemeinsame Unterbau von Nahansicht und Übersichtskarte: Rahmengröße,
 * Auflösung und Neuzeichnen. Beide Karten liefern nur noch ihr `draw`.
 *
 * **Die Größe ersetzt den Zoom** (plans/18-ux/18-3-karte.md). „Ich will mehr
 * sehen" wurde vorher mit „dann wird alles kleiner" beantwortet; jetzt wird
 * das Fenster größer und die Felder behalten ihre Kantenlänge.
 *
 * Die Höhe ist gedeckelt, damit kein Zug an der Ecke der Seite eine
 * Bildlaufleiste verpasst — die beiden Leisten aus 18-1 kleben oben, ein
 * scrollender Rahmen darunter wäre der schlechteste Kompromiss aus beidem.
 */
export function ResizableCanvas({
    canvasRef,
    size,
    onResized,
    draw,
    label,
    className = '',
    ...pointer
}: {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    size: FrameSize;
    onResized: (size: FrameSize) => void;
    draw: DrawFn;
    /** Beschriftung der Zeichenfläche für Screenreader. */
    label: string;
    className?: string;
    onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel?: (
        e: React.PointerEvent<HTMLCanvasElement>,
    ) => void;
    onClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const view = useResizableFrame(frameRef, onResized);
    const scale = useDevicePixelRatio();

    // Canvas ist ein äußeres, imperatives System — der Abgleich über einen
    // Effect ist genau der vorgesehene Fall (Plan 06). Es gibt bewusst keine
    // Abhängigkeitsliste: Gezeichnet wird bei jedem Rendern, und gerendert
    // wird, wenn sich die beobachteten Daten geändert haben.
    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx || view.width === 0 || view.height === 0) return;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.imageSmoothingEnabled = false;
        draw(ctx, view.width, view.height);
    });

    return (
        <div
            ref={frameRef}
            style={{
                width: size.width,
                height: size.height,
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 12rem)',
            }}
            className={`resize overflow-hidden rounded-xs border-2 border-oak ${className}`}
        >
            <canvas
                ref={canvasRef}
                aria-label={label}
                width={Math.round(view.width * scale)}
                height={Math.round(view.height * scale)}
                className="block h-full w-full touch-none"
                {...pointer}
            />
        </div>
    );
}
