import { useNavigate } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { useStores } from '../../stores/StoreContext.js';
import { CreateWorldForm } from './CreateWorldForm.js';
import { WorldList } from './WorldList.js';

/**
 * Die Lobby. Welten anlegen und löschen ist seit 19-8 Verwaltung: Spieler
 * sehen die Liste und treten bei, nur Admins verwalten.
 */
export const Lobby = observer(function Lobby({
    onOpen,
}: {
    onOpen: (id: number) => void;
}) {
    const { t } = useTranslation();
    const { auth } = useStores();
    const navigate = useNavigate();
    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1>{t('lobby.title')}</h1>
                {auth.account && (
                    <span className="inline-flex items-center gap-2 text-ink-light">
                        {t('lobby.signedInAs', {
                            name: auth.account.name,
                        })}
                        <Button
                            variant="tab"
                            onClick={() =>
                                void auth
                                    .logout()
                                    .then(() =>
                                        navigate({ to: '/login' }),
                                    )
                            }
                        >
                            {t('auth.logout')}
                        </Button>
                    </span>
                )}
            </div>
            <p className="mt-0 text-ink-light">{t('lobby.subtitle')}</p>
            {auth.isAdmin ? (
                <CreateWorldForm onCreated={onOpen} />
            ) : (
                <p className="text-ink-light">{t('lobby.adminOnly')}</p>
            )}
            <WorldList onOpen={onOpen} canDelete={auth.isAdmin} />
        </div>
    );
});
