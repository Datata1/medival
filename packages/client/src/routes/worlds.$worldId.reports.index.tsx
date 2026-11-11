import { REPORT_FILTERS } from '@medival/shared';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { z } from 'zod';
import { ReportsView } from '../features/reports/ReportsView.js';

/*
 * Filter und Seite stehen in der Adresse (plans/18-ux/18-4-berichte.md): Ein
 * gefilterter Stand ist verlinkbar und überlebt den Zurück-Knopf.
 *
 * Der Loader markiert nichts mehr als gelesen. Vorher tat er das für alle
 * Berichte, sobald die Liste aufging; gelesen ist ein Bericht jetzt, wenn
 * seine eigene Seite geöffnet wurde.
 */
const SearchSchema = z.object({
    filter: z.enum(REPORT_FILTERS).catch('all'),
    page: z.coerce.number().int().min(1).catch(1),
});

export const Route = createFileRoute('/worlds/$worldId/reports/')({
    validateSearch: (search: Record<string, unknown>) =>
        SearchSchema.parse(search),
    loaderDeps: ({ search }) => search,
    loader: ({ context, params, deps }) =>
        context.stores.reports.show(
            Number(params.worldId),
            deps.filter,
            deps.page,
        ),
    component: ReportsRoute,
});

function ReportsRoute() {
    const { worldId } = useParams({
        from: '/worlds/$worldId/reports/',
    });
    const { filter, page } = Route.useSearch();
    return (
        <ReportsView worldId={worldId} filter={filter} page={page} />
    );
}
