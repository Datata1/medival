import { createFileRoute, Outlet } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card.js';
import { MainNav } from '../features/world/MainNav.js';
import { VillageBar } from '../features/world/VillageBar.js';
import { useStores } from '../stores/StoreContext.js';

function WorldError() {
    const { t } = useTranslation();
    return (
        <div className="page">
            <Card>
                <h2>{t('world.loadError')}</h2>
            </Card>
        </div>
    );
}

const WorldLayout = observer(function WorldLayout() {
    const { t } = useTranslation();
    const { world } = useStores();

    if (world.world.isLoading && !world.summary)
        return (
            <p className="page text-ink-light">{t('world.loading')}</p>
        );
    if (world.world.error || !world.summary) return <WorldError />;

    return (
        <div>
            {/*
             * Beide Leisten hängen in einem gemeinsamen klebenden Kasten.
             * Getrennt zu kleben ginge nur mit einem festen Versatz für die
             * zweite Leiste — und der stimmt nicht mehr, sobald die Kopfzeile
             * auf einem schmalen Fenster umbricht.
             */}
            <div className="sticky top-0 z-20">
                <MainNav />
                <VillageBar />
            </div>

            <div className="page">
                <Outlet />
            </div>
        </div>
    );
});

export const Route = createFileRoute('/worlds/$worldId')({
    // Der Loader lädt keine Daten, er stößt nur den Store an — sonst gäbe es
    // neben den Stores eine zweite Datenquelle (plans/10-tanstack-router.md).
    loader: ({ context, params }) =>
        context.stores.openWorld(Number(params.worldId)),
    component: WorldLayout,
    errorComponent: WorldError,
});
