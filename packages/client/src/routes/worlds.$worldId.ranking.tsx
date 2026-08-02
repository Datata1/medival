import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../features/world/ComingSoon.js';

export const Route = createFileRoute('/worlds/$worldId/ranking')({
    component: RankingRoute,
});

function RankingRoute() {
    const { t } = useTranslation();
    return <ComingSoon title={t('nav.ranking')} />;
}
