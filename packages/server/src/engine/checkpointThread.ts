import { Worker } from 'node:worker_threads';
import { z } from 'zod';

/**
 * Der Haupt-Thread-Teil der WAL-Checkpoints (plans/20-nacharbeiten/20-1).
 *
 * Seit 19-15 lief der Checkpoint im Persist-Takt im Haupt-Thread: 15 ms im
 * Zielszenario, aber 287 ms (p50) bis 711 ms im Stresslauf bei Speed 1000 —
 * der einzige Grund für die gerissenen HTTP-Grenzen dort. Hier übernimmt ein
 * Worker mit eigener Verbindung; der Haupt-Thread schickt nur noch den
 * Dateinamen.
 *
 * Fällt der Worker aus, meldet `available` `false`, und der `WorldManager`
 * checkpointet wieder selbst.
 */
const ReplySchema = z.object({
    id: z.number().int(),
    ok: z.boolean(),
    ms: z.number(),
    result: z
        .object({
            busy: z.number(),
            log: z.number(),
            checkpointed: z.number(),
        })
        .optional(),
    error: z.string().optional(),
});

export type CheckpointReply = z.infer<typeof ReplySchema>;

export class CheckpointThread {
    private worker: Worker | null = null;
    private failed = false;
    private nextId = 1;
    private readonly pending = new Map<
        number,
        (reply: CheckpointReply) => void
    >();
    /** Dateien mit laufendem Checkpoint — keiner doppelt. */
    private readonly inFlight = new Set<string>();

    get available(): boolean {
        return !this.failed;
    }

    /** Checkpoint anstoßen; `null`, wenn für die Datei schon einer läuft. */
    checkpoint(file: string): Promise<CheckpointReply> | null {
        if (this.inFlight.has(file)) return null;
        this.inFlight.add(file);
        return this.send({ op: 'checkpoint', file }).finally(() =>
            this.inFlight.delete(file),
        );
    }

    /** Verbindung zu einer Datei schließen, bevor sie geschlossen oder gelöscht wird. */
    close(file: string): Promise<CheckpointReply> {
        return this.send({ op: 'close', file });
    }

    dispose(): void {
        void this.worker?.terminate();
        this.worker = null;
    }

    private send(msg: {
        op: 'checkpoint' | 'close';
        file: string;
    }): Promise<CheckpointReply> {
        const worker = this.ensureWorker();
        const id = this.nextId++;
        return new Promise((resolve) => {
            if (!worker) {
                resolve({ id, ok: false, ms: 0, error: 'no_worker' });
                return;
            }
            this.pending.set(id, resolve);
            worker.postMessage({ ...msg, id });
        });
    }

    private ensureWorker(): Worker | null {
        if (this.failed) return null;
        if (this.worker) return this.worker;
        const worker = new Worker(
            new URL('./checkpoint-worker.mjs', import.meta.url),
        );
        worker.unref();
        worker.on('message', (raw: unknown) => {
            const reply = ReplySchema.parse(raw);
            this.pending.get(reply.id)?.(reply);
            this.pending.delete(reply.id);
        });
        const fail = (reason: unknown) => {
            if (this.worker !== worker) return;
            console.warn(
                '[checkpoint] Worker ausgefallen, Checkpoint wieder im Haupt-Thread:',
                reason,
            );
            this.failed = true;
            this.worker = null;
            for (const [id, resolve] of this.pending)
                resolve({
                    id,
                    ok: false,
                    ms: 0,
                    error: 'worker_failed',
                });
            this.pending.clear();
        };
        worker.on('error', fail);
        worker.on('exit', (code) => {
            if (code !== 0) fail(`exit ${code}`);
        });
        this.worker = worker;
        return worker;
    }
}
