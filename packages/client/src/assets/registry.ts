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
import iconHandbook from './sprites/icons/handbook.png';
import iconIron from './sprites/icons/iron.png';
import iconMap from './sprites/icons/map.png';
import iconMessage from './sprites/icons/message.png';
import iconPause from './sprites/icons/pause.png';
import iconPlay from './sprites/icons/play.png';
import iconPopulation from './sprites/icons/population.png';
import iconProfile from './sprites/icons/profile.png';
import iconRanking from './sprites/icons/ranking.png';
import iconReport from './sprites/icons/report.png';
import iconReturn from './sprites/icons/return.png';
import iconSettings from './sprites/icons/settings.png';
import iconSoundOff from './sprites/icons/sound-off.png';
import iconSoundOn from './sprites/icons/sound-on.png';
import iconSupport from './sprites/icons/support.png';
import iconTrade from './sprites/icons/trade.png';
import iconTribe from './sprites/icons/tribe.png';
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
import buildingMarket from './sprites/buildings/market.png';
import buildingRally from './sprites/buildings/rally.png';
import buildingStable from './sprites/buildings/stable.png';
import buildingTimber_camp from './sprites/buildings/timber_camp.png';
import buildingWorkshop from './sprites/buildings/workshop.png';
import buildingWall from './sprites/buildings/wall.png';
import buildingWarehouse from './sprites/buildings/warehouse.png';
import unitArcher from './sprites/units/archer.png';
import unitAxe from './sprites/units/axe.png';
import unitCatapult from './sprites/units/catapult.png';
import unitHeavy_cavalry from './sprites/units/heavy_cavalry.png';
import unitLight_cavalry from './sprites/units/light_cavalry.png';
import unitMounted_archer from './sprites/units/mounted_archer.png';
import unitNoble from './sprites/units/noble.png';
import unitRam from './sprites/units/ram.png';
import unitSpear from './sprites/units/spear.png';
import unitSpy from './sprites/units/spy.png';
import unitSword from './sprites/units/sword.png';
import mapVillageBarbarian from './sprites/map/village-barbarian.png';
import mapVillageBot from './sprites/map/village-bot.png';
import mapVillagePlayer from './sprites/map/village-player.png';
import terrainForest from './sprites/terrain/forest.png';
import terrainHill from './sprites/terrain/hill.png';
import terrainWater from './sprites/terrain/water.png';
import yardAcademy from './sprites/yard/academy.png';
import yardBarracks from './sprites/yard/barracks.png';
import yardClay_pit from './sprites/yard/clay_pit.png';
import yardFarm from './sprites/yard/farm.png';
import yardHeadquarters from './sprites/yard/headquarters.png';
import yardIron_mine from './sprites/yard/iron_mine.png';
import yardMarket from './sprites/yard/market.png';
import yardRally from './sprites/yard/rally.png';
import yardStable from './sprites/yard/stable.png';
import yardTimber_camp from './sprites/yard/timber_camp.png';
import yardWall from './sprites/yard/wall.png';
import yardWarehouse from './sprites/yard/warehouse.png';
import yardWorkshop from './sprites/yard/workshop.png';

export const SPRITES = {
    'icon.attack': iconAttack,
    'icon.clay': iconClay,
    'icon.conquered': iconConquered,
    'icon.defeat': iconDefeat,
    'icon.handbook': iconHandbook,
    'icon.iron': iconIron,
    'icon.map': iconMap,
    'icon.message': iconMessage,
    'icon.pause': iconPause,
    'icon.play': iconPlay,
    'icon.population': iconPopulation,
    'icon.profile': iconProfile,
    'icon.ranking': iconRanking,
    'icon.report': iconReport,
    'icon.return': iconReturn,
    'icon.settings': iconSettings,
    'icon.sound.off': iconSoundOff,
    'icon.sound.on': iconSoundOn,
    'icon.support': iconSupport,
    'icon.trade': iconTrade,
    'icon.tribe': iconTribe,
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
    'building.market': buildingMarket,
    'building.rally': buildingRally,
    'building.stable': buildingStable,
    'building.workshop': buildingWorkshop,
    'building.timber_camp': buildingTimber_camp,
    'building.wall': buildingWall,
    'building.warehouse': buildingWarehouse,
    'unit.axe': unitAxe,
    'unit.heavy_cavalry': unitHeavy_cavalry,
    'unit.light_cavalry': unitLight_cavalry,
    'unit.noble': unitNoble,
    'unit.ram': unitRam,
    'unit.spear': unitSpear,
    'unit.spy': unitSpy,
    'unit.archer': unitArcher,
    'unit.mounted_archer': unitMounted_archer,
    'unit.catapult': unitCatapult,
    'unit.sword': unitSword,
    'map.village.barbarian': mapVillageBarbarian,
    'map.village.bot': mapVillageBot,
    'map.village.player': mapVillagePlayer,
    // Das Kartengelände, 32×32 (plans/18-ux/18-3-karte.md).
    'terrain.forest': terrainForest,
    'terrain.hill': terrainHill,
    'terrain.water': terrainWater,
    // Die Gebäude auf dem Dorfplatz, 32×32 (plans/18-ux/18-2-dorfuebersicht.md).
    'yard.academy': yardAcademy,
    'yard.barracks': yardBarracks,
    'yard.clay_pit': yardClay_pit,
    'yard.farm': yardFarm,
    'yard.headquarters': yardHeadquarters,
    'yard.iron_mine': yardIron_mine,
    'yard.market': yardMarket,
    'yard.rally': yardRally,
    'yard.stable': yardStable,
    'yard.workshop': yardWorkshop,
    'yard.timber_camp': yardTimber_camp,
    'yard.wall': yardWall,
    'yard.warehouse': yardWarehouse,
} as const;

export type SpriteId = keyof typeof SPRITES;

/** Alle bekannten IDs — für Vollständigkeitsprüfungen und Übersichten. */
export const SPRITE_IDS = Object.keys(SPRITES) as SpriteId[];
