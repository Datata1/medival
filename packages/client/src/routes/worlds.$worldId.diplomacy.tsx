import { createFileRoute, useParams } from '@tanstack/react-router';
import { DiplomacyView } from '../features/tribe/DiplomacyView.js';

export const Route = createFileRoute('/worlds/$worldId/diplomacy')({
    // Loader stoßen nur Store-Actions an, sie liefern keine Daten (Plan 10).
    loader: ({ context, params }) =>
        context.stores.tribe.load(Number(params.worldId)),
    component: DiplomacyRoute,
});

function DiplomacyRoute() {
    const { worldId } = useParams({
        from: '/worlds/$worldId/diplomacy',
    });
    return <DiplomacyView worldId={worldId} />;
}
