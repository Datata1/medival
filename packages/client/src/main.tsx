import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/index.js';
import { routeTree } from './routeTree.gen';
import { RootStore } from './stores/RootStore.js';
import { StoreProvider } from './stores/StoreContext.js';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement)
    throw new Error('Kein #root-Element im Dokument gefunden');

const stores = new RootStore();

/*
 * Browser erlauben Ton erst nach einer Nutzerinteraktion. Der Kontext wird
 * deshalb beim allerersten Klick oder Tastendruck entsperrt — nicht beim Laden,
 * sonst startet er im Zustand `suspended` und bleibt dort (plans/13-sounds.md).
 * Bewusst hier statt in einem Effekt: Das gilt für die ganze Anwendung und
 * genau einmal, nicht für den Lebenszyklus einer Komponente (Plan 05).
 */
for (const event of ['pointerdown', 'keydown']) {
    window.addEventListener(event, () => stores.sound.unlock(), {
        once: true,
    });
}

// Der Router bekommt die Stores als Kontext; Loader stoßen darüber Ladevorgänge an.
const router = createRouter({ routeTree, context: { stores } });

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}

createRoot(rootElement).render(
    <StrictMode>
        <StoreProvider store={stores}>
            <RouterProvider router={router} />
        </StoreProvider>
    </StrictMode>,
);
