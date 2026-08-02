import { createFileRoute } from '@tanstack/react-router';
import { VillageOverview } from '../features/village/VillageOverview.js';

export const Route = createFileRoute(
    '/worlds/$worldId/village/$villageId/',
)({
    component: VillageOverview,
});
