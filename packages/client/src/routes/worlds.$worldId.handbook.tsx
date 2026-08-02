import { createFileRoute } from '@tanstack/react-router';
import { HandbookView } from '../features/handbook/HandbookView.js';

export const Route = createFileRoute('/worlds/$worldId/handbook')({
    component: HandbookView,
});
