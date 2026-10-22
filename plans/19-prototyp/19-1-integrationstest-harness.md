# Ticket 19-1: Integrationstest-Harness

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** keine · **Grundlage für:** alle weiteren Tickets in 19

> **Ergebnis:** Der Harness steht unter `server/test/harness/` (`world`, `given`, `act`,
> `query`, `app`), dazu `Scheduler.drainUntil`, `GameClock.setTo` und `buildApp` in
> `server/src/app.ts`. Vitest hat zwei Projekte; `pnpm test:integration` läuft in ~10 s.
> 150 Server-Tests (vorher 137), davon 9 Szenarien und 4 neue Scheduler-/Uhr-Tests.
>
> **Der Harness hat sofort zwei echte Bot-Fehler gezeigt**, beide als `it.fails`
> festgehalten und an 19-4 übergeben:
>
> 1. **Bot schläft nach voller Bauschleife** (bekannt aus der Analyse): Der Test schlägt
>    genau an der Prüfung „neuer Bauauftrag nach Freiwerden" fehl.
> 2. **Kleinstlieferungen im Sekundentakt** (neu): Ab Spielstunde ~4 (Seed 555, zehn
>    Bots) schickt ein Bot alle 2 s ~20 Rohstoffe an denselben Partner. Gemessen:
>    385 Events in Stunde 1, ~25 000 in Stunde 6, ~28 000 in Stunde 10, davon zwei
>    Drittel `arrival`. Der alte Wochentest konnte das nicht sehen, weil er je Stunde
>    nur 200 Events verarbeitete.
>
> **Abweichungen von der Planung:**
>
> - **Die Wochen-Simulationen sind noch nicht umgestellt.** Mit korrektem Ablauf erzeugt
>   Fehler 2 hunderttausende Events, eine Spielwoche dauert damit Stunden statt Sekunden.
>   Die Umstellung ist deshalb Teil von 19-4: erst die Bots reparieren, dann die
>   Simulationen mit echten Messwerten neu einmessen. Die alten Tests bleiben bis dahin
>   unverändert in `test/`.
> - `expect.ts` heißt `query.ts`: Die Datei liest Zustand aus, die Erwartung schreibt
>   der Test.
> - `observeEvents(world, fn)` ist dazugekommen: ein Beobachter vor der
>   Event-Verarbeitung, für Invarianten und Tick-Protokolle.
>
> **Nebenbefund für 19-2/19-15:** ~1,3 ms je Event in einer Welt mit zehn Bots. Ein
> großer Teil davon sind Einzel-Commits ohne Transaktion (`persist()` je Event, WAL mit
> `synchronous = FULL`). Das ist bei der Lastprobe zu messen und in 19-2 mitzudenken.

## Kontext

Die Server-Tests sind zahlreich (137) und grün, aber die Simulationstests messen eine andere
Welt als die, die der Server tatsächlich betreibt. Das Muster steht in
`server/test/bot.test.ts:483-487` und in `tribes.test.ts`:

```ts
for (let hour = 0; hour < 24 * 7; hour++) {
    world.clock.skip(Duration.hours(1));
    world.scheduler.processDue();
}
```

Zwei Fehler stecken darin:

1. **Höchstens 200 Events je Schritt.** `processDue()` bricht nach `BATCH_SIZE = 200`
   ab und setzt sich per `setImmediate` fort (`engine/scheduler.ts`). In einer synchronen
   Testschleife läuft dieser Rückruf nie vor dem nächsten `skip`. Der Rückstand wächst also
   unbemerkt.
2. **Alles geschieht am Ende der Stunde.** Die Uhr steht schon auf dem Stundenende, bevor
   das erste Event der Stunde verarbeitet wird. Jeder Handler, der `world.now()` liest,
   sieht deshalb den falschen Zeitpunkt. Ein Bot, der zur Minute 5 denkt und seinen nächsten
   Tick auf „in 2 s" legt, denkt tatsächlich zur Minute 60 und plant für 60:02.

