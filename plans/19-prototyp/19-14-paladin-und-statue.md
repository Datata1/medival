# Ticket 19-14: Paladin & Statue

**Status:** 📋 offen · **Voraussetzung:** [19-12](19-12-bogenschuetzen.md) (`unitsEnabled`), [19-13](19-13-schmiede-versammlungsplatz-versteck.md)

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
