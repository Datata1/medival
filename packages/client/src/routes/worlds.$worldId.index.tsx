import { createFileRoute, redirect } from '@tanstack/react-router';

/** Ohne ausdrückliche Wahl aufs erste eigene Dorf leiten. */
export const Route = createFileRoute('/worlds/$worldId/')({
    loader: async ({ context, params }) => {
        await context.stores.openWorld(Number(params.worldId));
        const first = context.stores.world.playerVillages[0];
        if (!first) return;
        throw redirect({
            to: '/worlds/$worldId/village/$villageId',
            params: {
                worldId: params.worldId,
                villageId: String(first.id),
            },
        });
    },
});