Die Folge: Der Test „wächst über eine simulierte Spielwoche" ist grün, obwohl die Bots im
echten Betrieb nach jeder vollen Bauschleife zehn Minuten schlafen (19-4). Die Prüfung
`expect(after).toBeGreaterThan(before)` hätte den Fehler ohnehin nicht gezeigt.

Dazu kommt: Es gibt **keine Tests über die HTTP-Schnittstelle**. `index.ts` baut die
Fastify-Instanz und ruft sofort `listen()` auf. Eine App ohne Port lässt sich so nicht
erzeugen, `fastify.inject` ist unmöglich. Für Mehrspieler (19-9) ist genau diese Ebene
entscheidend: „A darf B's Dorf nicht steuern" ist eine Aussage über Routen, nicht über
`World`.

## Kernentscheidung: Die Testwelt läuft Event für Event

`advance(world, duration)` springt nicht. Es geht **von Fälligkeit zu Fälligkeit**:

```
solange nächstes Event fällig ≤ ziel:
    uhr auf dessen Fälligkeit stellen
    genau dieses Event (und alle mit gleicher Fälligkeit) verarbeiten
uhr auf ziel stellen
```

Damit gilt in jedem Handler `world.now() === event.dueGameTime`, genau wie im echten Betrieb
bei pünktlichem Timer. Die Testwelt ist dann nicht „ungefähr wie" der Server, sondern
derselbe Ablauf ohne Wartezeit.

Dafür bekommt der Scheduler eine Methode ohne Batch-Abbruch:

```ts
/** Verarbeitet alle Events mit due ≤ until, strikt geordnet; nur für Tests und Catch-up. */
drainUntil(until: GameTime): number
```

`GameClock` erhält `setTo(t)` (nur vorwärts, sonst Fehler). `skip` bleibt für die
Dev-Werkzeuge aus 19-3 erhalten.

