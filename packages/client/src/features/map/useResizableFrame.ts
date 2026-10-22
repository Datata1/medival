import { type RefObject, useEffect, useRef, useState } from 'react';

export interface FrameSize {
    width: number;
    height: number;
}

/**
 * Beobachtet einen in der Größe veränderbaren Rahmen.
 *
 * Hintergrund (plans/18-ux/18-3-karte.md): Der Canvas hing auf `width={720}
 * height={560}` und wurde per CSS auf die volle Breite gestreckt. Der
 * Backing-Store hatte damit ein anderes Seitenverhältnis als die Fläche, auf
 * der er landete — die Pixel waren nicht quadratisch, und weder
 * `imageSmoothingEnabled = false` noch `image-rendering: pixelated` können das
 * heilen, weil beide erst *nach* dem Strecken greifen.
 *
 * Die Auflösung folgt deshalb der Elementgröße: Content-Box × `devicePixelRatio`.
 *
 * Zurückgegeben wird die **Content-Box** (die Zeichenfläche in CSS-Pixeln),
 * gemeldet wird die **Border-Box**. Das ist kein Detail: Der Rahmen bekommt
 * seine gespeicherte Größe als `style.width` zurück, und weil Tailwind
 * `box-sizing: border-box` setzt, würde er mit der Content-Box bei jedem
 * Öffnen der Seite um die Rahmenbreite schrumpfen.
 */
export function useResizableFrame(
    ref: RefObject<HTMLElement | null>,
    onResized: (size: FrameSize) => void,
): FrameSize {
    const [content, setContent] = useState<FrameSize>({
        width: 0,
        height: 0,
    });

    // Der Rückruf steckt in einem Ref: Als Abhängigkeit des Effects würde er
    // den Beobachter bei jedem Rendern ab- und wieder anmelden.
    const report = useRef(onResized);
    report.current = onResized;

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const width = Math.round(entry.contentRect.width);
            const height = Math.round(entry.contentRect.height);
            setContent((previous) =>
                previous.width === width && previous.height === height
                    ? previous
                    : { width, height },
            );
            const border = entry.borderBoxSize[0];
            if (border) {
                report.current({
                    width: Math.round(border.inlineSize),
                    height: Math.round(border.blockSize),
                });
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);

    return content;
}

/**
 * Die Pixeldichte des Bildschirms, nachgeführt beim Zoomen.
 *
 * Ohne das Nachführen ist die Karte nach einem Browser-Zoom wieder unscharf:
 * Der Rahmen behält seine Größe in CSS-Pixeln, also meldet der
 * `ResizeObserver` nichts, während sich das Verhältnis zu den echten Pixeln
 * verschoben hat. `matchMedia` auf die aktuelle Auflösung ist der einzige
 * Weg, der ohne Abfragen im Sekundentakt auskommt.
 */
export function useDevicePixelRatio(): number {
    const [ratio, setRatio] = useState(() =>
        typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    );

    useEffect(() => {
        const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
        const onChange = () => setRatio(window.devicePixelRatio);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, [ratio]);

    return ratio;
}
