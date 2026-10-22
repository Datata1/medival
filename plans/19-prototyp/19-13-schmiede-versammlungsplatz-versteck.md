# Ticket 19-13: Schmiede, Versammlungsplatz, Versteck

**Status:** 📋 offen · **Voraussetzung:** [19-11](19-11-werkstatt-katapult.md), [19-12](19-12-bogenschuetzen.md)

## Kontext

Drei Basisgebäude aus Tribal Wars fehlen. Jedes ist einzeln klein, alle drei greifen aber
in bestehende Abläufe ein:

- **Schmiede.** Nur Speerträger sind von Anfang an verfügbar, alle anderen Einheiten
  müssen erforscht werden. Heute ist jede Einheit sofort rekrutierbar, sobald ihr
  Gebäude steht. Ein Spieler mit Kaserne 1 kann Äxte bauen, bevor er seine Wirtschaft
  aufgebaut hat. Die Schmiede ist die Bremse, die den frühen Spielverlauf formt.
- **Versammlungsplatz.** In Tribal Wars die Voraussetzung, um überhaupt Truppen zu
  schicken. Heute kann jedes Dorf sofort angreifen.
- **Versteck.** Schützt eine Menge Rohstoffe vor Plünderung. Heute nimmt ein Angreifer
  alles bis zur Tragkraft (`military.ts:523-542`). Für kleine Spieler neben großen
  Nachbarn ist das Versteck die einzige Möglichkeit, überhaupt zu wachsen.

Kirche und Wachturm sind ausdrücklich **nicht** Teil des Prototyps.

## Kernentscheidungen

**Schmiede: einstufige Forschung statt Stufenforschung.** Ältere Tribal-Wars-Welten
kennen Forschungsstufen 1–3 je Einheit. Neuere Welten haben eine einfache Freischaltung.
Der Prototyp nimmt die einfache Variante: **eine Forschung je Einheit**, mit Kosten,
Forschungszeit und Mindeststufe der Schmiede. Eine Forschung läuft wie ein Bauauftrag
(eigene Schleife, ein Event am Ende).

| Einheit | Schmiede | weitere Voraussetzung |
|---|---|---|
| spear | — (frei) | |
| sword | 1 | |
| axe | 2 | |
| spy | 1 | Stall 1 |
| light_cavalry | 3 | Stall 1 |
| archer / mounted_archer | 5 / 7 | Stall 1 für berittene |
| heavy_cavalry | 15 | Stall 10 |
| ram / catapult | 2 / 12 | Werkstatt 1 / 2 |
| noble, paladin | — | (eigene Regeln: Adelshof, 19-14) |

Die Werkstatt erhält die Voraussetzung **Schmiede 10** (in 19-11 offen gelassen).

**Versammlungsplatz: Stufe 1 ab Start.** Das Gebäude hat nur eine Stufe und ist in jedem
neuen Dorf vorhanden. Wird es durch Katapulte zerstört, kann das Dorf keine Truppen
schicken, bis es neu gebaut ist. Das ist die eigentliche Spielfunktion, also ist der
Versammlungsplatz als Katapultziel erlaubt.

**Versteck: geschützte Menge je Rohstoff.** `hiddenCapacity(level) = round(150 · 1.3335^(level−1))`,
max. Stufe 10 (≈ 2 000). Die Beuteberechnung zieht diese Menge pro Rohstoff ab, **bevor**
die Tragkraft verteilt wird. Die Funktion ist pur in `shared`, die Beuteverteilung
wird dafür aus `military.ts` in `shared/src/logic/loot.ts` verschoben, damit sie
ohne Datenbank testbar ist.

## Umsetzung

### Shared

- `BuildingType` + `'smithy'`, `'rally_point'`, `'hiding_place'`. Werte nach Tribal Wars:
  Schmiede 220/180/240, max. 20, Voraussetzung Hauptgebäude 5 + Kaserne 1.
  Versammlungsplatz 10/40/30, max. 1. Versteck 50/60/50, max. 10.
- `STARTING_BUILDINGS.rally_point = 1`.
- `shared/src/data/research.ts`: `RESEARCH: Record<UnitType, { smithy, requires?, cost,
  timeS } | null>` (null = keine Forschung nötig).
