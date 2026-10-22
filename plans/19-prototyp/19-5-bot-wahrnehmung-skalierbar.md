# Ticket 19-5: Bot-Wahrnehmung skalierbar

**Status:** 📋 offen · **Voraussetzung:** [19-4](19-4-bots-reparieren.md) · **Vor:** [19-6](19-6-weltkarte-kreisfoermige-besiedlung.md)

## Kontext

`perceiveBot` (`server/src/ai/perceive.ts`) wurde für 30 Bots auf einer 100×100-Karte
geschrieben. Auf einer 1000×1000-Welt mit ~300 Bots und einigen tausend Dörfern wird
jeder Bot-Tick zu einem Vollscan:

- **`perceiveTargets`** (`perceive.ts:185`) liest **alle** Dörfer der Welt und filtert
  danach in JavaScript nach Entfernung. Für jedes Dorf in Reichweite ruft es
  `world.effectiveStanding()` auf, und das **schreibt** (`settleStanding` macht ein
  `UPDATE relations`).
- **`perceivePartners`** und **`perceiveFounding`** arbeiten nach demselben Muster.
- **`perceiveDistress`** (`perceive.ts:251-269`) liest **alle** Bewegungen der Welt
  (`world.db.select().from(movements).all()`) und fragt für jede einzelne das Zieldorf
  ab (N+1).
- Für jedes eigene Dorf gibt es einzelne Abfragen für Gebäude, Einheiten, Bauschleife,
  Rekrutierungsschleife, `popInUse` (das wiederum alle Bewegungen des Dorfes parst) und
  Händler.

Kosten je Tick ≈ O(Dörfer der Welt + Bewegungen der Welt). Bei 300 Bots × einem Tick alle
paar Sekunden (19-4 macht sie aktiver!) wächst das quadratisch mit der Weltgröße.

**Gemessen (2026-10-22, beim Umsetzen von 19-2):** CPU-Profil einer Welt mit zehn Bots über
vier Spielstunden (Speed 100), 8 224 Events in 17,8 s, also **2,2 ms je Event**. Davon
entfallen **72 % auf `perceiveBot`**, allein `perceiveFounding` braucht 35 %
(`settleStanding` je Paar mit Schreibzugriff, `tribeOf` einzeln). Nach Funktionsart
gerechnet sind ~70 % der Gesamtzeit Abfrage-Overhead: Drizzle baut jede Abfrage bei
jedem Aufruf neu (`is`, `sql.js`, ~40 %), und better-sqlite3 kompiliert sie jedes Mal neu
(`prepare`, 21 %). Das eigentliche Ausführen in SQLite liegt bei ~12 %. Daraus folgen zwei
Hebel für dieses Ticket: weniger Abfragen je Tick (räumlich, gebündelt, ohne Schreiben)
und **vorbereitete Abfragen** (`.prepare()` mit `sql.placeholder`) in den heißen Pfaden
von Wahrnehmung und Scheduler.

Hinzu kommt ein Verstoß gegen das eigene Prinzip: *„Wahrnehmung liest, sie schreibt nicht"*
(Kommentar in `perceive.ts`). Über `settleStanding` schreibt sie doch, und zwar
innerhalb jedes Bot-Ticks, für jedes Nachbarpaar.

## Kernentscheidung: Wahrnehmung kostet O(Nachbarschaft), nicht O(Welt)

Ein Bot sieht, was in seiner Reichweite liegt. Das wird in der Datenbank abgefragt, nicht
in JavaScript gefiltert:

```sql
SELECT … FROM villages
WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?   -- Bounding-Box
```

danach exakter Abstand in JS. Mit einem Index auf `(x, y)` ist das bei typischer
Dichte (19-6) eine Abfrage über einige Dutzend Zeilen. Der bestehende
`UNIQUE(x, y)` dient als Index, die Abfrage muss ihn aber auch nutzen
(`EXPLAIN QUERY PLAN` im Test).

