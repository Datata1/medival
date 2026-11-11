import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { MapView } from '../features/map/MapView.js';
import { decodeTroops } from '../lib/troops.js';

/*
 * Ein Ziel in der Adresse (plans/18-ux/18-4-berichte.md): Ein Bericht
 * verlinkt mit `?x=…&y=…` auf das Dorf und mit `troops=spear:10,…` auf einen
 * vorbelegten Angriff. Ohne Angaben öffnet die Karte wie bisher am eigenen
 * Dorf.
 */
const SearchSchema = z.object({
    x: z.coerce.number().int().min(0).optional().catch(undefined),
    y: z.coerce.number().int().min(0).optional().catch(undefined),
    troops: z.string().max(200).optional().catch(undefined),
});

export const Route = createFileRoute('/worlds/$worldId/map')({
    validateSearch: (search: Record<string, unknown>) =>
        SearchSchema.parse(search),
    loaderDeps: ({ search }) => search,
    loader: async ({ context, params, deps }) => {
        const { stores } = context;
        // Erst die Welt: Bei einem Direktaufruf räumt ihr Öffnen die Karte
        // ab, und eine vorher gesetzte Auswahl wäre wieder weg.
        await stores.openWorld(Number(params.worldId));
        if (deps.x === undefined || deps.y === undefined) {
            stores.map.clearFocus();
            return;
        }
        await stores.map.focusOn(
            deps.x,
            deps.y,
            deps.troops ? decodeTroops(deps.troops) : null,
        );
    },
    component: MapView,
});
