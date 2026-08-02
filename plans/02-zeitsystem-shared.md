# Plan 02: Einheitliches Zeitsystem (GameTime, Duration, DurationLike)

**Status:** ✅ erledigt (2026-08-01) · **Nutzer-Punkt:** 1

> Umsetzungsnotizen: `buildTimeMs`/`recruitTimeMs`/`travelTimeMs` wurden zu
> `buildTime`/`recruitTime`/`travelTime` umbenannt (liefern jetzt `Duration`).
> `Duration.clampMin` heißt in der Umsetzung `Duration.atLeast` (rundet zusätzlich).
> Auch alle Tests nutzen `Duration.hours/minutes` statt roher ms-Zahlen; der
> Magic-Number-Grep trifft nur noch `time.ts`/`time.test.ts`. 6 neue Zeitmodul-Tests.

## Kontext

Zeit wird derzeit als nackte `number` durch die gesamte Codebase gereicht, und an vielen
Stellen wird mit Magic Numbers gerechnet, z. B.:

- `packages/client/src/VillagePanel.tsx`: `const elapsedH = Math.max(0, gameTime - v.gameTime) / 3_600_000;`
- `packages/shared/src/logic/formulas.ts` (`projectResources`): `const hours = elapsedGameMs / 3_600_000;`
- `packages/shared/src/logic/travel.ts`: `dist * minPerField * 60_000`
- `packages/server/src/engine/world.ts` (`settleLoyalty`): `/ 3_600_000`

Dabei können absolute Zeitstempel (Spielzeit) und Zeitspannen versehentlich vermischt
werden — der Compiler hilft nicht. Ziel: ein shared Zeitmodul mit **Branded Types** und
Rechen-Utilities, sodass falsche Verwendung ein Typfehler ist und `3_600_000` nirgendwo
mehr auftaucht.

## Design

Neues Modul `packages/shared/src/time.ts` (Export über `src/index.ts`):

```ts
// Branded number types — zur Laufzeit gewöhnliche Zahlen (DB-/JSON-kompatibel, keine Kosten)
export type GameTime = number & { readonly __brand: 'GameTime' };  // absoluter Spielzeit-Stempel (ms seit Weltstart)
export type Duration = number & { readonly __brand: 'Duration' };  // Zeitspanne in ms
export type DurationLike = Duration | number;                       // Eingaben großzügig, Ausgaben streng

export const Duration: {
  ms(n: DurationLike): Duration;
  seconds(n: number): Duration;
  minutes(n: number): Duration;
  hours(n: number): Duration;
  zero: Duration;
  add(a: Duration, b: DurationLike): Duration;
  scale(d: Duration, factor: number): Duration;
  clampMin(d: Duration, min: DurationLike): Duration;
  toSeconds(d: Duration): number;
  toHours(d: Duration): number;
};

export const GameTime: {
  of(n: number): GameTime;               // Cast an DB-/API-Grenzen
  zero: GameTime;
  add(t: GameTime, d: DurationLike): GameTime;
  between(from: GameTime, to: GameTime): Duration;      // to - from, min 0
  max(a: GameTime, b: GameTime): GameTime;
};

/** Ersetzt alle "x pro Stunde × Δt"-Rechnungen. */
export function amountAtRate(perHour: number, elapsed: Duration): number;
```

Konventionen:
- **Shared-Funktionen** nehmen/liefern `GameTime`/`Duration` in ihren Signaturen
  (z. B. `buildTimeMs(...): Duration`, `travelTimeMs(...): Duration`,
  `projectResources(..., elapsed: Duration, ...)`).
- **DB-Grenze (Server):** Drizzle liefert `number` — genau eine Cast-Stelle pro Lesepfad
  via `GameTime.of(...)` / `Duration.ms(...)`. Kein `as GameTime` verstreut im Code.
- **API-Grenze (Client):** `api.ts`-Typen deklarieren `gameTime: GameTime`,
  `arrivalGameTime: GameTime` usw. — JSON-Parsing liefert strukturell `number`,
  die Typdeklaration übernimmt das Branding (bewusste, dokumentierte Ausnahme).

## Schritte

1. `packages/shared/src/time.ts` implementieren + in `index.ts` exportieren.
2. `packages/shared/test/time.test.ts`: Konstruktoren, Arithmetik, `between`-Clamping,
   `amountAtRate` (30/h über 2 h = 60), Branding-Kompilierbarkeit.
3. Shared-Refactoring: `formulas.ts` (projectResources, buildTimeMs, recruitTimeMs),
   `travel.ts` (travelTimeMs), Rückgabetypen auf `Duration` umstellen; interne
   Magic Numbers durch `Duration.hours/minutes/seconds` ersetzen.
4. Server-Refactoring: `clock.ts` (`now(): GameTime`), `scheduler.ts` (`dueGameTime: GameTime`),
   `world.ts` (settleResources/settleLoyalty/upgradeBuilding), `military.ts`
   (arrivalGameTime-Berechnungen). Cast-Helfer an den Drizzle-Lesestellen.
5. Client-Refactoring: `api.ts`-Typen, `VillagePanel.tsx` (elapsedH → `amountAtRate` +
   `GameTime.between`), `hooks.ts` (useGameTime liefert `GameTime`), `format.ts`
   (formatDuration nimmt `DurationLike`, formatGameTime nimmt `GameTime`).
6. `pnpm lint:fix`, dann grep-Kontrolle: `3_600_000|60_000|3600000` darf außerhalb
   von `time.ts` nicht mehr vorkommen (Ausnahme: `time.test.ts`).

## Verifikation

- Alle bestehenden Tests grün und **unverändert** (reines Typ-Refactoring, identisches Verhalten).
- Neue `time.test.ts` grün; `pnpm typecheck` in allen drei Packages sauber.
- Grep-Kontrolle aus Schritt 6.
