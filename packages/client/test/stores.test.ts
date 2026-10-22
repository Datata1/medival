import type {
    VillageView,
    WorldMessage,
    WorldSummary,
} from '@medival/shared';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

/**
 * Store-Tests laufen ohne Rendering — genau das war das Ziel von Plan 09.
 * Der API-Client wird gemockt; die Stores werden danach importiert.
 */
vi.mock('../src/api/client.js', () => ({
    api: {
        listWorlds: vi.fn(),
        createWorld: vi.fn(),
        deleteWorld: vi.fn(),
        getWorld: vi.fn(),
        pauseWorld: vi.fn(),
        resumeWorld: vi.fn(),
        getVillage: vi.fn(),
        build: vi.fn(),
        recruit: vi.fn(),
        getMapTiles: vi.fn(),
        getMapVillageAt: vi.fn(),
        getMovements: vi.fn(),
        getReports: vi.fn(),
        markReportsRead: vi.fn(),
        send: vi.fn(),
    },
}));

const { api } = await import('../src/api/client.js');
const { LobbyStore } = await import('../src/stores/LobbyStore.js');
const { VillageStore } = await import('../src/stores/VillageStore.js');
const { WorldStore } = await import('../src/stores/WorldStore.js');
const { MovementsStore } = await import(
    '../src/stores/MovementsStore.js'
);
const { ReportsStore } = await import('../src/stores/ReportsStore.js');
const { MapStore } = await import('../src/stores/MapStore.js');
const { RootStore } = await import('../src/stores/RootStore.js');
type WorldSocket =
    import('../src/stores/SocketConnection.js').WorldSocket;

const mocked = vi.mocked(api);

/** Socket-Attrappe: der Test bestimmt, wann eine Nachricht eintrifft. */
class FakeSocket implements WorldSocket {
    connected = false;
    private handler: ((message: WorldMessage) => void) | null = null;

    connect(
        _worldId: number,
        onMessage: (message: WorldMessage) => void,
    ): void {
        this.connected = true;
        this.handler = onMessage;
    }

    disconnect(): void {
        this.connected = false;
        this.handler = null;
    }

    emit(message: WorldMessage): void {
        this.handler?.(message);
    }
}

function worldSummary(
    overrides: Partial<WorldSummary> = {},
): WorldSummary {
    return {
        id: 1,
        name: 'Testwelt',
        status: 'running',
        settings: {
            speed: 100,
            unitSpeed: 30,
            mapSize: 40,
            botCount: 3,
            barbarianCount: 5,
            victoryVillageShare: 0.6,
            seed: 1,
        },
        gameTime: 1_000,
        epochZeroMs: 1_800_000_000_000,
        devMode: false,
        playerVillages: [
            { id: 7, name: 'Heimatdorf', x: 20, y: 20, points: 26 },
        ],
        ...overrides,
    } as WorldSummary;
}

