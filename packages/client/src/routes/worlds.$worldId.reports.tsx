import { createFileRoute } from '@tanstack/react-router';
import { ReportsView } from '../features/reports/ReportsView.js';

export const Route = createFileRoute('/worlds/$worldId/reports')({
    component: ReportsView,
});
