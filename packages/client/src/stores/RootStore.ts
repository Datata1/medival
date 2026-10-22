import type { WorldMessage } from '@medival/shared';
import {
    type AudioOutput,
    WebAudioOutput,
} from '../audio/AudioEngine.js';
import { AuthStore } from './AuthStore.js';
import { LobbyStore } from './LobbyStore.js';
import { MapStore } from './MapStore.js';
import { MovementsStore } from './MovementsStore.js';
import { PlayerStore } from './PlayerStore.js';
import { ReportsStore } from './ReportsStore.js';
import {
    SocketConnection,
    type WorldSocket,
} from './SocketConnection.js';
import { ArrivalWatcher, SoundStore } from './SoundStore.js';
import { TribeStore } from './TribeStore.js';
import { VillageStore } from './VillageStore.js';
import { WorldStore } from './WorldStore.js';

/**
 * Hält die Stores zusammen und besitzt den Lebenszyklus einer geöffneten Welt.
 *
 * `openWorld` startet alles, was zur Welt gehört — Laden, Polling, Socket —,
 * `closeWorld` beendet es wieder. Damit hängt kein Hintergrundvorgang mehr
 * daran, ob eine bestimmte Komponente gerade gerendert wird.
 */
export class RootStore {
    readonly auth = new AuthStore();
    readonly lobby = new LobbyStore();
    readonly world = new WorldStore();
    readonly village = new VillageStore();
    readonly map = new MapStore();
    readonly movements = new MovementsStore();
    readonly reports = new ReportsStore();
    readonly player = new PlayerStore();
    readonly tribe = new TribeStore();
    readonly sound: SoundStore;

    /** Merkt sich, was beim Öffnen schon da war — sonst tönt es beim Betreten. */
    private readonly incomingWatcher = new ArrivalWatcher();
    private readonly reportWatcher = new ArrivalWatcher();

    /** Injizierbar, damit die Stores ohne Browser-APIs testbar bleiben. */
    constructor(
        private readonly socket: WorldSocket = new SocketConnection(),
        audio: AudioOutput = new WebAudioOutput(),
    ) {
        this.sound = new SoundStore(audio);
        // Auch das Polling meldet Neues — der Socket erreicht nicht jeden Fall
        // (fremde Angriffe entstehen ohne Zutun des Spielers).
        this.movements.onReloaded = () => this.announceMovements();
        this.reports.onReloaded = () => this.announceReports();
        this.map.onActionResult = (ok) =>
            this.sound.play(ok ? 'troops.sent' : 'denied');
        this.village.onActionFailed = () => this.sound.play('denied');
    }

    /** Läuft gerade ein Öffnen? Router-Loader rufen parallel auf. */
    private opening: {
        worldId: number;
        promise: Promise<void>;
    } | null = null;

    async openWorld(worldId: number): Promise<void> {
        // Eltern- und Kind-Route laden gleichzeitig; der zweite Aufruf wartet
        // auf den ersten, statt alles abzuräumen und neu zu starten.
        if (this.opening?.worldId === worldId)
            return this.opening.promise;
        // „Schon offen" heißt: ID gesetzt *und* Daten da. Die ID allein reicht
        // nicht — sie steht schon, während der erste Ladevorgang noch läuft.
        if (this.world.worldId === worldId && this.world.summary)
            return;

        const promise = this.doOpenWorld(worldId);
        this.opening = { worldId, promise };
        try {
            await promise;
        } finally {
            if (this.opening?.worldId === worldId) this.opening = null;
        }
    }

    private async doOpenWorld(worldId: number): Promise<void> {
        this.closeWorld();
        this.socket.connect(worldId, (message) =>
            this.handleSocketMessage(message),
        );
        await Promise.all([
            this.world.open(worldId),
            this.map.load(worldId),
            this.movements.start(worldId),
            this.reports.start(worldId),
        ]);
        // Ausgangsstand festhalten: Was jetzt schon da ist, ist nicht „neu".
        this.incomingWatcher.countNew(
            this.movements.incoming.map((m) => m.id),
        );
        this.reportWatcher.countNew(this.reports.list.map((r) => r.id));

        /*
         * Ohne ausdrückliche Wahl das erste eigene Dorf zeigen — aber nur
         * dann. Der Loader der Dorfroute läuft **parallel** zu diesem hier
         * (TanStack lädt Eltern und Kind gleichzeitig, solange das Kind keine
         * Elterndaten anfordert). Ohne diese Prüfung gewann das Ende dieser
         * Methode das Rennen, und `/worlds/2/village/103` zeigte nach einem
         * Neuladen das erste Dorf, während die Adresszeile auf 103 stand.
         */
        const first = this.world.playerVillages[0];
        if (first && this.village.villageId === null)
            await this.village.select(worldId, first.id);
    }

    /**
     * Die Welt neu öffnen — nach dem Beitreten (19-9): Jetzt gibt es einen
     * Spieler und ein Dorf, das gewählt werden kann.
     */
    async reopenWorld(worldId: number): Promise<void> {
        this.opening = null;
        await this.openWorld(worldId);
    }

    closeWorld(): void {
        this.incomingWatcher.reset();
        this.reportWatcher.reset();
        this.socket.disconnect();
        this.movements.stop();
        this.reports.stop();
        this.player.clear();
        this.tribe.clear();
        this.map.clear();
        this.village.clear();
        this.world.close();
    }

    /** Ein Alarm nur für Angriffe, die gerade erst aufgetaucht sind. */
    announceMovements(): void {
        const attacks = this.movements.incoming
            .filter((m) => m.kind === 'attack')
            .map((m) => m.id);
        if (this.incomingWatcher.countNew(attacks) > 0) {
            this.sound.play('attack.incoming');
        }
    }

    private ownsVillage(villageId: number): boolean {
        return this.world.playerVillages.some(
            (v) => v.id === villageId,
        );
    }

    /** Ein Rascheln nur für Berichte, die gerade erst eingetroffen sind. */
    announceReports(): void {
        if (
            this.reportWatcher.countNew(
                this.reports.list.map((r) => r.id),
            ) > 0
        ) {
            this.sound.play('report.arrived');
        }
    }

    /** Eine Nachricht, ein gezielter Reload. */
    handleSocketMessage(message: WorldMessage): void {
        switch (message.type) {
            case 'village_updated':
            case 'build_complete':
                if (this.village.villageId === message.villageId) {
                    void this.village.reload();
                }
                // Punkte und Besitzer stehen auch auf der Karte. Ohne das
                // Nachladen zeigt ein erobertes Dorf bis zum nächsten Öffnen
                // der Welt weiter seinen alten Herrn.
                if (message.type === 'village_updated') {
                    this.map.reload();
                }
                if (
                    message.type === 'build_complete' &&
                    this.ownsVillage(message.villageId)
                ) {
                    this.sound.play('build.complete');
                }
                break;
            case 'movement':
                void this.movements
                    .reload()
                    .then(() => this.announceMovements());
                // Eine Bewegung endet oft in einer Eroberung; die Karte muss
                // den neuen Besitzer zeigen, nicht den von vorhin.
                this.map.reload();
                break;
            case 'report':
                void this.reports
                    .reload()
                    .then(() => this.announceReports());
                break;
            case 'tribe':
                void this.tribe.reload();
                break;
            case 'map_changed':
                // Öffentlich (19-9): neues Dorf oder Besitzerwechsel irgendwo.
                this.map.reload();
                break;
            case 'world_status':
                void this.world.reload();
                void this.village.reload();
                break;
        }
    }
}
