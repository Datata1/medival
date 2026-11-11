import { createFileRoute, useParams } from '@tanstack/react-router';
import { z } from 'zod';
import { RankingView } from '../features/ranking/RankingView.js';

/*
 * Reiter und Seite stehen in der Adresse, nicht im Store: So lässt sich
 * „Stämme, Seite 1" verlinken und der Zurück-Knopf führt zur vorigen Seite
 * (plans/18-ux/18-5-rangliste-profil-einstellungen.md). Unsinn in der Adresse
 * fällt auf den Standard zurück, statt die Seite zu sprengen.
 */
const SearchSchema = z.object({
    tab: z.enum(['players', 'tribes']).catch('players'),
    page: z.coerce.number().int().min(1).catch(1),
});

export const Route = createFileRoute('/worlds/$worldId/ranking')({
    validateSearch: (search: Record<string, unknown>) =>
        SearchSchema.parse(search),
    loaderDeps: ({ search }) => ({ page: search.page }),
    loader: ({ context, params, deps }) =>
        context.stores.ranking.load(Number(params.worldId), deps.page),
    component: RankingRoute,
});

function RankingRoute() {
    const { worldId } = useParams({ from: '/worlds/$worldId/ranking' });
    const { tab, page } = Route.useSearch();
    return <RankingView worldId={worldId} tab={tab} page={page} />;
}
