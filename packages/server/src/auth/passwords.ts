import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Passwort-Hashes mit scrypt aus `node:crypto` (plans/19-prototyp/19-8) —
 * ohne native Abhängigkeit wie bcrypt. Asynchron: Ein Hash kostet bewusst
 * einige zehn Millisekunden, und die gehören nicht in den Event-Loop, der
 * gleichzeitig Welten simuliert.
 *
 * Format: `scrypt$<salt hex>$<hash hex>`.
 */
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) =>
        scrypt(password, salt, KEY_LENGTH, (error, key) =>
            error ? reject(error) : resolve(key),
        ),
    );
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(password, salt);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Vergleicht in konstanter Zeit. Ein unbekanntes Format ist ein `false`,
 * kein Fehler — ein kaputter Eintrag soll niemanden hereinlassen.
 */
export async function verifyPassword(
    password: string,
    stored: string,
): Promise<boolean> {
    const [scheme, saltHex, keyHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const key = await derive(password, Buffer.from(saltHex, 'hex'));
    return (
        key.length === expected.length && timingSafeEqual(key, expected)
    );
}
