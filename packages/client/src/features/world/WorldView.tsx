import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { useStores } from '../../stores/StoreContext.js';
import { MapView } from '../map/MapView.js';
import { MovementsPanel } from '../map/MovementsPanel.js';
import { ReportsView } from '../reports/ReportsView.js';
import { VillagePanel } from '../village/VillagePanel.js';
import { Topbar } from './Topbar.js';

type Tab = 'village' | 'map' | 'reports';

export const WorldView = observer(function WorldView({
    onExit,
}: {
    onExit: () => void;
}) {
    const { t } = useTranslation();
    const { world, reports, village } = useStores();
    const [tab, setTab] = useState<Tab>('village');

    // Handlung, kein Renderneffekt: das Öffnen markiert die Berichte als gelesen
    // (siehe plans/06-useeffect-audit.md).
    const openTab = (next: Tab) => {
        setTab(next);
        if (next === 'reports') void reports.markAllRead();
    };

    if (world.world.isLoading && !world.summary)
        return <p className="text-ink-light">{t('world.loading')}</p>;
    if (world.world.error || !world.summary)
        return <p className="text-seal">{t('world.loadError')}</p>;

    return (
        <div>
            <Topbar onExit={onExit} />

            <nav className="mb-4 flex gap-1.5">
                <Button
                    variant="tab"
                    active={tab === 'village'}
                    onClick={() => openTab('village')}
                >
                    {t('world.tabVillage')}
                </Button>
                <Button
                    variant="tab"
                    active={tab === 'map'}
                    onClick={() => openTab('map')}
                >
                    {t('world.tabMap')}
                </Button>
                <Button
                    variant="tab"
                    active={tab === 'reports'}
                    onClick={() => openTab('reports')}
                >
                    {t('world.tabReports')}
                    {reports.unreadCount > 0 && (
                        <span className="ml-1.5 rounded-full bg-seal px-1.5 text-white text-xs">
                            {reports.unreadCount}
                        </span>
                    )}
                </Button>
            </nav>

            {village.villageId === null ? (
                <p className="text-seal">{t('world.noVillageLeft')}</p>
            ) : tab === 'village' ? (
                <>
                    <VillagePanel />
                    <MovementsPanel />
                </>
            ) : tab === 'map' ? (
                <MapView />
            ) : (
                <ReportsView />
            )}
        </div>
    );
});
