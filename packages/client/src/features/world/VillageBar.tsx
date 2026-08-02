import { continentOf, MERCHANT_CAPACITY } from '@medival/shared';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { SpriteId } from '../../assets/registry.js';
import { Icon } from '../../components/Icon.js';
import { formatGameTime, formatNumber } from '../../lib/format.js';
import { useStores } from '../../stores/StoreContext.js';
import { liveResources } from '../village/derive.js';
import { VillageSwitcher } from './VillageSwitcher.js';

function Counter({
    icon,
    label,
    value,
}: {
    icon: SpriteId;
    label: string;
    value: string;
}) {
    return (
        <span
            className="inline-flex items-center gap-1.5"
            title={label}
        >
            <Icon name={icon} /> {value}
        </span>
    );
}

/**
 * Die zweite Leiste: welches Dorf, wo es liegt, was darin liegt.
 *
 * Sie steht im Rahmen und nicht im Seiteninhalt, weil die Zahlen auf jedem
 * Bildschirm gebraucht werden — auf der Karte entscheidet man anhand der
 * Ressourcen, ob sich ein Angriff lohnt, in den Berichten ebenso. Vorher waren
 * sie eine Karte innerhalb der Dorfansicht und damit anderswo unsichtbar.
 */
export const VillageBar = observer(function VillageBar() {
    const { t } = useTranslation();
    const { world, village } = useStores();
    const view = village.view;

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-oak border-b-2 bg-parchment-dark px-4 py-1.5 text-sm tabular-nums">
            <VillageSwitcher />
            {view && (
                <span className="text-ink-light">
                    ({view.x}|{view.y}){' '}
                    {t('villageBar.continent', {
                        continent: continentOf(view.x, view.y),
                    })}
                </span>
            )}
            {!view && (
                <span className="text-ink-light">
                    {t('village.loading')}
                </span>
            )}
            {world.actionError && (
                <span className="text-seal">{world.actionError}</span>
            )}
            <span className="flex-1" />
            {view && <VillageCounters />}
            <WorldClock />
        </div>
    );
});

/**
 * Eigene Beobachterkomponente, damit der Halbsekundentakt der Spieluhr nur
 * die Zahlen neu zeichnet und nicht die ganze Leiste samt Auswahlfeld.
 */
const VillageCounters = observer(function VillageCounters() {
    const { t } = useTranslation();
    const { world, village } = useStores();
    const view = village.view;
    if (!view) return null;

    const live = liveResources(view, world.gameTime);
    const capacity = formatNumber(view.capacity);

    /*
     * `merchantCapacity`/`merchantsFree` zählen **Rohstoffe**, nicht Händler:
     * ein Händler trägt `MERCHANT_CAPACITY` (1000). Die Leiste zeigt deshalb
     * beides — die Anzahl Händler groß, die Tragkapazität als Beschriftung.
     * Vorher stand dort „4000/4000" neben einem Handelssymbol, was aussah, als
     * gäbe es viertausend Händler.
     */
    const merchantsFree = Math.floor(
        view.merchantsFree / MERCHANT_CAPACITY,
    );
    const merchantsTotal = Math.floor(
        view.merchantCapacity / MERCHANT_CAPACITY,
    );

    return (
        <>
            <Counter
                icon="icon.wood"
                label={t('village.wood')}
                value={formatNumber(live.wood)}
            />
            <Counter
                icon="icon.clay"
                label={t('village.clay')}
                value={formatNumber(live.clay)}
            />
            <Counter
                icon="icon.iron"
                label={t('village.iron')}
                value={formatNumber(live.iron)}
            />
            {/*
             * Der Speicher fasst von jeder Sorte gleich viel, deshalb steht die
             * Kapazität **einmal** hier statt dreimal als „ist/kapa" an jedem
             * Rohstoff (ideas/assets/resourcen_leiste-beispiel.png).
             */}
            <Counter
                icon="building.warehouse"
                label={t('villageBar.storage')}
                value={capacity}
            />
            <Counter
                icon="icon.population"
                label={t('villageBar.farm')}
                value={`${view.popUsed}/${view.popMax}`}
            />
            {merchantsTotal > 0 && (
                <Counter
                    icon="icon.trade"
                    label={t('villageBar.merchants', {
                        capacity: formatNumber(view.merchantsFree),
                    })}
                    value={`${merchantsFree}/${merchantsTotal}`}
                />
            )}
        </>
    );
});

/**
 * Die Spieluhr. Sie stand zuerst in der Kopfzeile und hat dort die Symmetrie
 * der Reiter gebrochen — hier gehört sie ohnehin besser hin, neben die anderen
 * laufenden Zahlen.
 */
const WorldClock = observer(function WorldClock() {
    const { world } = useStores();
    return (
        <span className="text-ink-light">
            {formatGameTime(world.gameTime)}
        </span>
    );
});
