# Ticket 19-14: Paladin & Statue

**Status:** ✅ erledigt (2026-10-23) · **Voraussetzung:** [19-12](19-12-bogenschuetzen.md) (`unitsEnabled`), [19-13](19-13-schmiede-versammlungsplatz-versteck.md)

> **Ergebnis:**
>
> - **Statue** (`statue`, max. 1, 220/220/220) und **Paladin** (`paladin`, Werte wie
>   unten, `recruitedAt: 'statue'`, keine Forschung nötig). Waffen und Erfahrung gibt es
>   nicht.
> - **Welt-Option `paladin`** (Standard an, `.default(true)`). `buildingsEnabled`
>   kommt neben `unitsEnabled` dazu. Ist die Option aus, meldet `upgradeBuilding`
>   `building_disabled` und `recruitUnits` `unit_disabled`. Client und Bots sehen weder
>   Statue noch Paladin.
> - **`paladinStatus(world, playerId)`** (`engine/paladin.ts`) leitet den Zustand ab:
>   `none`, `home` (Dorf), `away` (Bewegung), `appointing` (Dorf, fertig um) oder `dead`
>   (seit). Grundlage sind die Truppen der eigenen Dörfer, die Bewegungen von dort, die
>   Ausbildungsschleife und die neue Tabelle `paladin_deaths`.
> - **Rekrutierung:** nur einzeln (`paladin_single`). Lebt er, gibt es `paladin_exists`,
>   wird er gerade ernannt, `paladin_reviving`. Nach seinem Tod ist die Ernennung
>   kostenlos und dauert `PALADIN_REVIVE_TIME_S` (21 600 s bei Speed 1, wie die erste).
> - **Tod im Kampf** wird für Angreifer und Verteidiger in `paladin_deaths` vermerkt.
> - **Bots:** `BotSnapshot.paladin`, `decidePaladin` (pur) ernennt ihn im ersten Dorf
>   mit Statue und Platz im Bauernhof. `raider` nimmt ihn mit dem Angriff mit. Alle
>   anderen lassen ihn zu Hause, das ergibt sich von selbst: Mit Verteidigung 250 bei
>   Angriff 150 zählt er nicht als Angreifer. Seine Ernennung blockiert die übrige
>   Ausbildung des Dorfes nicht (`recruiting` zählt sie nicht mit). Gesperrte Gebäude
>   schlägt `decideBuild` nicht vor (`VillageSnapshot.enabledBuildings`).
> - **Client:** Statue-Seite mit „Dein Paladin" (zu Hause in …, unterwegs, Ernennung mit
>   Countdown, gefallen) und der Ernennung darunter. Dorfplatz, Hauptgebäude,
>   Katapultziel und Handbuch zeigen nur die Gebäude der Welt (`world.enabledBuildings`).
>   Sprites `building.statue`, `unit.paladin` und Texte.
>
> **Tests:** `shared/test/research.test.ts` prüft `buildingsEnabled`/`unitsEnabled` ohne
> Paladin. `test/integration/paladin.test.ts`:
> - Zwei Dörfer mit Statue: Der zweite Paladin wird abgewiesen, während der erste ernannt
>   wird (`paladin_reviving`), zu Hause steht und unterwegs ist (`paladin_exists`).
>   `count: 2` ergibt `paladin_single`.
> - Der Paladin fällt gegen eine Festung, danach `dead` seit der Ankunft. Die
>   Wiederbelebung kostet nichts, dauert genau 216 000 ms bei Speed 100, ist 1 ms vorher
>   noch offen und dann zu Hause.
> - `paladin: false`: `building_disabled`, `unit_disabled`, in der Dorfansicht
>   `paladin: null`.
> - Sechs Bots in drei Spielwochen: alle sechs haben eine Statue und genau einen Paladin,
>   gezählt über Truppen, Schleife und Bewegungen.
>
> **Im Browser:** Die Spielerin sieht in der Statue „Du hast noch keinen Paladin",
> ernennt ihn über das Formular und sieht danach „wird ernannt — fertig in 0:21"
> (Screenshot geprüft). In einer Welt ohne Paladin fehlt die Statue auf dem Dorfplatz
> und im Handbuch, und `POST /build {statue}` ergibt 400 `building_disabled`.
>
> **Abweichungen von der Planung:**
>
> - **Zustände `home`/`away` statt `alive(villageId|movementId)`.** Das ist dieselbe
>   Information, aber als Discriminated Union mit festen Feldern.
> - **Eigene Werte für die Statue:** Bauzeit 1 500 s, Bevölkerung 10, keine Steigerung
>   (nur eine Stufe).
> - **`paladin_single`** ist ein zusätzlicher Fehler für `count ≠ 1`.
> - **Nicht abgedeckt:** Wird das Heimatdorf erobert, während der Paladin unterwegs ist,
>   zählt die Bewegung zum neuen Besitzer, und der alte Spieler könnte einen neuen
>   ernennen. Eine Eroberung mit dem Paladin im Dorf ist abgedeckt: Er fällt im Kampf
>   wie alle Verteidiger.

