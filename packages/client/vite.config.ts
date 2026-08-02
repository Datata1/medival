import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        // muss vor dem React-Plugin laufen
        tanstackRouter({ target: 'react', autoCodeSplitting: false }),
        react(),
        tailwindcss(),
    ],
    build: {
        /*
         * Sprites immer als eigene Datei ausliefern, nie als Data-URI.
         * Vite würde kleine Bilder standardmäßig ins JS einbetten — dann
         * verhielten sich winzige Platzhalter anders als größere eigene
         * Zeichnungen, und ein ausgetauschtes Sprite zöge einen neuen
         * JS-Download nach sich (siehe plans/12-assets-und-sprites.md).
         */
        assetsInlineLimit: (filePath) =>
            filePath.endsWith('.png') ? false : undefined,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3080',
                ws: true,
            },
        },
    },
});
