import { createFileRoute } from '@tanstack/react-router';
import { ReportsView } from '../features/reports/ReportsView.js';

export const Route = createFileRoute('/worlds/$worldId/reports')({
    /*
     * Gelesen wird beim Öffnen der Seite, nicht beim Klick auf den Reiter.
     * Der Unterschied ist nicht kosmetisch: Vorher lief `markAllRead()` im
     * `onClick` des Reiters — also bevor die Seite überhaupt da war, und auch
     * dann, wenn die Navigation danach scheiterte.
     *
     * Ticket 18-4 verfeinert das auf „gelesen, wenn *dieser* Bericht geöffnet
     * wurde"; bis dahin ist „du hast die Liste gesehen" die ehrlichste Regel,
     * die ohne Einzelabruf-Endpunkt zu haben ist.
     */
    loader: ({ context }) => context.stores.reports.markAllRead(),
    component: ReportsView,
});
