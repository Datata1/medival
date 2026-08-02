import { describe, expect, it } from 'vitest';
import { AsyncValue } from '../src/stores/AsyncValue.js';

/** Kleiner Helfer: ein Promise, das der Test selbst auflöst. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('AsyncValue', () => {
    it('hält Wert und Ladezustand', async () => {
        const value = new AsyncValue<number>();
        expect(value.hasValue).toBe(false);

        const pending = value.load(async () => 42);
        expect(value.isLoading).toBe(true);
        await pending;

        expect(value.value).toBe(42);
        expect(value.isLoading).toBe(false);
        expect(value.error).toBeNull();
    });

    it('macht aus einem Fehler Zustand statt einer Exception', async () => {
        const value = new AsyncValue<number>();
        await expect(
            value.load(async () => {
                throw new Error('not_enough_resources');
            }),
        ).resolves.toBeUndefined();

        expect(value.error).toBe('Nicht genug Rohstoffe'); // übersetzt via lib/errors
        expect(value.isLoading).toBe(false);
        expect(value.value).toBeNull();
    });

    it('verwirft die Antwort eines überholten Ladevorgangs', async () => {
        const value = new AsyncValue<string>();
        const first = deferred<string>();
        const second = deferred<string>();

        const a = value.load(() => first.promise);
        const b = value.load(() => second.promise);

        second.resolve('neu');
        await b;
        first.resolve('alt'); // trifft verspätet ein
        await a;

        expect(value.value).toBe('neu');
        expect(value.isLoading).toBe(false);
    });

    it('setzt einen Fehler beim nächsten Laden zurück', async () => {
        const value = new AsyncValue<number>();
        await value.load(async () => {
            throw new Error('boom');
        });
        expect(value.error).not.toBeNull();

        await value.load(async () => 7);
        expect(value.error).toBeNull();
        expect(value.value).toBe(7);
    });

    it('set() überschreibt auch laufende Ladevorgänge', async () => {
        const value = new AsyncValue<string>();
        const slow = deferred<string>();
        const pending = value.load(() => slow.promise);

        value.set('sofort');
        slow.resolve('zu spät');
        await pending;

        expect(value.value).toBe('sofort');
    });

    it('clear() leert Wert und Fehler', async () => {
        const value = new AsyncValue<number>(1);
        value.clear();
        expect(value.value).toBeNull();
        expect(value.hasValue).toBe(false);
    });
});
