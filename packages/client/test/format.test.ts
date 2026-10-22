import { describe, expect, it } from 'vitest';
import { formatClock } from '../src/lib/format.js';

describe('formatClock (19-3)', () => {
    const today = new Date(2026, 9, 22, 12, 0, 0).getTime();

    it('zeigt heutige Zeiten als Uhrzeit, wahlweise mit Millisekunden', () => {
        const t = new Date(2026, 9, 22, 14, 3, 12, 437).getTime();
        expect(formatClock(t, false, today)).toBe('14:03:12');
        expect(formatClock(t, true, today)).toBe('14:03:12:437');
    });

    it('nennt morgen und andere Tage', () => {
        const tomorrow = new Date(2026, 9, 23, 0, 0, 5).getTime();
        expect(formatClock(tomorrow, false, today)).toBe(
            'morgen 00:00:05',
        );
        const later = new Date(2026, 9, 30, 8, 1, 2).getTime();
        expect(formatClock(later, false, today)).toBe(
            '30.10. 08:01:02',
        );
    });
});
