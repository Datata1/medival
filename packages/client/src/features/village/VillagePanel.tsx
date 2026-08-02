import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useStores } from '../../stores/StoreContext.js';
import { BuildingsTable } from './BuildingsTable.js';
import { BuildQueueCard } from './BuildQueueCard.js';
import { effectiveLevels, liveResources } from './derive.js';
import { RecruitQueueCard } from './RecruitQueueCard.js';
import { RecruitTable } from './RecruitTable.js';
import { UnitsCard } from './UnitsCard.js';

/** Container: liest aus den Stores, das Darstellen erledigen die Kindkomponenten. */
export const VillagePanel = observer(function VillagePanel() {
    const { t } = useTranslation();
    const { village, world } = useStores();
    const view = village.view;

    if (!view)
        return <p className="text-ink-light">{t('village.loading')}</p>;

    const speed = world.summary?.settings.speed ?? 1;
    const live = liveResources(view, world.gameTime);

    return (
        <div>
            {/* Ressourcen, Bauernhofplätze und Dorfname stehen seit Plan 18-1
                in der Dorfleiste des Rahmens — dort sind sie auf jedem
                Bildschirm sichtbar statt nur auf diesem. */}
            <BuildQueueCard queue={view.buildQueue} />
            <BuildingsTable
                village={view}
                live={live}
                effLevels={effectiveLevels(view)}
                speed={speed}
                onBuild={(type) => void village.build(type)}
                busy={village.isBuilding}
                error={village.buildError}
            />
            <UnitsCard units={view.units} />
            <RecruitQueueCard queue={view.recruitQueue} />
            <RecruitTable
                village={view}
                live={live}
                speed={speed}
                busy={village.isRecruiting}
                error={village.recruitError}
                onRecruit={(unit, count) =>
                    void village.recruit(unit, count)
                }
            />
        </div>
    );
});
