import { createFileRoute, useParams } from '@tanstack/react-router';
import { PlayerProfileView } from '../features/player/PlayerProfileView.js';

export const Route = createFileRoute(
    '/worlds/$worldId/players/$playerId',
)({
    loader: ({ context, params }) =>
        context.stores.player.load(
            Number(params.worldId),
            Number(params.playerId),
        ),
    component: PlayerRoute,
});

function PlayerRoute() {
    const { worldId } = useParams({
        from: '/worlds/$worldId/players/$playerId',
    });
    return <PlayerProfileView worldId={worldId} />;
}