- `shared/src/logic/loot.ts`: `distributeLoot(resources, hidden, capacity)`.
- `canRecruit(unit, levels, researched)` als einziger Ort der Rekrutierungs-
  Voraussetzungen, genutzt von Server, Bots und Client.

### Server

- Tabellen `research (village_id, unit_type)` (erforscht) und `research_queue`
  (`id, village_id, unit_type, completes_at`), Event `research_complete`.
- Neues Kommando `researchUnit(world, actor, villageId, unit)` über `world.command`
  (19-2/19-9). Prüft Schmiedenstufe und Kosten, eine Forschung gleichzeitig je Dorf.
- `recruitUnits`: `canRecruit` statt der bisherigen Gebäudeprüfung. Neuer Fehler
  `not_researched`.
- `sendUnits`: `rally_point ≥ 1`, sonst `no_rally_point`.
- `resolveAttackArrival`: Beute über `distributeLoot` mit `hiddenCapacity`.
- **Migration bestehender Welten:** Jedes Dorf bekommt `rally_point = 1`, und **alle
  Einheiten, die das Dorf bereits besitzt oder rekrutiert, gelten als erforscht**. Ein
  Spielstand verliert so keine Fähigkeit.
- Barbarendörfer: Versteck mit zufälliger Stufe 0–3, Versammlungsplatz 1.

### Bots

- Intent `research` in `ai/intents.ts`, Ausführung in `execute.ts`.
- `decide/research.ts` (pur): Forschungsreihenfolge je Persönlichkeit (`raider`: Axt →
  leichte Kavallerie, `turtle`: Schwert → Bogen), nur wenn die Bauschleife das Lager
  nicht ohnehin leert.
- `decide/build.ts`: Schmiede als `military`, Versteck als `defense` (bei `turtle` hoch
  gewichtet, bei kleinen Bots neben großen Nachbarn ebenfalls).

### Client

- Gebäudeseiten Schmiede (Forschungsliste mit Status, Kosten und Dauer), Versteck
  (geschützte Menge), Versammlungsplatz (verlinkt auf das Sendeformular). Die
  Truppenbewegungen leben heute in `RallyView.tsx`, der Name passt jetzt.
- Rekrutierung zeigt nicht erforschte Einheiten ausgegraut mit Hinweis.
- Sprites, Handbuch, i18n.

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/types.ts` · `data/buildings.ts` | drei Gebäude, Startstufen |
| `shared/src/data/research.ts` · `logic/loot.ts` | **neu** |
| `shared/src/logic/formulas.ts` | `hiddenCapacity`, `canRecruit` |
| `server/src/engine/military.ts` | `canRecruit`, `no_rally_point`, Beute über `loot.ts` |
| `server/src/engine/research.ts` | **neu** — Kommando + Event |
| `server/src/db/ddl.ts` · Migration | Tabellen, `CHECK`-Listen, Bestandsschutz |
| `server/src/ai/{intents,execute,perceive}.ts` · `decide/research.ts` · `decide/build.ts` | Forschung |
| `client/src/features/village/…` · `handbook/…` | Seiten, Ausgrauen |

## Verifikation

- **Pur:** `distributeLoot` mit Versteck 3 (≈ 267) und 1 000 Holz → höchstens 733
  plünderbar. Mit leerem Versteck entspricht das Ergebnis dem bisherigen Verhalten
  (Fixture vor dem Umzug festhalten).
- **Szenario Forschung:** Axt rekrutieren ohne Forschung → `not_researched`. Forschung
  starten → `research_complete` exakt zu `completes_at` → Rekrutierung möglich.
- **Szenario Versammlungsplatz:** Katapulte zerstören B's Versammlungsplatz → B's
  `sendUnits` → `no_rally_point`. Nach dem Wiederaufbau geht es wieder.
- **Szenario Versteck:** A plündert B (Versteck 5) → B behält mindestens
  `hiddenCapacity(5)` je Rohstoff, A's Bericht zeigt die geringere Beute.
- **Migration:** Alte Welt mit vorhandenen Äxten → Axt gilt als erforscht, jedes Dorf hat
  einen Versammlungsplatz.
- **Bots:** In einer simulierten Woche forschen Bots und rekrutieren danach. Kein
  abgewiesener Intent mit `not_researched` im Protokoll.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
