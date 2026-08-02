import { useTranslation } from 'react-i18next';
import { CreateWorldForm } from './CreateWorldForm.js';
import { WorldList } from './WorldList.js';

export function Lobby({ onOpen }: { onOpen: (id: number) => void }) {
    const { t } = useTranslation();
    return (
        <div>
            <h1>{t('lobby.title')}</h1>
            <p className="mt-0 text-ink-light">{t('lobby.subtitle')}</p>
            <CreateWorldForm onCreated={onOpen} />
            <WorldList onOpen={onOpen} />
        </div>
    );
}
