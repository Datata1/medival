import {
    createFileRoute,
    Outlet,
    useNavigate,
    useParams,
} from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { Icon } from '../components/Icon.js';
import { Topbar } from '../features/world/Topbar.js';
import { useStores } from '../stores/StoreContext.js';

function WorldError() {
    const { t } = useTranslation();
    return (
        <Card>
            <h2>{t('world.loadError')}</h2>
        </Card>
    );
}

const WorldLayout = observer(function WorldLayout() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { worldId } = useParams({ from: '/worlds/$worldId' });
    const { world, reports, village } = useStores();

    if (world.world.isLoading && !world.summary)
        return <p className="text-ink-light">{t('world.loading')}</p>;
    if (world.world.error || !world.summary) return <WorldError />;

    const villageId = village.villageId;
    const tabLink = (to: string, params?: Record<string, string>) => ({
        to,
        params: { worldId, ...params },
    });

    return (
        <div>
            <Topbar onExit={() => void navigate({ to: '/' })} />

            <nav className="mb-4 flex gap-1.5">
                <Button
                    variant="tab"
                    onClick={() =>
                        villageId !== null &&
                        void navigate(
                            tabLink(
                                '/worlds/$worldId/village/$villageId',
                                {
                                    villageId: String(villageId),
                                },
                            ),
                        )
                    }
                    active={location.pathname.includes('/village/')}
                >
                    <Icon name="icon.village" /> {t('world.tabVillage')}
                </Button>
                <Button
                    variant="tab"
                    onClick={() =>
                        void navigate(tabLink('/worlds/$worldId/map'))
                    }
                    active={location.pathname.endsWith('/map')}
                >
                    <Icon name="icon.map" /> {t('world.tabMap')}
                </Button>
                <Button
                    variant="tab"
                    onClick={() => {
                        void reports.markAllRead();
                        void navigate(
                            tabLink('/worlds/$worldId/reports'),
                        );
                    }}
                    active={location.pathname.endsWith('/reports')}
                >
                    <Icon name="icon.report" /> {t('world.tabReports')}
                    {reports.unreadCount > 0 && (
                        <span className="ml-1.5 rounded-full bg-seal px-1.5 text-white text-xs">
                            {reports.unreadCount}
                        </span>
                    )}
                </Button>
            </nav>

            <Outlet />
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
