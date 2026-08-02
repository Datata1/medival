/**
 * Verzeichnis aller Sprites (siehe plans/12-assets-und-sprites.md).
 *
 * Generiert von `pnpm assets:generate`, aber bewusst mitversioniert: Der
 * typisierte Katalog macht einen Tippfehler in `<Icon name="wodd" />` zum
 * Compile-Fehler statt zu einem leeren Bild. Vite hasht die Dateien beim Bauen.
 *
 * Eine eigene Zeichnung ersetzt einen Platzhalter, indem sie unter demselben
 * Dateinamen und in derselben Größe abgelegt wird — hier ist nichts zu ändern.
 */
import iconAttack from './sprites/icons/attack.png';
import iconClay from './sprites/icons/clay.png';
import iconConquered from './sprites/icons/conquered.png';
import iconDefeat from './sprites/icons/defeat.png';
import iconIron from './sprites/icons/iron.png';
import iconMap from './sprites/icons/map.png';
import iconPause from './sprites/icons/pause.png';
import iconPlay from './sprites/icons/play.png';
import iconPopulation from './sprites/icons/population.png';
import iconReport from './sprites/icons/report.png';
import iconReturn from './sprites/icons/return.png';
import iconSoundOff from './sprites/icons/sound-off.png';
import iconSoundOn from './sprites/icons/sound-on.png';
import iconSupport from './sprites/icons/support.png';
import iconVictory from './sprites/icons/victory.png';
import iconVillage from './sprites/icons/village.png';
import iconWarning from './sprites/icons/warning.png';
import iconWood from './sprites/icons/wood.png';
import buildingAcademy from './sprites/buildings/academy.png';
import buildingBarracks from './sprites/buildings/barracks.png';
import buildingClay_pit from './sprites/buildings/clay_pit.png';
import buildingFarm from './sprites/buildings/farm.png';
import buildingHeadquarters from './sprites/buildings/headquarters.png';
import buildingIron_mine from './sprites/buildings/iron_mine.png';
import buildingStable from './sprites/buildings/stable.png';
import buildingTimber_camp from './sprites/buildings/timber_camp.png';
import buildingWall from './sprites/buildings/wall.png';
import buildingWarehouse from './sprites/buildings/warehouse.png';
import unitAxe from './sprites/units/axe.png';
import unitHeavy_cavalry from './sprites/units/heavy_cavalry.png';
import unitLight_cavalry from './sprites/units/light_cavalry.png';
import unitNoble from './sprites/units/noble.png';
import unitRam from './sprites/units/ram.png';
import unitSpear from './sprites/units/spear.png';
import unitSword from './sprites/units/sword.png';
import mapVillageBarbarian from './sprites/map/village-barbarian.png';
import mapVillageBot from './sprites/map/village-bot.png';
import mapVillagePlayer from './sprites/map/village-player.png';

export const SPRITES = {
    'icon.attack': iconAttack,
    'icon.clay': iconClay,
    'icon.conquered': iconConquered,
    'icon.defeat': iconDefeat,
    'icon.iron': iconIron,
    'icon.map': iconMap,
    'icon.pause': iconPause,
    'icon.play': iconPlay,
    'icon.population': iconPopulation,
    'icon.report': iconReport,
    'icon.return': iconReturn,
    'icon.sound.off': iconSoundOff,
    'icon.sound.on': iconSoundOn,
    'icon.support': iconSupport,
    'icon.victory': iconVictory,
    'icon.village': iconVillage,
    'icon.warning': iconWarning,
    'icon.wood': iconWood,
    'building.academy': buildingAcademy,
    'building.barracks': buildingBarracks,
    'building.clay_pit': buildingClay_pit,
    'building.farm': buildingFarm,
    'building.headquarters': buildingHeadquarters,
    'building.iron_mine': buildingIron_mine,
    'building.stable': buildingStable,
    'building.timber_camp': buildingTimber_camp,
    'building.wall': buildingWall,
    'building.warehouse': buildingWarehouse,
    'unit.axe': unitAxe,
    'unit.heavy_cavalry': unitHeavy_cavalry,
    'unit.light_cavalry': unitLight_cavalry,
    'unit.noble': unitNoble,
    'unit.ram': unitRam,
    'unit.spear': unitSpear,
    'unit.sword': unitSword,
    'map.village.barbarian': mapVillageBarbarian,
    'map.village.bot': mapVillageBot,
    'map.village.player': mapVillagePlayer,
} as const;

export type SpriteId = keyof typeof SPRITES;

/** Alle bekannten IDs — für Vollständigkeitsprüfungen und Übersichten. */
export const SPRITE_IDS = Object.keys(SPRITES) as SpriteId[];
