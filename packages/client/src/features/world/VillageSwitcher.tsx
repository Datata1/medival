import { useNavigate } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useStores } from '../../stores/StoreContext.js';

/**
 * Wechselt das aktive Dorf — über Pfeile oder über die Liste.
 *
 * Beide Wege **navigieren**, statt `village.select()` aufzurufen. Vorher änderte
 * das Auswahlfeld in der Topbar nur den Store; die Adresszeile zeigte weiter auf
 * das alte Dorf, und ein Reload landete woanders als der Bildschirm behauptete.
 * Den Store stößt jetzt der Route-Loader an, wie überall sonst (Plan 10).
 */
export const VillageSwitcher = observer(function VillageSwitcher() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { world, village } = useStores();

    const villages = world.playerVillages;
    const worldId = world.worldId;
    if (worldId === null || villages.length === 0) return null;

    const index = villages.findIndex((v) => v.id === village.villageId);
    const current = villages[index] ?? villages[0];
    if (!current) return null;

    const go = (villageId: number) =>
        void navigate({
            to: '/worlds/$worldId/village/$villageId',
            params: {
                worldId: String(worldId),
                villageId: String(villageId),
            },
        });

    // Zyklisch: das letzte Dorf führt zurück zum ersten. Bei nur einem Dorf
    // bleiben die Pfeile sichtbar, aber deaktiviert — sonst lernt niemand,
    // dass es sie gibt, sobald das zweite Dorf dazukommt.
    const step = (delta: number) => {
        const from = index === -1 ? 0 : index;
        const next =
            villages[
                (from + delta + villages.length) % villages.length
            ];
        if (next) go(next.id);
    };

    const arrow =
        'cursor-pointer rounded-sm border border-oak bg-parchment px-1.5 py-0.5 leading-none disabled:cursor-not-allowed disabled:opacity-40';

    return (
        <span className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={() => step(-1)}
                disabled={villages.length < 2}
                title={t('villageBar.previous')}
                aria-label={t('villageBar.previous')}
                className={arrow}
            >
                ◀
            </button>
            <select
                value={current.id}
                onChange={(e) => go(Number(e.target.value))}
                title={t('villageBar.select')}
                aria-label={t('villageBar.select')}
                className="py-0.5"
            >
                {/*
                 * Nur der Name: Koordinaten und Kontinent des aktiven Dorfes
                 * stehen direkt daneben in der Leiste, und zweimal dieselbe
                 * Angabe nebeneinander liest niemand.
                 */}
                {villages.map((v) => (
                    <option key={v.id} value={v.id}>
                        {v.name}
                    </option>
                ))}
            </select>
            <button
                type="button"
                onClick={() => step(1)}
                disabled={villages.length < 2}
                title={t('villageBar.next')}
                aria-label={t('villageBar.next')}
                className={arrow}
            >
                ▶
            </button>
        </span>
    );
});
