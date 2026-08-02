# ⚔️ Medival

Ein Open-Source, self-hosted Browsergame nach dem Vorbild von **Die Stämme (Tribal Wars)** —
aber als stark beschleunigte **Singleplayer**-Version, in der die Karte von Bots bespielt wird.

- **Schnell:** Speed-Faktor 100–500x. Gebäude in Sekunden statt Stunden.
- **Partien-basiert:** Jede Welt ist ein eigener Spielstand (eine SQLite-Datei) mit eigenen
  Einstellungen und Siegbedingung. Die Spielzeit läuft nur, wenn der Server läuft, und ist pausierbar.
- **Leichtgewichtig:** Node.js + SQLite, kein weiterer Infrastruktur-Bedarf.

## Status

| Meilenstein | Inhalt | Status |
|---|---|---|
| M1 | Weltverwaltung, Spielzeit-Uhr/Pause, Event-Scheduler, Ökonomie, Bau-Queue, Dorf-UI | ✅ fertig |
| M2 | Karte (Canvas), Rekrutierung, Truppenbewegungen, Kampf, Beute, Eroberung, Berichte | ✅ fertig |
| M3 | Barbarendörfer, Bot-KI (Persönlichkeiten), Ansehen & Handel, Stämme & Krieg | ✅ fertig |
| M4 | Siegbedingung, Balancing, Docker-Release | ⬜ |

## Entwicklung

Voraussetzungen: Node ≥ 22, pnpm ≥ 10.

```bash
pnpm install
pnpm dev        # Server (Port 3080) + Client (Port 5173, mit Proxy)
pnpm test       # Vitest: Spielregeln (shared), Engine (server), i18n (client)
pnpm lint       # Biome (Format + Lint); Auto-Fix: pnpm lint:fix
pnpm typecheck  # tsc über alle Packages
```

