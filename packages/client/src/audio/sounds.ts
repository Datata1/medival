import attackIncoming from '../assets/sounds/attack-incoming.wav';
import buildComplete from '../assets/sounds/build-complete.wav';
import click from '../assets/sounds/click.wav';
import denied from '../assets/sounds/denied.wav';
import reportArrived from '../assets/sounds/report-arrived.wav';
import troopsSent from '../assets/sounds/troops-sent.wav';

/**
 * Katalog aller Klänge (siehe plans/13-sounds.md).
 *
 * Typisiert nach demselben Muster wie die Sprite-Registry aus Plan 12: Ein
 * Tippfehler in `play('klik')` ist ein Compile-Fehler.
 *
 * Eigene Aufnahmen ersetzen einen Platzhalter unter demselben Dateinamen. Ein
 * anderes Format (OGG ist deutlich kleiner als WAV) braucht nur eine geänderte
 * Import-Zeile.
 */
export const SOUNDS = {
    'attack.incoming': attackIncoming,
    'build.complete': buildComplete,
    'report.arrived': reportArrived,
    'troops.sent': troopsSent,
    click,
    denied,
} as const;

export type SoundId = keyof typeof SOUNDS;

/** Relative Lautstärke je Klang — der Alarm darf lauter sein als ein Klick. */
export const SOUND_GAIN: Record<SoundId, number> = {
    'attack.incoming': 1,
    'build.complete': 0.7,
    'report.arrived': 0.6,
    'troops.sent': 0.6,
    click: 0.35,
    denied: 0.5,
};
