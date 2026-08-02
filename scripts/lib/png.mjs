/**
 * Minimaler PNG-Schreiber — ohne Fremdbibliothek.
 *
 * Ein PNG besteht aus einer Signatur und typisierten Blöcken. Für unsere
 * Platzhalter-Sprites reichen drei: IHDR (Maße und Farbformat), IDAT (die
 * zlib-komprimierten Bildzeilen) und IEND. Nodes eingebautes `zlib` erledigt
 * die Kompression, sodass wir uns keine Abhängigkeit einhandeln
 * (siehe plans/12-assets-und-sprites.md).
 */
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** CRC-32, wie es die PNG-Spezifikation für jeden Block verlangt. */
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let crc = -1;
    for (const byte of buffer)
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const typeAndData = Buffer.concat([
        Buffer.from(type, 'ascii'),
        data,
    ]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Schreibt ein PNG mit 8 Bit RGBA.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba - width * height * 4 Bytes
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
    if (rgba.length !== width * height * 4) {
        throw new Error(
            `Bilddaten passen nicht: ${rgba.length} Bytes für ${width}×${height} (erwartet ${width * height * 4})`,
        );
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // Bittiefe
    ihdr[9] = 6; // Farbtyp 6 = RGBA
    // 10–12: Kompression, Filter, Interlace — jeweils 0 (Standard)

    // Jede Bildzeile beginnt mit einem Filter-Byte; 0 = kein Filter.
    // Das kostet etwas Größe, hält den Schreiber aber trivial und fehlerfrei.
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const target = y * (1 + width * 4);
        raw[target] = 0;
        Buffer.from(
            rgba.buffer,
            rgba.byteOffset + y * width * 4,
            width * 4,
        ).copy(raw, target + 1);
    }

    return Buffer.concat([
        SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * Baut ein Bild aus einer Zeichenkarte — so bleiben die Sprites im Quelltext
 * lesbar und lassen sich direkt dort anpassen.
 *
 * @param {string[]} rows - eine Zeichenkette je Bildzeile
 * @param {Record<string, string|null>} colors - Zeichen → '#rrggbb' oder null (transparent)
 * @param {number} scale - ganzzahlige Vergrößerung (Pixel bleiben scharf)
 */
export function spriteFromRows(rows, colors, scale = 1) {
    const height = rows.length;
    const width = rows[0].length;
    for (const [index, row] of rows.entries()) {
        if (row.length !== width) {
            throw new Error(
                `Zeile ${index} ist ${row.length} Zeichen breit, erwartet ${width}`,
            );
        }
    }

    const outWidth = width * scale;
    const outHeight = height * scale;
    const rgba = new Uint8Array(outWidth * outHeight * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const key = rows[y][x];
            if (!(key in colors)) {
                throw new Error(
                    `Unbekanntes Zeichen '${key}' in der Sprite-Definition`,
                );
            }
            const hex = colors[key];
            if (hex === null) continue; // transparent
            const r = Number.parseInt(hex.slice(1, 3), 16);
            const g = Number.parseInt(hex.slice(3, 5), 16);
            const b = Number.parseInt(hex.slice(5, 7), 16);
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    const offset =
                        ((y * scale + dy) * outWidth +
                            (x * scale + dx)) *
                        4;
                    rgba[offset] = r;
                    rgba[offset + 1] = g;
                    rgba[offset + 2] = b;
                    rgba[offset + 3] = 255;
                }
            }
        }
    }

    return { width: outWidth, height: outHeight, rgba };
}
