import { createFileRoute, Outlet } from '@tanstack/react-router';
import { VillageNav } from '../features/village/VillageNav.js';

/**
 * Der Rahmen eines Dorfes: die Gebäudenavigation, darunter Übersicht oder
 * Gebäudeseite (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Der Loader stößt wie überall nur den Store an — er ist die einzige Stelle,
 * die `village.select` aufruft, sodass Adresszeile und Zustand nicht
 * auseinanderlaufen können (Plan 10).
 */
export const Route = createFileRoute(
    '/worlds/$worldId/village/$villageId',
)({
    loader: ({ context, params }) =>
        context.stores.village.select(
            Number(params.worldId),
            Number(params.villageId),
        ),
    component: VillageLayout,
});

function VillageLayout() {
    return (
        <>
            <VillageNav />
            <Outlet />
        </>
    );
}
