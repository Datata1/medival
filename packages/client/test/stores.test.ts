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
        getMap: vi.fn(),
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
        mocked.getMap.mockResolvedValue([]);
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
        mocked.getMap.mockResolvedValue([]);
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
        mocked.getMap.mockResolvedValue([]);
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