function villageView(
    overrides: Partial<VillageView> = {},
): VillageView {
    return {
        id: 7,
        playerId: 1,
        name: 'Heimatdorf',
        x: 20,
        y: 20,
        loyalty: 100,
        points: 26,
        gameTime: 1_000,
        resources: { wood: 500, clay: 500, iron: 400 },
        capacity: 1000,
        rates: { wood: 3000, clay: 3000, iron: 3000 },
        buildings: {
            headquarters: 1,
            timber_camp: 1,
            clay_pit: 1,
            iron_mine: 1,
            warehouse: 1,
            farm: 1,
            barracks: 0,
            stable: 0,
            wall: 0,
            academy: 0,
        },
        buildQueue: [],
        recruitQueue: [],
        units: {},
        popUsed: 20,
        popMax: 240,
        ...overrides,
    } as VillageView;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('LobbyStore', () => {
    it('lädt die Weltenliste', async () => {
        mocked.listWorlds.mockResolvedValue([]);
        const lobby = new LobbyStore();
        await lobby.load();
        expect(lobby.list).toEqual([]);
        expect(mocked.listWorlds).toHaveBeenCalledOnce();
    });

    it('lädt nach dem Anlegen neu und liefert die neue ID', async () => {
        mocked.createWorld.mockResolvedValue(worldSummary({ id: 42 }));
        mocked.listWorlds.mockResolvedValue([]);
        const lobby = new LobbyStore();

        const id = await lobby.createWorld('Neu', { speed: 200 });

        expect(id).toBe(42);
        expect(mocked.listWorlds).toHaveBeenCalledOnce();
        expect(lobby.submitError).toBeNull();
    });

    it('macht aus einem Serverfehler Zustand statt einer Exception', async () => {
        mocked.createWorld.mockRejectedValue(
            new Error('invalid_input'),
        );
        const lobby = new LobbyStore();

        const id = await lobby.createWorld('Kaputt', { speed: -1 });

        expect(id).toBeNull();
        expect(lobby.submitError).not.toBeNull();
        expect(lobby.isSubmitting).toBe(false);
    });
});

describe('VillageStore', () => {
    it('übernimmt die Antwort einer Bau-Aktion ohne zweiten Abruf', async () => {
        mocked.getVillage.mockResolvedValue(villageView());
        mocked.build.mockResolvedValue(
            villageView({
                buildings: {
                    ...villageView().buildings,
                    timber_camp: 2,
                },
            }),
        );
        const village = new VillageStore();
        await village.select(1, 7);

        await village.build('timber_camp');

        expect(village.view?.buildings.timber_camp).toBe(2);
        expect(mocked.getVillage).toHaveBeenCalledOnce(); // kein Nachladen
        expect(village.isBuilding).toBe(false);
    });

    it('hält einen Baufehler als Zustand fest', async () => {
        mocked.getVillage.mockResolvedValue(villageView());
        mocked.build.mockRejectedValue(
            new Error('not_enough_resources'),
        );
        const village = new VillageStore();
        await village.select(1, 7);

        await village.build('academy');

        expect(village.buildError).toBe('Nicht genug Rohstoffe');
        expect(village.isBuilding).toBe(false);
    });
});

describe('WorldStore: Spielzeit', () => {
    it('rechnet die Spielzeit zwischen Server-Antworten hoch', async () => {
        vi.useFakeTimers();
        mocked.getWorld.mockResolvedValue(
            worldSummary({ gameTime: 1_000 }),
        );
        const world = new WorldStore();
        await world.open(1);

        expect(world.gameTime).toBe(1_000);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(world.gameTime).toBeGreaterThanOrEqual(3_000);

        world.close();
    });

    it('rechnet Spielzeitpunkte in Serverzeit um (19-3)', async () => {
        mocked.getWorld.mockResolvedValue(
            worldSummary({
                epochZeroMs: 1_800_000_000_000,
                devMode: true,
            }),
        );
        const world = new WorldStore();
        await world.open(1);
        // Ankunft bei Spielzeit 90 s: 90 s nach dem Nullpunkt des Servers,
        // unabhängig davon, wie die Uhr des Browsers steht.
        expect(world.clockOf(90_000)).toBe(1_800_000_090_000);
        expect(world.devMode).toBe(true);
        world.close();
    });

    it('lässt die Uhr stehen, während die Welt pausiert ist', async () => {
        vi.useFakeTimers();
        mocked.getWorld.mockResolvedValue(
            worldSummary({ status: 'paused', gameTime: 5_000 }),
        );
        const world = new WorldStore();
        await world.open(1);

        await vi.advanceTimersByTimeAsync(3_000);

        expect(world.gameTime).toBe(5_000);
        world.close();
    });
});

describe('MovementsStore: Polling am Welt-Lebenszyklus', () => {
    it('pollt, solange die Welt offen ist, und stoppt danach', async () => {
        vi.useFakeTimers();
        mocked.getMovements.mockResolvedValue({
            gameTime: 0,
            incoming: [],
            outgoing: [],
        } as never);
        const movements = new MovementsStore();

        await movements.start(1);
        expect(mocked.getMovements).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(
            mocked.getMovements.mock.calls.length,
        ).toBeGreaterThanOrEqual(3);

        const callsBeforeStop = mocked.getMovements.mock.calls.length;
        movements.stop();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(mocked.getMovements).toHaveBeenCalledTimes(
            callsBeforeStop,
        );
    });
});

describe('ReportsStore', () => {
    it('zählt ungelesene Berichte', async () => {
        mocked.getReports.mockResolvedValue([
            { id: 1, read: false },
            { id: 2, read: true },
        ] as never);
        const reports = new ReportsStore();
        reports.worldId = 1;
        await reports.reload();

        expect(reports.unreadCount).toBe(1);
    });

    it('markiert nur dann als gelesen, wenn es Ungelesene gibt', async () => {
        mocked.getReports.mockResolvedValue([
            { id: 1, read: true },
        ] as never);
        mocked.markReportsRead.mockResolvedValue({ ok: true });
        const reports = new ReportsStore();
        reports.worldId = 1;
        await reports.reload();

        await reports.markAllRead();

        expect(mocked.markReportsRead).not.toHaveBeenCalled();
    });
});

describe('RootStore: Socket-Nachrichten lösen gezielte Reloads aus', () => {
    it('lädt genau das betroffene Dorf neu', async () => {
        mocked.getWorld.mockResolvedValue(worldSummary());
        mocked.getVillage.mockResolvedValue(villageView());
        mocked.getMapTiles.mockResolvedValue({ tiles: [] });
        mocked.getMovements.mockResolvedValue({
            gameTime: 0,
            incoming: [],
            outgoing: [],
        } as never);
        mocked.getReports.mockResolvedValue([]);

        const socket = new FakeSocket();
        const root = new RootStore(socket);
        await root.openWorld(1);
        const callsBefore = mocked.getVillage.mock.calls.length;

        // Nachricht für ein fremdes Dorf ändert nichts …
        socket.emit({ type: 'village_updated', villageId: 999 });
        expect(mocked.getVillage).toHaveBeenCalledTimes(callsBefore);

        // … die für das aktive Dorf schon.
        socket.emit({ type: 'village_updated', villageId: 7 });
        expect(mocked.getVillage).toHaveBeenCalledTimes(
            callsBefore + 1,
        );

        root.closeWorld();
    });

    it('klingt nur beim Bau im eigenen Dorf', async () => {
        mocked.getWorld.mockResolvedValue(worldSummary());
        mocked.getVillage.mockResolvedValue(villageView());
        mocked.getMapTiles.mockResolvedValue({ tiles: [] });
        mocked.getMovements.mockResolvedValue({
            gameTime: 0,
            incoming: [],
            outgoing: [],
        } as never);
        mocked.getReports.mockResolvedValue([]);

        const played: string[] = [];
        const audio = {
            isReady: true,
            unlock: () => {},
            play: (sound: string) => played.push(sound),
        };
        const socket = new FakeSocket();
        const root = new RootStore(socket, audio as never);
        root.sound.unlock();
        await root.openWorld(1);

        // Der Server sendet an die ganze Welt — Bot- und Barbarendörfer
        // bauen ständig aus. Das darf beim Spieler nicht zu hören sein.
        socket.emit({ type: 'build_complete', villageId: 999 });
        expect(played).toEqual([]);

        socket.emit({ type: 'build_complete', villageId: 7 });
        expect(played).toEqual(['build.complete']);

        root.closeWorld();
    });

    it('räumt beim Schließen alles ab', async () => {
        mocked.getWorld.mockResolvedValue(worldSummary());
        mocked.getVillage.mockResolvedValue(villageView());
        mocked.getMapTiles.mockResolvedValue({ tiles: [] });
        mocked.getMovements.mockResolvedValue({
            gameTime: 0,
            incoming: [],
            outgoing: [],
        } as never);
        mocked.getReports.mockResolvedValue([]);

        const socket = new FakeSocket();
        const root = new RootStore(socket);
        await root.openWorld(1);
        root.closeWorld();

        expect(socket.connected).toBe(false);

        expect(root.world.worldId).toBeNull();
        expect(root.village.villageId).toBeNull();
        expect(root.map.list).toEqual([]);
        expect(root.reports.list).toEqual([]);
    });
});

describe('RootStore: die Adresszeile bestimmt das Dorf', () => {
    /**
     * Eltern- und Kindroute laden gleichzeitig. Gewinnt `openWorld` das
     * Rennen, zeigt ein Neuladen von `/village/103` das erste Dorf, während
     * die Adresszeile 103 nennt (Plan 18-2).
     */
    it('überschreibt eine bereits getroffene Dorfwahl nicht', async () => {
        mocked.getWorld.mockResolvedValue(
            worldSummary({
                playerVillages: [
                    {
                        id: 7,
                        name: 'Heimatdorf',
                        x: 20,
                        y: 20,
                        points: 26,
                    },
                    {
                        id: 103,
                        name: 'Zweitdorf',
                        x: 21,
                        y: 20,
                        points: 9,
                    },
                ],
            }),
        );
        mocked.getVillage.mockResolvedValue(villageView());
        mocked.getMapTiles.mockResolvedValue({ tiles: [] });
        mocked.getMovements.mockResolvedValue({
            gameTime: 0,
            incoming: [],
            outgoing: [],
        } as never);
        mocked.getReports.mockResolvedValue([]);

        const root = new RootStore(new FakeSocket());
        // Der Loader der Dorfroute läuft parallel — hier: währenddessen.
        const opening = root.openWorld(1);
        await root.village.select(1, 103);
        await opening;

        expect(root.village.villageId).toBe(103);
        root.closeWorld();
    });

    it('wählt ohne Wahl weiterhin das erste eigene Dorf', async () => {
        mocked.getWorld.mockResolvedValue(worldSummary());
        mocked.getVillage.mockResolvedValue(villageView());
        mocked.getMapTiles.mockResolvedValue({ tiles: [] });
        mocked.getMovements.mockResolvedValue({
            gameTime: 0,
            incoming: [],
            outgoing: [],
        } as never);
        mocked.getReports.mockResolvedValue([]);

        const root = new RootStore(new FakeSocket());
        await root.openWorld(1);

        expect(root.village.villageId).toBe(7);
        root.closeWorld();
    });
});

describe('MapStore: Karte in Kacheln (19-7)', () => {
    /** Antwortet mit leeren Kacheln für genau das angefragte Rechteck. */
    function serveTiles(
        villages: { id: number; x: number; y: number }[] = [],
    ) {
        mocked.getMapTiles.mockImplementation(
            async (
                _world: number,
                r: {
                    tx0: number;
                    ty0: number;
                    tx1: number;
                    ty1: number;
                },
            ) => {
                const tiles = [];
                for (let tx = r.tx0; tx <= r.tx1; tx++)
                    for (let ty = r.ty0; ty <= r.ty1; ty++)
                        tiles.push({
                            tx,
                            ty,
                            villages: villages
                                .filter(
                                    (v) =>
                                        Math.floor(v.x / 20) === tx &&
                                        Math.floor(v.y / 20) === ty,
                                )
                                .map((v) => ({
                                    ...v,
                                    playerId: null,
                                    name: 'Dorf',
                                    points: 10,
                                })),
                        });
                return { tiles };
            },
        );
    }

    it('lädt einen 100×100-Ausschnitt in einer Anfrage und dann nicht erneut', async () => {
        serveTiles([{ id: 1, x: 510, y: 505 }]);
        const map = new MapStore();
        await map.load(1);
        await map.showArea(450, 450, 549, 549);
        expect(mocked.getMapTiles).toHaveBeenCalledTimes(1);
        expect(mocked.getMapTiles).toHaveBeenLastCalledWith(1, {
            tx0: 22,
            ty0: 22,
            tx1: 27,
            ty1: 27,
        });
        expect(map.tiles.size).toBe(36);
        expect(map.villageAt(510, 505)?.id).toBe(1);

        // Derselbe Ausschnitt noch einmal: alles im Cache.
        await map.showArea(450, 450, 549, 549);
        expect(mocked.getMapTiles).toHaveBeenCalledTimes(1);
        // Ein Feld weiter rechts: nur die neue Spalte fehlt — eine Anfrage.
        await map.showArea(470, 450, 569, 549);
        expect(mocked.getMapTiles).toHaveBeenCalledTimes(2);
    });

    it('lädt die Kachel eines eingetippten Feldes nach', async () => {
        serveTiles([{ id: 9, x: 123, y: 456 }]);
        const map = new MapStore();
        await map.load(1);
        expect(map.villageAt(123, 456)).toBeNull();
        await map.ensurePoint(123, 456);
        expect(map.villageAt(123, 456)?.id).toBe(9);
        await map.ensurePoint(124, 457);
        expect(mocked.getMapTiles).toHaveBeenCalledTimes(1);
    });

    it('verdrängt die am längsten ungenutzten Kacheln über 400', async () => {
        serveTiles();
        const map = new MapStore();
        await map.load(1);
        // 12 Ausschnitte à 36 Kacheln nebeneinander = 432 Kacheln.
        for (let i = 0; i < 12; i++)
            await map.showArea(i * 120, 0, i * 120 + 119, 119);
        expect(map.tiles.size).toBe(400);
        expect(map.isLoadedAt(0, 0)).toBe(false);
        expect(map.isLoadedAt(11 * 120, 0)).toBe(true);
    });

    it('drosselt das Nachladen auf einmal je Sekunde', async () => {
        vi.useFakeTimers();
        serveTiles();
        const map = new MapStore();
        await map.load(1);
        await map.showArea(0, 0, 99, 99);
        mocked.getMapTiles.mockClear();
        // Ein Schwall von zehn Nachrichten: eine Anfrage sofort …
        for (let i = 0; i < 10; i++) map.reload();
        expect(mocked.getMapTiles).toHaveBeenCalledTimes(1);
        // … und eine nach Ablauf der Sekunde.
        await vi.advanceTimersByTimeAsync(1_000);
        expect(mocked.getMapTiles).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('fragt dieselben Kacheln nicht doppelt an, solange die Antwort aussteht', async () => {
        serveTiles();
        const map = new MapStore();
        await map.load(1);
        await Promise.all([
            map.showArea(0, 0, 99, 99),
            map.showArea(0, 0, 99, 99),
        ]);
        expect(mocked.getMapTiles).toHaveBeenCalledTimes(1);
    });
});
