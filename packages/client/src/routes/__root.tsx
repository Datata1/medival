import {
    createRootRouteWithContext,
    Outlet,
    redirect,
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

/** Seiten, die ohne Anmeldung erreichbar sind. */
const PUBLIC_PATHS = ['/login', '/register'];

export const Route = createRootRouteWithContext<RouterContext>()({
    /*
     * Ohne Session zur Anmeldung (plans/19-prototyp/19-8). Wie alle Loader
     * stößt auch dieser nur eine Store-Action an; was „angemeldet" heißt,
     * entscheidet der AuthStore.
     */
    beforeLoad: async ({ context, location }) => {
        await context.stores.auth.ensureLoaded();
        if (
            !context.stores.auth.account &&
            !PUBLIC_PATHS.includes(location.pathname)
        )
            throw redirect({ to: '/login' });
    },
    component: Outlet,
    notFoundComponent: NotFound,
});