**Zweite Entscheidung: Messwerte statt Richtungen.** Simulationstests halten den gemessenen
Wert fest und prüfen gegen ein Band (z. B. „Bot-Punkte nach 2 Spieltagen bei Speed 1:
gemessen 3 800, Schwelle 3 000"). „Größer als vorher" ist kein Test.

## Umsetzung

### `server/test/harness/world.ts`

- `createTestWorld(settings?)`: tmp-Verzeichnis, `WorldManager`, Welt mit kleinen Defaults
  (`mapSize: 40`, `botCount: 0`, `barbarianCount: 0`, fester Seed). Gibt
  `{ world, manager, dispose }` zurück. `dispose` räumt das Verzeichnis auf, auch wenn der
  Test wirft.
- `advance(world, d)` und `advanceUntil(world, predicate, max)` mit Abbruch nach `max`
  Spielzeit, damit ein falscher Test nicht ewig läuft.
- Die Uhr startet pausiert, damit kein echter Timer dazwischenfunkt. `advance` ist der
  einzige Weg, wie Zeit vergeht.

### `server/test/harness/given.ts` — Ausgangslagen als Daten

```ts
const a = givenPlayer(world, { name: 'A', bot: false });
const va = givenVillage(world, a, { x: 10, y: 10, levels: { barracks: 5 },
                                    units: { axe: 200 }, resources: 'full' });
const vb = givenVillage(world, givenPlayer(world, { name: 'B' }), { x: 14, y: 10,
                                    units: { spear: 50 } });
```

Schreibt direkt in die Tabellen, über dieselben Hilfen wie `mapgen.ts`
(`insertVillage` wird dafür exportiert). Fehlende Gebäude stehen auf `STARTING_BUILDINGS`.

### `server/test/harness/act.ts` und `expect.ts` — Szenario-Sprache

- `act.attack(world, from, to, units)`, `act.support`, `act.build`, `act.recruit`:
  dünne Hüllen um die echten Kommandos (`sendUnits`, `upgradeBuilding`, …), keine
  eigene Logik
- `reportsOf(world, player)`, `unitsAt(world, village)`, `ownerOf(world, village)`,
  `pointsOf(world, player)`

### `server/src/app.ts` — App ohne Port

`buildApp(manager): FastifyInstance` aus `index.ts` herauslösen (CORS, WebSocket,
`registerRoutes`, statische Dateien). `index.ts` ruft nur noch `buildApp` und `listen`.
Der Harness bekommt `createTestApp()` → `{ app, manager, dispose }` und nutzt
`app.inject(...)`. Ab 19-8 kommt `loginAs(app, name)` hinzu, das ein Session-Cookie liefert.

### Vitest-Projekte

`server/vitest.config.ts` mit zwei Projekten: `unit` (`test/**/*.test.ts` ohne
`test/integration/`) und `integration` (`test/integration/**/*.test.ts`, längeres
Timeout). Neue Skripte: `pnpm test` (beide), `pnpm test:integration` (nur integration).

### Bestehende Simulationen umstellen

`bot.test.ts` („Bots in einer laufenden Welt"), `barbarian.test.ts` („wächst über eine
simulierte Spielwoche") und `tribes.test.ts` („Krieg und Bündnisse über eine Spielwoche")
nach `test/integration/` verschieben und auf `advance` umstellen. **Erwartung: Einige
Schwellen ändern sich**, weil die Tests jetzt die echte Welt messen. Neue Messwerte stehen
im Testkommentar, wie es `bot.test.ts` heute schon für den Faktor 2,3 macht.

### Erste Szenarien (beweisen den Harness)

1. Angriff mit Übermacht auf ein Barbarendorf → Bericht beim Angreifer, Beute kommt
   zur berechneten Rückkehrzeit an (auf die Millisekunde).
2. Bau Stufe 1→2 → `build_complete` genau zu `completesAt`, Punkte steigen.
3. Zwei Bauaufträge hintereinander → der zweite beginnt exakt, wenn der erste endet.
4. API: `POST /api/worlds` + `GET /api/worlds/:id` über `inject`.

## Dateien

| Datei | Änderung |
|---|---|
| `server/test/harness/{world,given,act,expect,app}.ts` | **neu** |
| `server/test/integration/*.test.ts` | **neu** bzw. verschoben aus `test/` |
| `server/src/engine/scheduler.ts` | `drainUntil(until)` |
| `server/src/engine/clock.ts` | `setTo(t)` |
| `server/src/engine/mapgen.ts` | `insertVillage` exportieren |
| `server/src/app.ts` | **neu** — `buildApp(manager)` |
| `server/src/index.ts` | nutzt `buildApp` |
| `server/vitest.config.ts` | **neu** — Projekte `unit` / `integration` |
| `server/package.json`, `package.json` | `test:integration` |

## Verifikation

- **Der Harness findet den Bot-Fehler.** Vor 19-4 schreiben: Ein Bot mit vollem Lager und
  voller Bauschleife wird nach `advance(1 min)` bei Speed 100 wieder aktiv. Der Test muss
  auf dem heutigen Stand **rot** sein. Er wird mit `it.fails` markiert und in 19-4 zu `it`.
- `drainUntil`: 10 000 gleichzeitig fällige Events werden in einem Aufruf vollständig
  und geordnet verarbeitet (Gegenstück zum bestehenden Sturmtest in `scheduler.test.ts`).
- In jedem Handler gilt `world.now() === dueGameTime`. Ein Test-Handler protokolliert
  beide Werte über 1 000 zufällige Events.
- `createTestApp()` + `inject` liefert für `GET /api/health` den Status 200, ohne Port zu
  öffnen.
- Laufzeit `pnpm test:integration` < 60 s. Simulationen, die länger brauchen, kommen in
  ein separates `slow`-Tag.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
