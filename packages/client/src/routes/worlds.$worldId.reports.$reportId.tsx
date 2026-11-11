import { createFileRoute, useParams } from '@tanstack/react-router';
import { ReportPage } from '../features/reports/ReportPage.js';

/**
 * Ein Bericht mit eigener Adresse (plans/18-ux/18-4-berichte.md): kopierbar,
 * neu ladbar, im zweiten Tab neben einem anderen zu öffnen. Der Loader lädt
 * ihn einzeln, ohne auf die Liste zu warten, und markiert genau ihn als
 * gelesen.
 */
export const Route = createFileRoute(
    '/worlds/$worldId/reports/$reportId',
)({
    loader: ({ context, params }) =>
        context.stores.reports.open(
            Number(params.worldId),
            Number(params.reportId),
        ),
    component: ReportRoute,
});

function ReportRoute() {
    const { worldId } = useParams({
        from: '/worlds/$worldId/reports/$reportId',
    });
    return <ReportPage worldId={worldId} />;
}
