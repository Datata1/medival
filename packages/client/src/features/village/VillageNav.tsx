import type { BuildingType } from '@medival/shared';
import { RALLY_POINT } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { TAB_LINK_CLASS } from '../../components/Button.js';
import { Icon } from '../../components/Icon.js';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Die Gebäude, die eine eigene Handlung anbieten: bauen, ausbilden, liefern.
 *
 * Rohstoffgebäude, Speicher, Bauernhof, Wall und Adelshof stehen bewusst nicht
 * dabei. Ihre Seiten zeigen eine Zahl, die auf der Übersicht ohnehin schon
 * steht — als Reiter kosteten sie nur Platz. Erreichbar bleiben sie über den
 * Dorfplatz, wo sie sichtbar herumstehen.
 */
const NAV_BUILDINGS = [
    'headquarters',
    'barracks',
    'stable',
    'workshop',
    'market',
] as const satisfies readonly BuildingType[];

/** Die zweite Navileiste: die Werkstätten dieses Dorfes. */
export const VillageNav = observer(function VillageNav() {
    const { t } = useTranslation();
    const { village, world } = useStores();
    const view = village.view;
    const worldId = world.worldId;
    if (!view || worldId === null) return null;

    const params = {
        worldId: String(worldId),
        villageId: String(view.id),
    };

    return (
        <nav className="mb-4 flex flex-wrap items-end gap-1.5 border-oak border-b-2">
            <Link
                to="/worlds/$worldId/village/$villageId"
                params={params}
                className={TAB_LINK_CLASS}
            >
                <Icon name="icon.village" /> {t('nav.overview')}
            </Link>
            {/* Nur was gebaut ist: Ein Reiter auf ein Gebäude, das es noch
                nicht gibt, führt auf eine Seite mit einem einzigen Knopf. */}
            {NAV_BUILDINGS.filter(
                (type) => view.buildings[type] > 0,
            ).map((type) => (
                <Link
                    key={type}
                    to="/worlds/$worldId/village/$villageId/$building"
                    params={{ ...params, building: type }}
                    className={TAB_LINK_CLASS}
                >
                    <Icon name={`building.${type}`} />{' '}
                    {t(`buildings.${type}`)}
                </Link>
            ))}
            {/* Der Versammlungsplatz ist immer da — er wird nicht gebaut. */}
            <Link
                to="/worlds/$worldId/village/$villageId/$building"
                params={{ ...params, building: RALLY_POINT }}
                className={TAB_LINK_CLASS}
            >
                <Icon name="building.rally" /> {t('buildings.rally')}
            </Link>
        </nav>
    );
});
