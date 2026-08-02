import { createFileRoute } from '@tanstack/react-router';
import { MovementsPanel } from '../features/map/MovementsPanel.js';
import { VillagePanel } from '../features/village/VillagePanel.js';

export const Route = createFileRoute(
    '/worlds/$worldId/village/$villageId',
)({
    loader: ({ context, params }) =>
        context.stores.village.select(
            Number(params.worldId),
            Number(params.villageId),
        ),
    component: VillageRoute,
});

function VillageRoute() {
    return (
        <>
            <VillagePanel />
            <MovementsPanel />
        </>
    );
}