**Lesen ohne Schreiben.** `peekStanding(a, b, at)` rechnet den Verfall wie
`settleStanding`, schreibt aber nicht zurück. Die Wahrnehmung benutzt nur `peek*`.
Geschrieben wird erst, wenn ein Kommando das Ansehen tatsächlich verändert
(`adjustStanding`). Die faule Auswertung aus Plan 16 bleibt korrekt, weil `decayStanding`
eine reine Funktion der Zeit ist.

## Umsetzung

### `engine/spatial.ts` (neu)

```ts
villagesInBox(world, x0, y0, x1, y1): VillageLite[]
villagesInRange(world, cx, cy, r): (VillageLite & { dist: number })[]
```

Ein einziger Ort für räumliche Abfragen. 19-6 (Platzierung) und 19-7 (Karten-API)
verwenden ihn ebenfalls.

### `perceive.ts`

- `perceiveTargets`, `perceivePartners`, `perceiveFounding` über `villagesInRange` um
  jedes eigene Dorf. Mehrere eigene Dörfer werden zu einer gemeinsamen Bounding-Box
  zusammengefasst, solange sie klein bleibt, sonst je Dorf.
- `perceiveDistress`: eine Abfrage mit JOIN

  ```sql
  SELECT m.target_village_id, m.arrival_game_time, v.x, v.y
  FROM movements m JOIN villages v ON v.id = m.target_village_id
  JOIN players p ON p.id = v.player_id
  WHERE m.kind = 'attack' AND m.arrival_game_time > ? AND p.tribe_id = ? AND p.id != ?
  ```

  Index `idx_movements_target` existiert, dazu `idx_movements_kind_arrival`.
- Eigene Dörfer: Gebäude, Einheiten, Schleifen **gesammelt** für alle Dörfer des Bots in
  je einer Abfrage (`WHERE village_id IN (…)`). `popInUse` bekommt eine Variante für
  viele Dörfer.
- Alle `effectiveStanding`-Aufrufe → `peekEffectiveStanding`.

### `world.ts`

`peekStanding` / `peekEffectiveStanding` neben `settleStanding`. Beide nutzen dieselbe
innere Funktion, damit sie nie auseinanderlaufen.

### Messpunkt

`EngineHealth` (`engine/health.ts`) bekommt einen Zähler „Dauer je Bot-Tick" (p50/p99).
`GET /api/health` liefert ihn. 19-15 setzt darauf die Schwelle.

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/engine/spatial.ts` | **neu** |
| `server/src/ai/perceive.ts` | räumliche Abfragen, gebündelte Dorfdaten, nur `peek*` |
| `server/src/engine/world.ts` | `peekStanding`, `peekEffectiveStanding`, `popInUse` für viele Dörfer |
| `server/src/engine/health.ts` | Bot-Tick-Dauer |
| `server/src/db/ddl.ts` · Migration | `idx_movements_kind_arrival` |
| `server/test/integration/perception.test.ts` | **neu** |

## Verifikation

- **Gleichwertigkeit:** Für 50 zufällige Weltzustände (Harness, fester Seed) liefert die
  neue Wahrnehmung denselben `BotSnapshot` wie die alte, abgesehen von der Reihenfolge,
  die vorher sortiert wird. Die alte Implementierung bleibt dafür einmalig als
  Testorakel unter `test/integration/oracle/` stehen und wird nach dem Ticket gelöscht.
- **Keine Schreibzugriffe:** `perceiveBot` in einer Transaktion ausführen und danach
  `sqlite.changes`/`total_changes()` vergleichen → 0.
- **Index wird benutzt:** `EXPLAIN QUERY PLAN` der Box-Abfrage enthält `USING INDEX`.
- **Skalierung:** Welt mit 5 000 Dörfern auf 1000×1000 → Dauer je `perceiveBot` p99
  < 5 ms (Messwert im Test festhalten). Verdoppelte Dorfzahl bei gleicher Dichte →
  Dauer steigt um weniger als 20 %.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
