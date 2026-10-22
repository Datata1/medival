# Ticket 19-11: Werkstatt, Katapult, Rammbock-Umzug

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** [19-2](19-2-zeit-engine-konsistenz.md) · **Vor:** [19-13](19-13-schmiede-versammlungsplatz-versteck.md)

> **Ergebnis:**
>
> - **Gebäude `workshop`** (Werkstatt): bis Stufe 15, verlangt Hauptgebäude 10. Rammbock
>   und neues **Katapult** entstehen dort, in einer eigenen Schleife neben Kaserne und
>   Stall. Ohne Werkstatt meldet die Rekrutierung `workshop_missing`.
> - **Katapultschaden** (`catapultDamage`, pur): Stufe für Stufe nach
>   `CATAPULTS_PER_LEVEL` (`shared/src/data/siege.ts`). Verliert der Angreifer, wirkt nur
>   die Hälfte. Hauptgebäude, Bauernhof und Speicher fallen nie unter Stufe 1. Der Schuss
>   kommt nach den Rammen, beim Wall also auf die schon gerammte Stufe.
> - **Ziel beim Abschicken:** `catapultTarget` im Sendeauftrag und in `movements`,
>   ohne Angabe das Hauptgebäude. Das Sendeformular zeigt die Auswahl, sobald Katapulte
>   dabei sind. Beide Berichte nennen den Schaden (`buildingDamage`).
> - **Laufender Ausbau** des beschossenen Gebäudes baut auf der neuen Stufe weiter: Wer
>   10 → 11 baut und auf 7 beschossen wird, hat danach Stufe 8.
> - **Bots:** `raider` schießt auf die Kaserne, alle anderen auf den Wall. Katapulte
>   sind 5 % der `raider`-Mischung.
> - **Migrationen:** Spalte `movements.catapult_target`, fehlende Gebäudezeilen (Stufe 0)
>   für jeden Typ aus `BUILDING_ORDER` (dient auch 19-13/19-14), `CHECK`-Listen über
>   `refreshCheckLists` aus 19-10. Ein alter Rammbock-Auftrag, der hinter Kasernen-
>   aufträgen wartete, startet jetzt von selbst in der Werkstatt (`settleRecruits`).
> - **Client:** Werkstatt auf dem Dorfplatz und in der Dorfnavigation, Rekrutierung in
>   der Werkstatt, Katapultziel im Sendeformular, Schaden im Bericht, Sprites
>   `building.workshop`, `yard.workshop`, `unit.catapult`, Texte.
>
> **Tests:** `shared/test/combat.test.ts` prüft Tabelle, Mindeststufe und halben Schaden.
> `test/integration/siege.test.ts`: 12 Katapulte schießen die Kaserne von 10 auf 7,
> Punkte sinken, beide Berichte nennen den Schaden. 30 Katapulte ohne Ziel lassen das
> Hauptgebäude auf 1. Ein laufender Ausbau endet auf beschossener Stufe + 1. Rammen
> verlangen die Werkstatt und werden fertig, während die Kaserne noch Speere baut. Ein
> alter wartender Rammbock-Auftrag läuft an. Eine alte Welt ohne Werkstatt-Zeile
> bekommt sie beim Öffnen.
>
> **Im Browser:** Die Spielerin hat Werkstatt 3, sieht sie auf dem Dorfplatz und kann
> dort Rammen und Katapulte rekrutieren. 10 Katapulte mit 300 Äxten schießen das
> Hauptgebäude eines Barbarendorfs von 5 auf 1, genau nach Tabelle. Der Bericht zeigt
> „Katapulte trafen Hauptgebäude: Stufe 5 → 1" (Screenshot geprüft).
>
> **Abweichungen von der Planung:**
>
> - **Fehlercode `workshop_missing`** statt `requirements_missing`, passend zu
>   `barracks_missing` und `stable_missing`.
> - **Szenario mit 12 statt 50 Katapulten:** 50 würden die Kaserne ganz abreißen. Mit 12
>   prüft der Test eine genaue Zwischenstufe.
> - **Migration ohne Kopie aus `data/`:** Der Test legt den alten Auftrag per SQL an,
>   so wie er vor 19-11 in der Schlange stand.

## Kontext

- Der **Rammbock** wird in der Kaserne rekrutiert (`shared/src/data/units.ts`,
  `recruitedAt: 'barracks'`). In Tribal Wars gehören Rammbock und Katapult in die
  **Werkstatt**. Das ist kein Detail: Belagerungsgerät hat eine eigene Bauschleife und
  konkurriert nicht mit der Infanterie um Kasernenzeit.
- Es gibt **kein Katapult**. Ohne Katapult kann man außer dem Wall kein Gebäude
  beschädigen. Gerade das Zurückschießen von Kaserne, Bauernhof oder Adelshof ist ein
  zentrales Werkzeug gegen starke Nachbarn.
