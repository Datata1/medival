import type { MapVillage } from '@medival/shared';
import { type RefObject, useRef, useState } from 'react';

export interface Camera {
    x: number; // world coord at canvas center
    y: number;
    zoom: number; // pixels per field
}

export interface MapCameraHandlers {
    onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
    onMouseLeave: () => void;
    onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
}

/** Pan/zoom/click-hit-test state for the map canvas. */
export function useMapCamera(
    home: MapVillage | undefined,
    villages: MapVillage[] | undefined,
    onSelect: (village: MapVillage | null) => void,
): {
    camera: Camera | null;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    handlers: MapCameraHandlers;
} {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // User pan/zoom overrides the derived default; until then the camera
    // simply follows the home village (derived during render, no effect).
    const [override, setOverride] = useState<Camera | null>(null);
    const camera =
        override ?? (home ? { x: home.x, y: home.y, zoom: 22 } : null);
    const dragging = useRef<{
        startX: number;
        startY: number;
        camX: number;
        camY: number;
    } | null>(null);

    const toWorld = (
        canvas: HTMLCanvasElement,
        cam: Camera,
        clientX: number,
        clientY: number,
    ) => {
        const rect = canvas.getBoundingClientRect();
        const cx = ((clientX - rect.left) / rect.width) * canvas.width;
        const cy = ((clientY - rect.top) / rect.height) * canvas.height;
        return {
            x: cam.x + (cx - canvas.width / 2) / cam.zoom,
            y: cam.y + (cy - canvas.height / 2) / cam.zoom,
        };
    };

    const handlers: MapCameraHandlers = {
        onMouseDown: (e) => {
            if (!camera) return;
            dragging.current = {
                startX: e.clientX,
                startY: e.clientY,
                camX: camera.x,
                camY: camera.y,
            };
        },
        onMouseMove: (e) => {
            const d = dragging.current;
            if (!d || !camera || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const scale = canvasRef.current.width / rect.width;
            setOverride({
                ...camera,
                x:
                    d.camX -
                    ((e.clientX - d.startX) * scale) / camera.zoom,
                y:
                    d.camY -
                    ((e.clientY - d.startY) * scale) / camera.zoom,
            });
        },
        onMouseUp: (e) => {
            const d = dragging.current;
            dragging.current = null;
            const canvas = canvasRef.current;
            if (!d || !camera || !villages || !canvas) return;
            const moved = Math.hypot(
                e.clientX - d.startX,
                e.clientY - d.startY,
            );
            if (moved > 5) return; // was a drag, not a click
            const w = toWorld(canvas, camera, e.clientX, e.clientY);
            const hit = villages.find(
                (v) =>
                    Math.abs(v.x - w.x) < 0.5 &&
                    Math.abs(v.y - w.y) < 0.5,
            );
            onSelect(hit ?? null);
        },
        onMouseLeave: () => {
            dragging.current = null;
        },
        onWheel: (e) => {
            if (!camera) return;
            const zoom = Math.min(
                48,
                Math.max(
                    6,
                    camera.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2),
                ),
            );
            setOverride({ ...camera, zoom });
        },
    };

    return { camera, canvasRef, handlers };
}