## Kontext

Der Paladin ist in Tribal Wars eine Welt-Option. Er ist die einzige Einheit, von der jeder
Spieler **genau eine** besitzt. Er wird in der Statue ernannt, ist stark, schnell und
teuer zu verlieren, und er kann nach dem Tod wiederbelebt werden. Mit dem Nutzer wurde
entschieden: Welt-Einstellung `paladin`, Standard an. **Waffen und Erfahrung des Paladins
gehören in den PoC.** Im Prototyp ist er eine besondere Einheit ohne Ausrüstung.

## Kernentscheidung: Ein Paladin je Spieler, nicht je Dorf

Die Regel „höchstens einer" gilt über **alle** Dörfer eines Spielers und über alle
Zustände: zu Hause, unterwegs, als Unterstützung in einem fremden Dorf oder in
Ernennung. Geprüft wird das an genau einer Stelle, `paladinStatus(world, playerId)`. Die
Funktion liefert `none | appointing | alive(villageId|movementId) | dead(since)`.

Den Zustand zu speichern statt ihn zu berechnen, wäre fehleranfällig (Eroberung,
Rückkehr, Tod im Kampf). Deshalb wird er aus `units`, `movements`, `recruit_queue` und
einer kleinen Tabelle `paladin_deaths (player_id, died_at)` abgeleitet.

**Wiederbelebung** kostet nichts, dauert aber `PALADIN_REVIVE_TIME` (Spielzeit, skaliert
mit `speed`). Sie läuft wie eine Ernennung über die Rekrutierungsschleife der Statue.

## Umsetzung

### Shared

- `BuildingType` + `'statue'`: Kosten 220/220/220, max. 1, Voraussetzung keine.
- `UnitType` + `'paladin'`: Angriff 150, Verteidigung 250/400/150, 10 min/Feld,
  Tragkraft 100, Bevölkerung 10, Kosten 20/20/40, Ernennungszeit 21 600 s,
  `recruitedAt: 'statue'`, `attackClass: 'cavalry'`.
- `WorldSettings.paladin: boolean` mit `.default(true)`. `unitsEnabled` und
  `buildingsEnabled` (neu, analog) blenden Statue und Paladin aus.
- `PALADIN_REVIVE_TIME`.

### Server

- `paladinStatus(world, playerId)` in `engine/paladin.ts`.
- `recruitUnits(paladin)`: nur mit `count = 1`, nur wenn der Status `none` oder ein
  abgelaufenes `dead` ist. Sonst `paladin_exists` bzw. `paladin_reviving`.
- Kampf: Stirbt der Paladin, wird `paladin_deaths` geschrieben.
- **Eroberung:** Steht der Paladin des alten Besitzers im eroberten Dorf, stirbt er dort
  wie jede andere Einheit. Ein Paladin als Unterstützung in einem fremden Dorf bleibt dort
  (das ergibt sich aus dem bestehenden Unterstützungsmodell).
- Startstufe `statue: 0`, Barbaren ohne Statue.

### Bots

- `decide/recruit.ts`: Ein Bot ernennt seinen Paladin, sobald die Statue steht und die
  Kosten trivial sind. `raider` schickt ihn mit dem Hauptangriff, `turtle` lässt ihn im
  Hauptdorf.

### Client

- Gebäudeseite Statue mit Paladin-Status (zu Hause / unterwegs / tot, Wiederbelebung in …).
- Einheitenlisten über `unitsEnabled` (19-12). Damit ist der Paladin bei `paladin: false`
  automatisch unsichtbar.
- Sprites `building.statue`, `unit.paladin`, Handbuch, i18n.

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/types.ts` · `data/units.ts` · `data/buildings.ts` | `statue`, `paladin` |
| `shared/src/logic/units.ts` · `schema/world.ts` | `paladin`-Option, `buildingsEnabled` |
| `server/src/engine/paladin.ts` | **neu** — `paladinStatus` |
| `server/src/engine/military.ts` | Rekrutierungsregel, Tod im Kampf |
| `server/src/db/ddl.ts` · Migration | `paladin_deaths`, `CHECK`-Listen |
| `server/src/ai/decide/recruit.ts` · `decide/military.ts` | Paladin |
| `client/src/features/village/…` · `handbook/…` | Statue, Status |

## Verifikation

- **Einer je Spieler:** Spieler mit zwei Dörfern und je einer Statue → der zweite Paladin
  wird abgewiesen (`paladin_exists`), auch wenn der erste gerade unterwegs ist oder
  anderswo unterstützt.
- **Tod und Wiederbelebung:** Paladin stirbt im Angriff → `paladin_deaths` ist
  geschrieben. Eine sofortige Ernennung läuft genau `PALADIN_REVIVE_TIME` und ist danach
  verfügbar.
- **Welt-Option:** Welt mit `paladin: false` → Statue nicht baubar (`building_disabled`),
  Paladin nicht im Handbuch.
- **Bots:** Nach einer simulierten Woche hat jeder Bot mit Statue höchstens einen Paladin
  (Invariante über alle Tabellen geprüft).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