- `ramDamage` (`shared/src/logic/combat.ts:65`) ist eine Vereinfachung („4 Rammen = 1
  Stufe"). Das reicht vorerst, das Katapult braucht aber ein eigenes, abgestuftes Modell.

## Kernentscheidung: Das Katapult wählt sein Ziel beim Abschicken

Wie in Tribal Wars wird das Zielgebäude beim Absenden festgelegt (`targetBuilding`).
Standard ist das Hauptgebäude. Es steht in der Bewegung und wird bei der Ankunft
abgerechnet. Zufallsziele gibt es im Prototyp nicht.

**Schadensmodell als Tabelle, nicht als Formel.** Tribal Wars benutzt Tabellen „benötigte
Katapulte je Zielstufe". Die Tabelle steht als Daten in `shared/src/data/siege.ts`:

```ts
// Katapulte, die nötig sind, um ein Gebäude der Stufe L um eine Stufe zu senken
export const CATAPULTS_PER_LEVEL: readonly number[] = [ /* L1 … L30 */ ];
```

`catapultDamage(cats, targetLevel, attackerWon)` → Stufen. Bei verlorenem Kampf wirkt
nur ein Teil, gestaffelt nach Verlustquote, wie beim Rammbock in `resolveBattle`, wo die
halbe Wirkung schon während des Kampfes zählt. Kann ein Gebäude nicht unter eine
Mindeststufe fallen (Hauptgebäude 1, Bauernhof 1, Speicher 1), endet der Schaden dort.

Ein Rammbock auf demselben Angriff wirkt zuerst auf den Wall. Katapulte auf den Wall
wirken zusätzlich.

## Umsetzung

### Shared

- `BuildingType` + `'workshop'`. Spezifikation nach Tribal Wars: Kosten 300/240/260,
  Faktor 1.26, Bauzeit 6000 s, max. 15, Bevölkerung 8. Voraussetzung **Hauptgebäude 10**
  (die Schmiede 10 kommt mit 19-13 dazu).
- `UnitType` + `'catapult'`: Angriff 100, Verteidigung 100/50/100, 30 min/Feld,
  Bevölkerung 8, Kosten 320/400/100, Rekrutierzeit 7200 s, `recruitedAt: 'workshop'`.
- `ram.recruitedAt = 'workshop'`.
- `UnitSpec.recruitedAt` erhält `'workshop'`.
- `catapultDamage`, `CATAPULTS_PER_LEVEL`. `resolveBattle` gibt zusätzlich
  `buildingDamage: { building, from, to } | null` zurück.
- `SendUnitsRequest` mit optionalem `catapultTarget: BuildingType` (zod: nur gültig, wenn
  Katapulte dabei sind).

### Server

- **Migration Rammbock:** Laufende Aufträge mit `unit_type = 'ram'` bleiben gültig und
  laufen zu Ende. Die Rekrutierungsschleife je Gebäude (`handleRecruitTick` sucht den
  nächsten Auftrag über `UNITS[…].recruitedAt`) ordnet sie danach der Werkstatt zu.
  Dörfer mit Rammböcken, aber ohne Werkstatt behalten sie.
- `movements.catapult_target TEXT NULL`.
- `resolveAttackArrival`: Gebäudeschaden anwenden, Punkte neu berechnen (`villagePoints`),
  laufende Bauaufträge des Gebäudes auf die neue Stufe anpassen (Zielstufe bleibt
  `aktuelle + 1`, Kosten wurden schon bezahlt). Bericht ergänzen.
- `recruitUnits` prüft `levels.workshop ≥ 1` für Werkstatt-Einheiten. Die Prüfung ist
  generisch über `recruitedAt`, also ohne Sonderfall.

### Bots

- `BUILDING_CATEGORY.workshop = 'military'`.
- `decide/recruit.ts`: `raider` und `balanced` mischen Rammböcke ab Werkstatt 1 bei,
  Katapulte ab Werkstatt 3.
- `decide/military.ts`: Katapultziel nach Persönlichkeit, `raider` → Kaserne,
  sonst → Wall oder Bauernhof.

### Client

- Gebäudeseite „Werkstatt" (Muster aus 18-2, sonst Gebäudetabelle).
- Sendeformular: Auswahl `catapultTarget`, nur sichtbar, wenn Katapulte gewählt sind.
- Bericht: „Katapulte beschädigen Kaserne von Stufe 12 auf 9".
- Sprites `building.workshop`, `unit.catapult`, Handbuch, i18n.

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/types.ts` · `data/units.ts` · `data/buildings.ts` | `workshop`, `catapult`, Rammbock-Umzug |
| `shared/src/data/siege.ts` | **neu** — Katapulttabelle |
| `shared/src/logic/combat.ts` | `catapultDamage`, `buildingDamage` im Ergebnis |
| `shared/src/schema/api.ts` | `catapultTarget`, Bericht |
| `server/src/engine/military.ts` | Gebäudeschaden, Werkstattprüfung |
| `server/src/db/ddl.ts` · Migration | `movements.catapult_target`, `CHECK`-Listen |
| `server/src/engine/mapgen.ts` | `workshop: 0` in Startstufen |
| `server/src/ai/personalities.ts` · `decide/recruit.ts` · `decide/military.ts` | Belagerung |
| `client/src/features/{village,map,reports,handbook}/…` | Seite, Formular, Bericht |

## Verifikation

- **Pur:** `catapultDamage` liefert für jede Zielstufe genau die Tabellenwerte. Bei
  Mindeststufe endet der Schaden. Ein verlorener Kampf ergibt weniger Schaden als ein
  gewonnener.
- **Szenario:** A greift B mit 200 Äxten und 50 Katapulten auf die Kaserne (Stufe 10) an
  und gewinnt → B's Kaserne steht auf der Stufe laut Tabelle, B's Punkte sind gesunken,
  beide Berichte nennen den Schaden.
- **Szenario:** Bau der Kaserne läuft bei B, Kaserne wird beschossen → nach Fertigstellung
  gilt Stufe = beschossene Stufe + 1.
- **Werkstatt:** Rammbock-Rekrutierung ohne Werkstatt → `requirements_missing`. Mit
  Werkstatt läuft sie in einer eigenen Schleife parallel zur Kaserne.
- **Migration:** Alte Welt mit laufendem Rammbock-Auftrag (Kopie aus `data/`) → der
  Auftrag endet ordnungsgemäß.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
