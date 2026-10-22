import {
    Duration,
    type DurationLike,
    type GameTimeLike,
} from '@medival/shared';
import i18next from 'i18next';

export function formatNumber(n: number): string {
    return Math.floor(n).toLocaleString(i18next.language);
}

export function formatDuration(d: DurationLike): string {
    const totalS = Math.max(
        0,
        Math.ceil(Duration.toSeconds(Duration.ms(d))),
    );
    const h = Math.floor(totalS / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const s = totalS % 60;
    const pad = (x: number) => String(x).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatGameTime(t: GameTimeLike): string {
    const totalMin = Math.floor(
        Duration.toSeconds(Duration.ms(t)) / 60,
    );
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (d > 0) return i18next.t('common.gameDay', { day: d + 1, time });
    return time;
}

/**
 * Eine Uhrzeit (Epoch-ms) für Ankünfte und Berichte (plans/19-prototyp/19-3):
 * `14:03:12`, mit `withMs` `14:03:12:437` wie in Tribal Wars — darüber
 * verabreden sich Spieler im Stamm. Liegt der Zeitpunkt nicht heute, steht
 * „morgen" bzw. das Datum davor.
 */
export function formatClock(
    epochMs: number,
    withMs = false,
    today = Date.now(),
): string {
    const d = new Date(epochMs);
    const pad = (x: number, n = 2) => String(x).padStart(n, '0');
    const time =
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
        (withMs ? `:${pad(d.getMilliseconds(), 3)}` : '');
    const dayOf = (t: Date) =>
        new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const days = Math.round(
        (dayOf(d) - dayOf(new Date(today))) / 86_400_000,
    );
    if (days === 0) return time;
    if (days === 1) return i18next.t('common.clockTomorrow', { time });
    return i18next.t('common.clockOnDay', {
        date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`,
        time,
    });
}
