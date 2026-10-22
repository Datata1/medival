import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card.js';
import { useStores } from '../../stores/StoreContext.js';
import { WorldListItem } from './WorldListItem.js';

export const WorldList = observer(function WorldList({
    onOpen,
    canDelete,
}: {
    onOpen: (id: number) => void;
    /** Löschen dürfen nur Admins (19-8). */
    canDelete: boolean;
}) {
    const { t } = useTranslation();
    const { lobby } = useStores();

    // Externes System (Server) beim Anzeigen der Liste abfragen.
    useEffect(() => {
        void lobby.load();
    }, [lobby]);

    return (
        <Card>
            <h2>{t('lobby.saves')}</h2>
            {lobby.list.length === 0 && !lobby.worlds.isLoading && (
                <p className="text-ink-light">{t('lobby.noWorlds')}</p>
            )}
            {lobby.worlds.error && (
                <p className="text-seal">{lobby.worlds.error}</p>
            )}
            <ul className="m-0 list-none p-0">
                {lobby.list.map((world) => (
                    <WorldListItem
                        key={world.id}
                        world={world}
                        onOpen={() => onOpen(world.id)}
                        onDelete={
                            canDelete
                                ? () => {
                                      if (
                                          confirm(
                                              t('lobby.confirmDelete', {
                                                  name: world.name,
                                              }),
                                          )
                                      )
                                          void lobby.deleteWorld(
                                              world.id,
                                          );
                                  }
                                : undefined
                        }
                    />
                ))}
            </ul>
        </Card>
    );
});
