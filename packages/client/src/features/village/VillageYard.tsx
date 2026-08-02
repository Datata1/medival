import type { BuildingType, VillageView } from '@medival/shared';
import { BUILDING_ORDER, RALLY_POINT } from '@medival/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import yardBackground from '../../assets/backgrounds/village-yard.png';
import { Icon } from '../../components/Icon.js';
import { effectiveLevels } from './derive.js';

/**
 * Wo steht welches Gebäude? Anteile der Fläche, damit die Grafik mit jeder
 * Breite mitwächst.
 *
 * Ein `Record` über den Gebäudetyp und keine Liste: Kommt im Shared-Paket ein
 * Gebäude dazu, ist das hier sofort ein Typfehler statt eines Hauses, das
 * niemand findet.
 */
const BUILDING_SLOTS: Record<BuildingType, { x: number; y: number }> = {
    headquarters: { x: 50, y: 45 },
    barracks: { x: 27, y: 25 },
    stable: { x: 73, y: 25 },
    warehouse: { x: 15, y: 50 },
    farm: { x: 85, y: 50 },
    market: { x: 28, y: 72 },
    academy: { x: 72, y: 72 },
    timber_camp: { x: 40, y: 85 },
    clay_pit: { x: 60, y: 85 },
    iron_mine: { x: 50, y: 14 },
    // Der Wall sitzt auf der Palisade, nicht im Dorf.
    wall: { x: 84, y: 68 },
};

/**
 * Der Versammlungsplatz steht in der Mitte des Dorfes, unter dem
 * Hauptgebäude. Er hat einen eigenen Platz und keinen Eintrag in
 * `BUILDING_SLOTS`, weil er kein Gebäude ist: immer da, immer Stufe 1.
 */
const RALLY_SLOT = { x: 50, y: 68 };

/**
 * Der Dorfplatz mit klickbaren Gebäuden (plans/18-ux/18-2-dorfuebersicht.md).
 *
 * Die Grafik nimmt die ganze Breite des Rahmens ein; sie ist breit und flach
 * (5:2), weil unter den Leisten aus 18-1 nur die Höhe knapp ist. Der
 * Hintergrund wird in derselben Form erzeugt, es wird also nichts
 * beschnitten.
 *
 * **Bewusst DOM statt Canvas.** Elf Häuser sind keine Kartendaten: Als
 * `<Link>` gibt es Tastaturbedienung, Fokusring, Titel und
 * Screenreader-Beschriftung geschenkt, die ein Canvas mit Hit-Test-, Fokus-
 * und ARIA-Code von Hand nachbauen müsste. Die Karte (18-3) bleibt Canvas —
 * dort sind es hunderte Objekte.
 */
export function VillageYard({
    village,
    worldId,
}: {
    village: VillageView;
    worldId: number;
}) {
    const { t } = useTranslation();
    // Zielstufen inklusive Bauschleife — dieselbe Rechnung wie im Server.
    const targets = effectiveLevels(village);

    return (
        <div
            className="pixelated relative aspect-[5/2] w-full overflow-hidden rounded-xs border-2 border-oak bg-center bg-cover"
            style={{ backgroundImage: `url(${yardBackground})` }}
        >
            {BUILDING_ORDER.map((type) => {
                const level = village.buildings[type];
                const target = targets[type];
                const building = t(`buildings.${type}`);
                const underConstruction = target > level;
                const label = [
                    level > 0
                        ? t('village.overview.atLevel', {
                              building,
                              level,
                          })
                        : t('village.overview.buildSite', { building }),
                    underConstruction
                        ? t('village.overview.underConstruction', {
                              level: target,
                          })
                        : null,
                ]
                    .filter((part) => part !== null)
                    .join(', ');

                return (
                    <Link
                        key={type}
                        to="/worlds/$worldId/village/$villageId/$building"
                        params={{
                            worldId: String(worldId),
                            villageId: String(village.id),
                            building: type,
                        }}
                        title={label}
                        aria-label={label}
                        style={{
                            left: `${BUILDING_SLOTS[type].x}%`,
                            top: `${BUILDING_SLOTS[type].y}%`,
                        }}
                        className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col items-center rounded-xs p-0.5 hover:bg-parchment/40"
                    >
                        <Icon
                            name={`yard.${type}`}
                            // Die Zeichnungen sind 32 px und werden hier
                            // verdoppelt: ganze Vielfache bleiben scharf,
                            // krumme Faktoren fransen bei Pixelgrafik aus.
                            size={64}
                            // Stufe 0 ist ein leerer Bauplatz: gedimmt, aber
                            // klickbar — sonst käme man nie zum ersten Bau.
                            className={level > 0 ? '' : 'opacity-45'}
                        />
                        {level > 0 && (
                            <span
                                className={`-mt-1.5 rounded-xs border px-1 font-body text-parchment text-xs leading-tight tabular-nums ${
                                    underConstruction
                                        ? 'border-timber bg-seal'
                                        : 'border-timber bg-moss'
                                }`}
                            >
                                {underConstruction
                                    ? `${level}→${target}`
                                    : level}
                            </span>
                        )}
                    </Link>
                );
            })}
            <RallyHotspot village={village} worldId={worldId} />
        </div>
    );
}

/**
 * Der Versammlungsplatz auf dem Dorfplatz. Er wird nie gebaut und trägt
 * deshalb auch keine Stufenplakette — er steht einfach da.
 */
function RallyHotspot({
    village,
    worldId,
}: {
    village: VillageView;
    worldId: number;
}) {
    const { t } = useTranslation();
    return (
        <Link
            to="/worlds/$worldId/village/$villageId/$building"
            params={{
                worldId: String(worldId),
                villageId: String(village.id),
                building: RALLY_POINT,
            }}
            title={t('buildings.rally')}
            aria-label={t('buildings.rally')}
            style={{
                left: `${RALLY_SLOT.x}%`,
                top: `${RALLY_SLOT.y}%`,
            }}
            className="-translate-x-1/2 -translate-y-1/2 absolute flex flex-col items-center rounded-xs p-0.5 hover:bg-parchment/40"
        >
            <Icon name="yard.rally" size={64} />
        </Link>
    );
}
