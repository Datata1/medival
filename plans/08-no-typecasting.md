# Plan 08: Typecasting eliminieren — „Parse, don't cast" als Idiom

**Status:** ✅ erledigt (2026-08-01)

> **Ergebnis:** 65 → **5 Casts** (4 in `time.ts`, 1 in `lib/objects.ts` — beide
> Ausnahme-Dateien, jeder Cast hinter einer Laufzeitprüfung und durch Tests
> abgedeckt), **0 Non-Null-Assertions** in Produktionscode.
>
> **Abweichungen von der Planung:**
> - Der Cast-Check fand beim ersten scharfen Lauf einen *mehrzeiligen* Cast in
>   `military.ts`, den die ursprüngliche Bestandsaufnahme per Grep übersehen
>   hatte — der Prüfer hat deshalb einen Selbsttest (`pnpm check:casts`).
> - Der neue Integrationstest deckte auf, dass die Validierung an der falschen
>   Grenze saß: geprüft wurde nur die HTTP-Route, nicht `WorldManager.createWorld`.
>   Da der Manager die öffentliche Schnittstelle zum Anlegen einer Welt ist,
>   parst er die gemergten Einstellungen jetzt selbst.
> - Kein Biome-GritQL-Plugin: Biome 2.5 hat keine eingebaute Regel gegen `as`,
>   und das eigenständige Skript deckt den Fall vollständig und nachweisbar ab.
>   `noNonNullAssertion` steht jetzt auf `error` (in Tests abgeschaltet).
> - **Bundle:** 101 → 122 kB gzip (+21 kB). Der Plan sah ab 15 kB einen Wechsel
>   auf `zod/mini` vor; bewusst dagegen entschieden, weil dessen funktionale API
>   (`z.string().check(z.minLength(1))`) die Schemas deutlich schwerer lesbar
>   macht und Contributor-Freundlichkeit das Kriterium für die Zod-Wahl war.
>   Für ein self-hosted Spiel, das einmal lädt und dann gecacht ist, sind 122 kB
>   unkritisch. Falls sich das ändert, bleibt der Wechsel auf
>   `shared/src/schema/` begrenzt.
>
> **Verifiziert:** `{"speed":"schnell"}`, `mapSize: -5`, `botCount: 999999`,
> `building: "raumhafen"`, `count: -5` → alle HTTP 400 statt NaN in der Datenbank.
> Eine mit der Vorversion erzeugte Welt-Datei lädt unverändert. Korrupte
> `units_json` und Events mit unbekanntem Typ bzw. fehlerhafter Payload legen die
> Welt nicht lahm (3 neue Tests). 85 Tests grün, Browser-Smoke-Test ohne Fehler.

## Kontext

Ein Type-Cast (`x as T`) und eine Non-Null-Assertion (`x!`) sind reine **Compile-Zeit-
Behauptungen**. Sie schalten den Compiler stumm, prüfen zur Laufzeit aber nichts. Überall
dort, wo Daten das Programm betreten — HTTP, Datenbank, JSON-Spalten, WebSocket,
Event-Queue — ist ein Cast deshalb kein Typwissen, sondern eine ungeprüfte Hoffnung.

Ausgangslage: **65 Casts in Produktionscode**, **13 Non-Null-Assertions**.

Zwei belegte Schäden aus dem Ist-Zustand:

1. **NaN in der Datenbank.** `POST /api/worlds` deklariert
   `Body: { settings?: Partial<WorldSettings> }` — Fastify validiert nichts, der Typ ist
   Behauptung. `{"settings":{"speed":"schnell"}}` fließt ungeprüft in `createWorld`;
   `buildTime()` rechnet `hqBonus / "schnell"` → `NaN`, `Duration.atLeast(NaN, …)` bleibt
   `NaN`, und NaN-Zeitstempel landen in der Welt-Datei.
2. **Blinder Client.** `api/client.ts` gab `res.json() as Promise<T>` zurück: *jede*
   Server-Antwort war unvalidiert. Schema-Drift zwischen Server und Client fällt damit
   erst als Folgefehler tief in der UI auf.

Besonders heikel sind Casts auf **persistierte** Daten (JSON-Spalten, Event-Payloads):
Savegames überleben Programmversionen — ein Feldwechsel korrumpiert alte Welten still.

## Das Idiom

> **Parse at the boundary, trust inside.**
> An jeder Systemgrenze werden Daten mit einem Schema *geparst*. Danach sind die Typen
> verdient, und interne Aufrufe prüfen nicht erneut.

Konkret:

