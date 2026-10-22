import type { MapVillage } from '@medival/shared';
import { type RefObject, useRef, useState } from 'react';

/**
 * Feste Kantenlänge eines Feldes in der Nahansicht, in CSS-Pixeln.
 *
 * Der Zoom ist entfallen (plans/18-ux/18-3-karte.md). Er hatte drei Probleme
 * auf einmal: Er verankerte an der Bildmitte statt am Zeiger, sodass der Punkt
 * unter der Maus wegwanderte; er ließ die Karte bei 6 px/Feld zu einem
 * Punktehaufen werden; und er beantwortete die Frage „ich will mehr sehen"
 * mit „dann wird alles kleiner". Diese Frage beantwortet jetzt der ziehbare
 * Rahmen.
 */
export const TILE = 40;

/** Ein Tastendruck verschiebt um so viele Felder. */
const KEY_STEP = 2;

export interface Camera {
    /** Weltkoordinate in der Mitte der Zeichenfläche. */
    x: number;
    y: number;
}

export interface MapCameraHandlers {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}

export interface MapCamera {
    camera: Camera | null;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    handlers: MapCameraHandlers;
    /** Verschiebt um Felder — Pfeilknöpfe und Pfeiltasten. */
    pan: (dx: number, dy: number) => void;
    /** Springt auf eine Weltkoordinate — Übersichtskarte und „Zum eigenen Dorf". */
    centerOn: (x: number, y: number) => void;
    /** Zurück zum abgeleiteten Standard, also zum aktiven Dorf. */
    reset: () => void;
    keyStep: number;
}

/**
 * Verschieben und Treffertest der Nahansicht.
 *
 * `onPointerDown` statt `onMouseDown`: Pointer-Events decken Maus, Stift und
 * Finger mit demselben Code ab — vorher war die Karte auf einem Tablet
 * unbedienbar. `setPointerCapture` hält das Ziehen fest, auch wenn der Zeiger
 * die Zeichenfläche verlässt.
 */
export function useMapCamera(
    home: MapVillage | undefined,
    villages: MapVillage[] | undefined,
    mapSize: number,
    onSelect: (village: MapVillage | null) => void,
): MapCamera {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // Erst die eigene Wahl, sonst folgt die Kamera dem aktiven Dorf (abgeleitet
    // beim Rendern, ohne Effect).
    const [override, setOverride] = useState<Camera | null>(null);
    const camera = override ?? (home ? { x: home.x, y: home.y } : null);

    /*
     * Die Mitte bleibt auf der Karte. Ohne diese Schranke landet man nach
     * ein paar Zügen in einer leeren grünen Fläche, aus der kein Weg
     * zurückführt außer „Zum eigenen Dorf" — und die Übersichtskarte zeigt
     * einen Ausschnittrahmen, der gar nicht mehr in der Welt liegt.
     */
    const clamped = (x: number, y: number): Camera => ({
        x: Math.min(mapSize - 1, Math.max(0, x)),
        y: Math.min(mapSize - 1, Math.max(0, y)),
    });
    const dragging = useRef<{
        startX: number;
        startY: number;
        camX: number;
        camY: number;
        moved: number;
    } | null>(null);

    /** Zeigerposition → Weltkoordinate. */
    const toWorld = (
        canvas: HTMLCanvasElement,
        cam: Camera,
        clientX: number,
        clientY: number,
    ) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: cam.x + (clientX - rect.left - rect.width / 2) / TILE,
            y: cam.y + (clientY - rect.top - rect.height / 2) / TILE,
        };
    };

    const handlers: MapCameraHandlers = {
        onPointerDown: (e) => {
            if (!camera) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = {
                startX: e.clientX,
                startY: e.clientY,
                camX: camera.x,
                camY: camera.y,
                moved: 0,
            };
        },
        onPointerMove: (e) => {
            const drag = dragging.current;
            if (!drag || !camera) return;
            const dx = e.clientX - drag.startX;
            const dy = e.clientY - drag.startY;
            drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
            setOverride(
                clamped(drag.camX - dx / TILE, drag.camY - dy / TILE),
            );
        },
        onPointerUp: (e) => {
            const drag = dragging.current;
            dragging.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
            const canvas = canvasRef.current;
            if (!drag || !camera || !villages || !canvas) return;
            // Fünf Pixel Toleranz: Ein Klick ist nie ganz ruhig, ein Zug darf
            // aber nicht versehentlich ein Dorf auswählen.
            if (drag.moved > 5) return;
            const world = toWorld(canvas, camera, e.clientX, e.clientY);
            const hit = villages.find(
                (v) =>
                    Math.abs(v.x - world.x) < 0.5 &&
                    Math.abs(v.y - world.y) < 0.5,
            );
            onSelect(hit ?? null);
        },
        onPointerCancel: () => {
            dragging.current = null;
        },
    };

    return {
        camera,
        canvasRef,
        handlers,
        pan: (dx, dy) => {
            if (camera)
                setOverride(clamped(camera.x + dx, camera.y + dy));
        },
        centerOn: (x, y) => setOverride(clamped(x, y)),
        reset: () => setOverride(null),
        keyStep: KEY_STEP,
    };
}
