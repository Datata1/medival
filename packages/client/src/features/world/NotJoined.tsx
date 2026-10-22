import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button.js';
import { Card } from '../../components/Card.js';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Eine Welt, in der der Account noch nicht mitspielt (19-9) — etwa über einen
 * geteilten Link geöffnet. Statt leerer Ansichten das Angebot, beizutreten.
 */
export const NotJoined = observer(function NotJoined({
    worldId,
}: {
    worldId: number;
}) {
    const { t } = useTranslation();
    const stores = useStores();
    const { lobby } = stores;
    return (
        <div className="page mx-auto max-w-lg">
            <Card>
                <h2>{t('lobby.notJoinedTitle')}</h2>
                <p className="text-ink-light">
                    {t('lobby.notJoinedHint')}
                </p>
                <Button
                    disabled={lobby.isSubmitting}
                    onClick={() =>
                        void lobby.join(worldId).then(async (ok) => {
                            if (ok) await stores.reopenWorld(worldId);
                        })
                    }
                >
                    {t('lobby.join')}
                </Button>
                {lobby.submitError && (
                    <p className="text-seal">{lobby.submitError}</p>
                )}
            </Card>
        </div>
    );
});
