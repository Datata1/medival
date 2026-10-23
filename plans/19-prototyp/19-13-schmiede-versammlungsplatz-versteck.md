# Ticket 19-13: Schmiede, Versammlungsplatz, Versteck

**Status:** ✅ erledigt (2026-10-23) · **Voraussetzung:** [19-11](19-11-werkstatt-katapult.md), [19-12](19-12-bogenschuetzen.md)

> **Ergebnis:**
>
> - **Schmiede** (`smithy`, max. 20, Hauptgebäude 5 und Kaserne 1): eine Forschung je
>   Einheit mit Schmiedenstufe und Nebengebäuden aus der Tabelle unten
>   (`shared/src/data/research.ts`). Speerträger und Adelsgeschlecht brauchen keine.
>   Höchstens eine Forschung je Dorf, ein Event `research_complete` am Ende. Neue Route
>   `POST /villages/:vid/research`, Fehler `research_busy`, `smithy_too_low`,
>   `requirements_missing`. Die Werkstatt verlangt jetzt Schmiede 10.
> - **`recruitBlock`/`canRecruit`** (`shared/src/logic/research.ts`) sind die einzige
>   Stelle für Rekrutierungs-Voraussetzungen (Gebäude, dann Forschung). Server, Bots und
>   Client fragen dort. Neuer Fehler `not_researched`.
> - **Versammlungsplatz** (`rally_point`, max. 1) ist jetzt ein Gebäude, ab Start auf
>   Stufe 1. Ohne ihn meldet `sendUnits` `no_rally_point`. Katapulte dürfen ihn treffen,
>   neu gebaut wird er im Hauptgebäude. Seine Seite bleibt die Bewegungsübersicht und
>   zeigt nach einem Beschuss den Hinweis, warum nichts abmarschiert.
> - **Versteck** (`hiding_place`, max. 10): `hiddenCapacity(level) =
>   round(150 · 1,3335^(level−1))`, Stufe 10 schützt knapp 2 000. Die Beute rechnet jetzt
>   `distributeLoot` (`shared/src/logic/loot.ts`): erst das Versteck abziehen, dann bis zur
>   Tragkraft verteilen.
> - **Barbaren:** Versteck 0–3 und Versammlungsplatz 1. Ihre Schwertkämpfer gelten als
>   erforscht.
> - **Bots:** Intent `research`, `decide/research.ts` (pur) mit einer Reihenfolge je
>   Persönlichkeit. Geforscht wird aus dem, was nach dem Bauen übrig ist, und vor dem
>   Rekrutieren. Schmiede und Versammlungsplatz zählen als `military`, das Versteck als
>   `defense` mit halbem Gewicht.
> - **Migration:** Tabellen `research` und `research_queue`. In alten Welten gilt jede
>   Einheit als erforscht, die ein Dorf zu Hause hat, ausbildet oder auf dem Marsch hat.
>   Jedes Dorf bekommt den Versammlungsplatz auf Stufe 1.
> - **Client:** Schmiede-Seite mit Forschungsliste (Voraussetzung, Kosten, Dauer, Stand,
>   Countdown), nicht erforschte Einheiten in der Rekrutierung ausgegraut mit „Erst in der
>   Schmiede erforschen", Versteck mit geschützter Menge, Schmiede in der
>   Dorfnavigation, alle drei auf dem Dorfplatz, Handbuch-Spalte „Forschung", Sprites
>   `building.smithy`, `building.hiding_place`, `building.rally_point` (umbenannt aus
>   `rally`), Texte.
>
> **Ein Fehler, den die Messung fand** (seit 19-10 vorhanden): Die Heeresmischung eines
> Bots zählte Einheiten mit, die das Dorf noch nicht ausbilden kann. Vier `turtle`-Bots
> ohne Stall hatten nach drei Spielwochen 168 Speere, 72 Schwerter und 48 Bogenschützen.
> Ihr einziger Rückstand war der Späher, und in der vierten Woche kam keine Einheit dazu.
> Seit der Korrektur rechnet `decideRecruit` die Anteile auf die gerade ausbildbaren
> Einheiten hoch. Danach hatten dieselben Bots in Woche 4 456 statt 288 Einheiten.
>
> **Tests:** `shared/test/research.test.ts` vergleicht `distributeLoot` ohne Versteck in 500
> Zufallsfällen mit der alten Rechnung und prüft Versteck 3 (267 → 733 von 1 000
> plünderbar), die Forschungstabelle und `recruitBlock`/`researchBlock`.
> `test/integration/smithy.test.ts`:
> - Axt ohne Forschung ergibt `not_researched`. Die Forschung ist 1 ms vor `completesAt`
>   offen und genau dann fertig, danach geht die Rekrutierung. Eine zweite Forschung
>   ergibt `research_busy`.
> - Schmiedenstufe und Nebengebäude werden verlangt.
> - Zwei Katapulte zerstören den Versammlungsplatz. Danach gibt es `no_rally_point`, nach
>   dem Neubau geht der Abmarsch wieder.
> - Versteck 5: Bis auf `hiddenCapacity(5)` je Rohstoff wird alles geplündert.
> - Eine alte Welt mit Äxten hat danach `axe` erforscht und den Versammlungsplatz auf 1.
> - Sechs Bots in drei Spielwochen: 13 Forschungen, 275 Einheiten außer Speerträgern, kein
>   einziger abgewiesener Intent.
>
> **Im Browser:**
> - Der Dorfplatz zeigt Schmiede, Versteck und Versammlungsplatz.
> - Die Kaserne zeigt Schwert, Axt und Bogen ausgegraut mit Hinweis.
> - In der Schmiede läuft nach dem Klick auf „Erforschen" die Schwertforschung mit
>   Countdown, und die Liste nennt alle Voraussetzungen.
> - Das Versteck auf Stufe 3 zeigt „267 je Rohstoff geschützt".
>
> Alle vier Ansichten sind per Screenshot bzw. Seitentext geprüft.
>
> **Abweichungen von der Planung:**
>
> - **Forschungskosten und -dauer sind eigene Werte:** das Achtfache der Einheitenkosten
>   und das Vierfache der Ausbildungszeit. Die Tabelle oben nennt nur die Stufen.
> - **Keine `CHECK`-Liste auf `research.unit_type`:** `UnitTypeSchema` prüft beim Lesen,
>   und eine neue Einheit braucht dann keine Neuanlage der Tabelle.
> - **Versteck der Barbaren ohne eigenen Zufallswurf:** Es ist `(Speere + Schwerter) mod
>   4`. Ein zusätzlicher Wurf hätte jeden folgenden Zufallswert verschoben und damit Lage
>   und Ausstattung aller Dörfer bestehender Seeds verändert.
> - **Versteck für „kleine Bots neben großen Nachbarn"** ist nicht gebaut. Das Versteck
>   hat für alle halbes `defense`-Gewicht, damit es den Wall nicht verdrängt. Ohne
>   den Abschlag baute `turtle` im Persönlichkeitstest gar keinen Wall mehr.
> - **Beute-Regression ohne aufgezeichnete Fixture:** Der Test vergleicht mit einer Kopie
>   der alten Rechnung. Das ist ebenso streng und hält die alte Regel lesbar fest.
> - **Kein `world.command`:** Die Forschung folgt dem Muster der übrigen Kommandos. Der
>   Besitz wird in der Route geprüft (`ownVillage`, wie seit 19-9).
> - **Der Versammlungsplatz zählt einen Punkt,** wie jedes Gebäude der Stufe 1. Jedes Dorf
>   hat dadurch einen Punkt mehr. Seine Seite heißt jetzt `/village/:id/rally_point`
>   statt `…/rally`.
> - **Der Bogenschützen-Test aus 19-12** läuft drei statt zwei Spielwochen: Bogenschützen
>   verlangen jetzt Schmiede 5, und nach zwei Wochen hatte noch kein Bot eine Schmiede.

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
