import {
    createRootRouteWithContext,
    Outlet,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/Card.js';
import type { RootStore } from '../stores/RootStore.js';

/** Der Router kennt die Stores — Loader stoßen darüber Ladevorgänge an. */
export interface RouterContext {
    stores: RootStore;
}

function NotFound() {
    const { t } = useTranslation();
    return (
        <div className="page">
            <Card>
                <h2>{t('routes.notFoundTitle')}</h2>
                <p className="text-ink-light">
                    {t('routes.notFoundHint')}
                </p>
            </Card>
        </div>
    );
}

export const Route = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
    notFoundComponent: NotFound,
});