Formatierung/Linting: [Biome](https://biomejs.dev) (`biome.json` im Root). Für VS Code die
offizielle Biome-Extension installieren, dann greift Format-on-Save automatisch.

Der technische Zustand und die geplanten Ausbaustufen sind in [plans/](plans/) dokumentiert.

Produktionsartig (Server liefert das gebaute Frontend aus):

```bash
pnpm build
pnpm --filter @medival/server start   # → http://localhost:3080
```

Spielstände liegen in `./data/` (`MEDIVAL_DATA_DIR` zum Überschreiben).
Eine Welt sichern = ihre `world_<id>.sqlite` kopieren.

## Architektur

```
packages/
├─ shared/   Alle Spielregeln als pure Functions: Gebäude-/Einheiten-Daten,
│            Kosten-, Produktions-, Laufzeit- und Kampfformeln, plus das
│            Zeitmodul (GameTime/Duration). Von Server (Simulation) und
│            Client (Vorschau) gemeinsam genutzt.
├─ server/   Fastify + better-sqlite3/Drizzle. Kern: Event-Scheduler
│            (ein setTimeout auf das nächste fällige Event, Rest in SQLite)
│            plus Lazy Resource Evaluation (Ressourcen werden erst beim
│            Zugriff hochgerechnet — kein Tick, keine CPU-Last im Leerlauf).
└─ client/   React + Vite + Tailwind + MobX + TanStack Router, WebSocket-Push
             für Live-Updates. Struktur: routes/ (file-based) · stores/ · api/ ·
             components/ · features/{lobby,world,village,map,reports,player} ·
             i18n/ · lib/
```

**Faule Auswertung.** Drei Größen werden nicht getickt, sondern beim Zugriff hochgerechnet
und zurückgeschrieben: Ressourcen (`settleResources`), Loyalität (`settleLoyalty`) und das
Ansehen zwischen Spielern (`settleStanding`). Was niemand abfragt, kostet nichts — bei 31
Spielern wären es sonst bis zu 930 Beziehungspaare pro Tick.

**Zeit.** Jede Welt hat eine eigene Spielzeit-Uhr (persistiert in `data/worlds.sqlite`,
intern monoton via `performance.now`). Alle Events tragen Spielzeit-Stempel — dadurch sind
Pause, Neustart und Zeitraffer verlustfrei. Zeitwerte sind in `@medival/shared` als
`GameTime` (Zeitpunkt) und `Duration` (Zeitspanne) typisiert; rohe Millisekunden-Rechnung
gibt es außerhalb dieses Moduls nicht.

**Sprache.** Alle sichtbaren Texte liegen in `packages/client/src/i18n/de.ts`; die Keys sind
typisiert, ein Tippfehler in `t()` ist ein Compile-Fehler. Der Server liefert Fehler-**Codes**
(z. B. `not_enough_resources`), die der Client übersetzt — eine weitere Sprache ist damit
reine Übersetzungsarbeit.

**Health.** `GET /api/health` liefert Event-Loop-Latenz und den Event-Rückstand pro Welt.

## Aussehen: Pergament & Tinte

Die Oberfläche ist als mittelalterliche Urkunde gestaltet — Pergamentgrund, Eisengallustinte,
Siegelrot für Hauptaktionen. Überschriften in **Cinzel**, Fließtext in **EB Garamond**;
beide Schriften liegen als Datei unter `src/assets/fonts/` (OFL-lizenziert), damit das
Spiel beim Start nicht ins Netz greifen muss.

Kontrast ist Abnahmekriterium, nicht Geschmackssache: `scripts/check-contrast.mjs` misst
jede in der Oberfläche vorkommende Farbkombination gegen WCAG AA und läuft in `pnpm lint`
(Selbsttest über `pnpm check:contrast`). Die Palette lebt im `@theme`-Block von
`src/styles.css`; Kartenfarben stehen in `MapCanvas.tsx`, weil Canvas keine CSS-Variablen
kennt. Hintergrund: [plans/11-mittelalterliches-design.md](plans/11-mittelalterliches-design.md).

## Assets: eigene Pixel-Art

Alle Symbole sind Sprites aus `src/assets/sprites/` — keine Emojis, die auf jedem System
anders aussehen. Der Katalog in `assets/registry.ts` ist typisiert: Ein Tippfehler in
`<Icon name="…" />` ist ein Compile-Fehler, kein leeres Bild.

Die aktuellen Sprites sind Platzhalter (`pnpm assets:generate`) und lassen sich einzeln
durch eigene Zeichnungen ersetzen — gleicher Dateiname, gleiche Größe, sonst nichts.
Anleitung, Größenkonventionen und Palette: [src/assets/README.md](packages/client/src/assets/README.md)
und [plans/12-assets-und-sprites.md](plans/12-assets-und-sprites.md).
`pnpm check:assets` prüft Vollständigkeit und Maße (läuft in `pnpm lint`).

## Idiom: Stores besitzen Daten, React zeigt sie an

Der Client holt seine Daten ausschließlich in MobX-Stores (`src/stores/`). Komponenten
sind `observer` und lesen; sie fetchen nicht. Das hält den Datenfluss an einer Stelle,
bindet Polling und WebSocket an den Lebenszyklus einer Welt statt an das Rendern einer
Komponente — und macht den gesamten Datenfluss **ohne Rendering testbar**
(`packages/client/test/stores.test.ts`).

```
src/stores/    RootStore (Lifecycle) · LobbyStore · WorldStore (inkl. Spielzeit-Uhr)
               VillageStore · MapStore · MovementsStore · ReportsStore
               AsyncValue (value/isLoading/error) · SocketConnection
```

`pnpm lint` erzwingt die Schichtung (`scripts/check-layering.mjs`, Selbsttest über
`pnpm check:layering`): Der API-Client wird nur von Stores benutzt, `fetch` steht nur in
`src/api/`, und Präsentationskomponenten kennen keine Stores.
Hintergrund: [plans/09-mobx-state-management.md](plans/09-mobx-state-management.md).

**Routing.** Ansichten sind Routen (`src/routes/`, file-based). Router-Loader laden
*keine* Daten — sie stoßen nur Store-Actions an, damit es neben den Stores keine zweite
Datenquelle gibt. Eine neue Feature-Seite ist eine neue Datei; `/worlds/1/map` und
`/worlds/1/village/3` sind teilbare Links.
Hintergrund: [plans/10-tanstack-router.md](plans/10-tanstack-router.md).

## Idiom: Wahrnehmung → Entscheidung → Ausführung

Die KI (`packages/server/src/ai/`) ist in drei Schichten geschnitten. Die mittlere,
`ai/decide/`, besteht aus **puren Funktionen** `(snapshot, rng) → Ergebnis`: kein
Datenbankzugriff, keine Uhr, kein Zufall außer dem hereingereichten. Ein Test schreibt
den Snapshot als Literal hin — ohne SQLite, ohne Scheduler, ohne laufende Welt.

Ausgeführt wird über **dieselben Kommandos, die auch der Spieler benutzt**
(`upgradeBuilding`, `recruitUnits`). Bots haben keine Sonderrechte und keinen zweiten
Regelsatz; eine Balancing-Änderung wirkt automatisch auf beiden Seiten.

```
perceive(world, playerId) ─→ Snapshot ─→ decide(snapshot, rng) ─→ Intent[] ─→ execute(world, …)
      Datenbank                              pure                             Kommandos
```

`pnpm lint` erzwingt die Grenze (`scripts/check-ai-purity.mjs`, Selbsttest über
`pnpm check:ai-purity`). Ohne diese Prüfung wandert beim ersten Zeitdruck ein
`world.db.select()` in eine Entscheidungsfunktion, und der Testgewinn ist weg.
Hintergrund: [plans/15-bot-grundgeruest.md](plans/15-bot-grundgeruest.md).

## Idiom: keine Type-Casts

`x as T` und `x!` sind reine Compile-Zeit-Behauptungen — sie schalten den Compiler stumm,
prüfen zur Laufzeit aber nichts. Deshalb gilt hier: **Parse at the boundary, trust inside.**
Alles, was das Programm betritt (HTTP, Datenbank, JSON-Spalten, WebSocket, Event-Queue),
wird einmal gegen ein Schema aus `packages/shared/src/schema/` geparst; danach sind die
Typen verdient und interne Aufrufe prüfen nicht erneut.

```ts
// statt dessen …                        // … so
JSON.parse(raw) as Units                 parseJsonColumn(UnitsSchema, raw, 'movement.units')
req.body as CreateWorld                  parseInput(CreateWorldRequestSchema, req.body)
res.json() as Promise<T>                 request(url, VillageViewSchema)
row.type as BuildingType                 Drizzle-Enum-Spalte — schon typisiert
Object.entries(u) as [UnitType, n][]     entriesOf(u)
rows[0]!                                 firstOrThrow(rows, 'village_not_found')
```

`pnpm lint` erzwingt die Regel (`scripts/check-no-casts.mjs`; Selbsttest über
`pnpm check:casts`). Casten dürfen nur `packages/shared/src/time.ts` und
`packages/shared/src/lib/objects.ts` — dort entstehen die Brands und die typisierten
Object-Helfer, und jeder Cast steht hinter einer Laufzeitprüfung. In Tests ist Casting
erlaubt. Hintergrund und Begründung: [plans/08-no-typecasting.md](plans/08-no-typecasting.md).

## Lizenz

MIT
