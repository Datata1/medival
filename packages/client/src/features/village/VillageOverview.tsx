import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useStores } from '../../stores/StoreContext.js';
import { BuildQueueCard } from './BuildQueueCard.js';
import { ProductionCard } from './ProductionCard.js';
import { RecruitQueueCard } from './RecruitQueueCard.js';
import { UnitsCard } from './UnitsCard.js';
import { VillageMovementsCard } from './VillageMovementsCard.js';
import { VillageYard } from './VillageYard.js';

/**
 * Die Dorfübersicht als Dashboard (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Vorher standen hier sechs Karten untereinander, rund 1400 px hoch; die
 * wichtigsten Zahlen des Spiels lagen unter der Falz. Die Gebäudetabelle, die
 * den meisten Platz fraß, steht jetzt im Hauptgebäude — dort, wo man baut.
 *
 * Dorfname, Koordinaten, Kontinent, Rohstoffe und Bauernhofplätze stehen seit
 * 18-1 in der Dorfleiste des Rahmens und werden hier **nicht** wiederholt.
 */
export const VillageOverview = observer(function VillageOverview() {
    const { t } = useTranslation();
    const { village, world } = useStores();
    const view = village.view;
    const worldId = world.worldId;

    if (!view || worldId === null)
        return <p className="text-ink-light">{t('village.loading')}</p>;

    return (
        /*
         * Der Dorfplatz nimmt die Breite, eine einzige Leiste steht rechts.
         * Die Leiste beantwortet drei Fragen — was produziere ich, was steht
         * hier, kommt etwas? —, alles Weitere hat eine eigene Seite.
         */
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
                <div className="mb-4">
                    <VillageYard
                        village={view}
                        worldId={worldId}
                        buildings={world.enabledBuildings}
                    />
                </div>
                {/*
                 * Unter der Grafik: was gerade entsteht. Beide Schleifen
                 * rendern `null`, solange nichts läuft — im Ruhezustand bleibt
                 * hier nur der Dorfplatz stehen.
                 *
                 * `grid-flow-col` mit gleich breiten Spalten: Läuft nur eine
                 * Schleife, nimmt sie die ganze Breite; bei festen zwei
                 * Spalten stünde sie in einer halben und die Überschrift bräche
                 * um.
                 */}
                <div className="grid auto-cols-fr grid-flow-col gap-x-4">
                    <RecruitQueueCard queue={view.recruitQueue} />
                    <BuildQueueCard queue={view.buildQueue} />
                </div>
            </div>
            {/* Die Leiste steht eine Schriftstufe kleiner: Sie trägt Zahlen
                zum Überfliegen, nicht Text zum Lesen — und je kürzer sie ist,
                desto mehr Höhe bleibt der Grafik. */}
            <div className="text-sm">
                <ProductionCard rates={view.rates} />
                <UnitsCard units={view.units} />
                <VillageMovementsCard
                    villageId={view.id}
                    worldId={worldId}
                />
            </div>
        </div>
    );
});
