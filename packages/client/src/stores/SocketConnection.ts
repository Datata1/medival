import { type WorldMessage, WorldMessageSchema } from '@medival/shared';

/**
 * Die Verbindung, über die eine Welt Änderungen meldet.
 *
 * Als Schnittstelle formuliert, damit der `RootStore` nicht an `WebSocket` und
 * `location` hängt und ohne Browser testbar bleibt
 * (siehe plans/09-mobx-state-management.md).
 */
export interface WorldSocket {
    connect(
        worldId: number,
        onMessage: (message: WorldMessage) => void,
    ): void;
    disconnect(): void;
}

/**
 * WebSocket-Umsetzung. Nachrichten lösen gezielte Store-Reloads aus, statt wie
 * vorher pauschal Query-Caches zu invalidieren, und werden geparst statt
 * gecastet (plans/08).
 */
export class SocketConnection implements WorldSocket {
    private socket: WebSocket | null = null;

    connect(
        worldId: number,
        onMessage: (message: WorldMessage) => void,
    ): void {
        this.disconnect();
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const socket = new WebSocket(
            `${protocol}://${location.host}/api/worlds/${worldId}/ws`,
        );
        socket.onmessage = (event) => {
            const parsed = WorldMessageSchema.safeParse(
                JSON.parse(String(event.data)),
            );
            if (!parsed.success) {
                console.warn(
                    'Unbekannte WebSocket-Nachricht verworfen',
                );
                return;
            }
            onMessage(parsed.data);
        };
        this.socket = socket;
    }

    disconnect(): void {
        this.socket?.close();
        this.socket = null;
    }
}
