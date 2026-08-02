import { createFileRoute } from '@tanstack/react-router';
import { MapView } from '../features/map/MapView.js';

export const Route = createFileRoute('/worlds/$worldId/map')({
    component: MapView,
});