| Statt … | … so |
|---|---|
| `JSON.parse(x) as Units` | `parseJsonColumn(UnitsSchema, x, 'movement.units')` |
| `req.body as CreateWorld` | `parseInput(CreateWorldRequestSchema, req.body)` |
| `res.json() as Promise<T>` | `request(url, ResponseSchema)` |
| `row.type as BuildingType` | Drizzle-Enum-Spalte → schon typisiert |
| `Object.entries(u) as [UnitType, number][]` | `entriesOf(u)` |
| `rows[0]!` | `firstOrThrow(rows, 'village_not_found')` |

### Erlaubte Ausnahmen

Genau zwei Produktionsdateien dürfen casten, weil dort das Framework selbst gebaut wird —
beide mit Laufzeitprüfung *vor* dem Cast, Kommentar und Testabdeckung:

1. `packages/shared/src/time.ts` — Brand-Konstruktoren (`GameTime.of`, `Duration.ms`).
2. `packages/shared/src/lib/objects.ts` — `entriesOf` / `keysOf`.

Testdateien (`**/test/**`) sind ausgenommen: dort ist Casting zum Aufbau von Fixtures in
Ordnung.

Durchgesetzt wird das durch `scripts/check-no-casts.mjs`, das in `pnpm lint` mitläuft.
Der Prüfer bringt einen eigenen Selbsttest mit (`pnpm check:casts`), der beweist, dass er
Casts und Assertions erkennt und Import-Aliase sowie `as const` in Ruhe lässt — ein
Linter, der stillschweigend nichts findet, wäre schlimmer als keiner.
Ergänzend meldet Biome Non-Null-Assertions als Fehler direkt in der IDE.

## Bestandsaufnahme und Lösung je Kategorie

| Kategorie | Anzahl | Lösung | Laufzeitkosten |
|---|---|---|---|
| A) Trust Boundaries (JSON, HTTP, Events, WS, raw SQL) | 17 | Zod-Schemas | ja, gewollt |
| B) `Object.entries/keys`-Widening | 8 | typisierte Helfer | nein |
| C) DB-Strings, die Enums sind | 7 | Drizzle `enum` + `CHECK` | nein |
| D) Brand-Konstruktoren | 13 | Ausnahme + Validierung | minimal |
| E) Rest (UI, `keyof`) | 20 | fallweise typisieren | nein |
| Non-Null-Assertions | 13 | `firstOrThrow` + Guards | nein |

## Framework

`packages/shared/src/schema/` (Zod v4 als Dependency von `shared`):

- `primitives.ts` — Gebäude-/Einheiten-/Bewegungs-Enums, `Resources`, `Units`,
  `BuildingLevels`
- `time.ts` — `GameTimeSchema`, `DurationSchema`; der Brand entsteht über
  `.transform(GameTime.of)`, also über den **validierten Konstruktor** statt über einen Cast
- `world.ts` — `WorldSettingsSchema` mit echten Schranken (schließt den NaN-Bug)
- `events.ts` — `z.discriminatedUnion('type', …)` über alle Event-Typen
- `api.ts` — Request- und Response-Schemas

**Kerntypen bleiben handgeschrieben.** `types.ts` ist weiterhin die lesbare Wahrheit; jedes
Schema trägt `satisfies z.ZodType<X>`, sodass der Compiler Abweichungen meldet. Kein
`z.infer` für Kerntypen — die Domäne soll ohne Framework-Syntax lesbar bleiben.

Helfer:
- `packages/shared/src/lib/objects.ts` — `entriesOf`, `keysOf`, `singleEntry`
- `packages/server/src/db/parse.ts` — `parseJsonColumn`, `parseRow`, `parseInput`,
  `firstOrThrow`
- `packages/server/src/db/rowSchemas.ts` — Zeilen ohne Drizzle-Typisierung
  (Meta-DB, `PRAGMA`, Roh-SQL)

## Verifikation

- `pnpm lint` (inkl. Cast-Check) meldet 0 Verstöße; 0 Non-Null-Assertions außerhalb Tests
- Ungültige Welt-Einstellungen (`speed: "schnell"`, `mapSize: -5`, `botCount: 999999`)
  werden mit HTTP 400 abgelehnt — als Test festgehalten
- Bestehende Welt-Dateien laden weiterhin (Regressionsprobe mit einer Welt aus der Vorversion)
- Korrupte Daten degradieren sauber: unbekannter Event-Typ und kaputte `units_json` legen
  die Welt nicht lahm, sondern werden geloggt
- Keine Performance-Regression im 10.000-Event-Test aus `test/scheduler.test.ts`
- Client-Bundle-Zuwachs gemessen und hier festgehalten
- `pnpm typecheck`, `pnpm test`, `pnpm build` grün; Browser-Smoke-Test aller vier Ansichten
