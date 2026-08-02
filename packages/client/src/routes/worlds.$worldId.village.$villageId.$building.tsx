import { RALLY_POINT, VillagePageSchema } from '@medival/shared';
import { createFileRoute } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card.js';
import { BuildingView } from '../features/village/BuildingView.js';
import { RallyView } from '../features/village/RallyView.js';
import { useStores } from '../stores/StoreContext.js';

/** Gebäudeseite oder Versammlungsplatz — beide hängen an demselben Pfad. */
const VillagePageRoute = observer(function VillagePageRoute() {
    const { page } = Route.useLoaderData();
    const { village } = useStores();
    const { t } = useTranslation();

    if (page === RALLY_POINT) {
        const villageId = village.villageId;
        if (villageId === null)
            return (
                <p className="text-ink-light">{t('village.loading')}</p>
            );
        return <RallyView villageId={villageId} />;
    }
    return <BuildingView building={page} />;
});

/**
 * Eine Unterseite des Dorfes (plans/18-ux/18-2-dorfuebersicht.md): ein Gebäude
 * oder der Versammlungsplatz.
 *
 * Der Pfadanteil wird mit einem zod-Enum geprüft, nicht gecastet:
 * `/village/1/schmiede` landet dadurch im `errorComponent` statt als
 * unbekannter Schlüssel in `BUILDINGS` (plans/08-no-typecasting.md).
 */
export const Route = createFileRoute(
    '/worlds/$worldId/village/$villageId/$building',
)({
    loader: ({ params }) => ({
        page: VillagePageSchema.parse(params.building),
    }),
    component: VillagePageRoute,
    errorComponent: UnknownPage,
});

function UnknownPage() {
    const { t } = useTranslation();
    return (
        <Card>
            <h2>{t('errors.invalid_building')}</h2>
            <p className="text-ink-light">{t('routes.notFoundHint')}</p>
        </Card>
    );
}
