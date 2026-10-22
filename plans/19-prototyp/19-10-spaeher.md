# Ticket 19-10: Späher & Spähberichte

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** [19-2](19-2-zeit-engine-konsistenz.md), [19-9](19-9-welt-beitreten-und-rechte.md)

> **Ergebnis:**
>
> - **Einheit `spy`:** Werte nach Tribal Wars, rekrutiert im Stall. Ein Angriff nur aus
>   Spähern ist eine Spähmission (`resolveScoutArrival`) und kämpft nur gegen die
>   Späher im Ziel. Verlustanteil ist `min(1, (V/A)^1,5 · 0,5)`: Bei Gleichstand fällt
>   die Hälfte, bei doppelter Übermacht der Verteidiger fallen alle.
> - **Stufen nach dem Anteil der Überlebenden:** ≥ 1 Späher ergibt Rohstoffe und Truppen
>   zu Hause, ≥ 50 % zusätzlich Gebäude, ≥ 70 % zusätzlich Truppen unterwegs. Der
>   Spähende bekommt einen Bericht `scout`. Der Verteidiger erfährt nur dann davon, wenn
>   seine Späher jemanden gestellt haben (`scout_defense`).
> - **Gemischter Angriff:** Überlebende Späher liefern im Kampfbericht `scouted`
>   (Lager vor der Plünderung und Gebäude).
> - **`scout_intel`:** Das letzte Spähwissen je Spieler und Dorf wird gespeichert, auch
>   für Bots, die keine Berichte bekommen.
> - **Bots:** Die Wahrnehmung nutzt frisches Wissen (6 Spielstunden) statt der Schätzung
>   aus Punkten. `decideScouting` (pur) späht das Lieblingsziel aus, höchstens ein Trupp
>   je Dorf gleichzeitig, `turtle` gar nicht. Späher haben in jeder Heeresmischung einen
>   kleinen Anteil.
> - **`isCavalry` wird zu `attackClass`** (`infantry` | `cavalry`), damit 19-12 `archer`
>   ergänzen kann.
> - **Client:** Spähbericht mit Stufen („nicht erkundet" statt Lücken), `scouted` im
>   Kampfbericht, Sprite `unit.spy`, Texte. Das Handbuch zeigt den Späher automatisch.
>
> **Allgemeine Migration für `CHECK`-Listen** (`refreshCheckLists`): Tabellen, deren
> Liste einen Wert aus `UNIT_ORDER`/`BUILDING_ORDER` nicht kennt, werden neu angelegt,
> die Daten werden kopiert, die Indizes wiederhergestellt. Das läuft nach allen
> Spaltenmigrationen und dient auch 19-11 bis 19-14.
>
> **Ein Fehler im ersten Entwurf**, gefunden vom Regressionstest aus 19-4: Die Bots
> spähten bei jedem Tick das nächste unbekannte Ziel aus. Das ergab 9 030 Ankünfte in
> einer Spielstunde bei zehn Bots. Seit der Korrektur gibt es nur ein Ziel und einen
> Trupp je Dorf. Gemessen danach in Stunde 4: 567 Lieferungen, 749 Rückwege, 132 Angriffe,
> 67 Spähtrupps. Die Angriffe nahmen zu, weil Bots schwache Barbaren jetzt erkennen. Die
> grobe Obergrenze im Test ist deshalb von 1,5 auf 2 Ankünfte je Bot und Spielstunde
> gestiegen. Die eigentlichen Regeln (Mindestmenge, eine Lieferung je Partner) gelten
> unverändert.
>
> **Tests:** `shared/test/combat.test.ts` prüft Spähkampf, Stufen, `isScoutMission` und
> dass Späher nicht angreifen. `test/integration/scouting.test.ts` prüft die Mission ohne
> Gegenwehr (Stufe 3, Verteidiger merkt nichts, Speere kämpfen nicht, Späher kehren
> heim), die Abwehr durch 20 Späher (A ohne Bericht, B mit `scout_defense`), den
> gemischten Angriff mit `scouted`, das Spähwissen für Bots, `decideScouting` (bestes
> unbekanntes Ziel, einer bleibt zu Hause, nicht bei erkundetem Ziel oder Trupp
> unterwegs, nie für `turtle`, keine Neutralen) und die **Migration einer alten Welt**,
> deren `CHECK`-Liste `spy` nicht kannte.
>
> **Im Browser:** Die Spielerin tritt bei und schickt 5 Späher über die API zum nächsten
> Barbarendorf. Nach 17 s gibt es einen Spähbericht der Stufe 3 mit Rohstoffen, Truppen und
> Gebäuden (Screenshot geprüft).
>
> **Abweichungen von der Planung:**
>
> - **Kein A/B-Vergleich** der Angriffserfolge mit und ohne Aufklärung. Gemessen ist
>   stattdessen die Zusammensetzung der Ankünfte. Die Wirkung auf die Bots zeigt sich
>   darin, dass sie häufiger angreifen.
> - **„Zuletzt erkundet vor …" im Kartenpanel** ist nicht gebaut. Das Wissen liegt in
>   `scout_intel` und kann später angezeigt werden.
> - **Das Testorakel aus 19-5 ist gelöscht**, wie dort angekündigt: Die Wahrnehmung kennt
>   jetzt Spähwissen und ist damit nicht mehr gleich der alten.

## Kontext

Ohne Späher ist jeder Angriff ein Blindflug. Tribal Wars lebt davon, dass man vor dem
Angriff weiß, was im Ziel steht, und dass man genau das dem Gegner verwehren will. Heute
gibt es keine Aufklärung:

- `UNITS` (`shared/src/data/units.ts`) kennt sieben Einheiten, keinen Späher.
- Bots **schätzen** die Verteidigung aus den Punkten (`estimateDefense`,
  `server/src/ai/perceive.ts`). Der Kommentar dort nennt es ausdrücklich eine Notlösung:
  *„Ein Bot mit Röntgenblick … ist als Gegner uninteressant."* Aufklärung ist der ehrliche
  Weg zwischen Röntgenblick und Raten.
- Berichte kennen nur Kämpfe und Handel.

## Kernentscheidung: Späher kämpfen nur gegen Späher

Wie in Tribal Wars:

- Ein Angriff, der **nur** aus Spähern besteht, ist eine Spähmission. Er kämpft nicht
  gegen die normale Verteidigung, nur gegen die Späher im Ziel.
- **Spähkampf:** Verlustquote der Angreifer-Späher =
  `min(1, (verteidigendeSpäher / angreifendeSpäher) ^ 1.5 · SPY_DEFENSE_FACTOR)`.
  Überlebt mindestens einer, gibt es einen Bericht. Verteidiger-Späher verlieren nichts.
- **Abgestufter Bericht** nach Anteil der Überlebenden:

| Überlebende | Bericht enthält |
|---|---|
| ≥ 1 | Rohstoffe im Dorf, Truppen zu Hause |
| ≥ 50 % | zusätzlich Gebäudestufen |
| ≥ 70 % | zusätzlich Truppen außerhalb (Unterstützung anderswo, unterwegs) |

- Späher in einem **gemischten** Angriff kämpfen normal mit (Angriff 0). Überleben welche,
  erhält der Angreiferbericht Rohstoffe und Gebäude.
- Der **Verteidiger** erhält bei einer reinen Spähmission nur dann einen Bericht, wenn
  eigene Späher Verluste verursacht haben. Er sieht dann, dass und von wem gespäht wurde.

Die Formel und die Stufen stehen als pure Funktion in `shared/src/logic/combat.ts`
(`resolveSpying`) und werden ohne Datenbank getestet.

## Umsetzung

### Shared

- `UnitType` + `'spy'`. Spezifikation nach Tribal Wars: Angriff 0, Verteidigung 2/1/2,
  9 min/Feld, Tragkraft 0, Bevölkerung 2, Kosten 50/50/20, Rekrutierzeit 900 s,
  rekrutiert im **Stall**, `attackClass: 'cavalry'`.
- `resolveSpying(attSpies, defSpies, rng) → { attackerLosses, tier }`.
- Bericht-Schema `scout` in `shared/src/schema/api.ts` (Discriminated Union neben
  `battle` und `trade`).

### Server

- `military.ts:resolveAttackArrival`: reiner Späh-Angriff → `resolveScoutArrival`. Er
  liest das Zieldorf zum Ankunftszeitpunkt (`at`, 19-2), also mit `settleResources` und
  `settleRecruits` auf `at`, nicht auf `now`.
- Neue Tabelle `scout_intel (player_id, village_id, game_time, payload_json)`. Sie hält
  je Spieler und Dorf den **letzten** Spähstand und ist die Grundlage für Bots.
- `travelTime` nimmt wie bisher die langsamste Einheit. Ein reiner Spähtrupp ist deshalb
  schnell.

### Bots

- `perceiveTargets`: Liegt Spähwissen vor, das jünger als `INTEL_MAX_AGE` ist
  (Spielzeit, Standard 6 h bei Speed 1), dient es als `estimatedDefense`. Sonst wird
  weiter geschätzt.
- `decide/military.ts`: Vor dem Angriff auf ein Ziel ohne frisches Spähwissen gibt es
  einen Intent `send` mit `{ spy: 1–5 }`. Die Persönlichkeit steuert die Häufigkeit:
  `raider` späht oft, `turtle` selten.
- `decide/recruit.ts`: Späher anteilig je Persönlichkeit, als Verteidigung (Späher zu
  Hause) und für Aufklärung.

### Client

- Sendeformular (`SendUnitsForm.tsx`): Späher wie jede Einheit, Hinweis „nur Späher =
  Spähmission".
- Berichtsansicht: Darstellung `scout` mit den drei Stufen. Fehlende Stufen erscheinen
  als „nicht erkundet".
- Kartenpanel (`TargetPanel.tsx`): „Zuletzt erkundet vor …" aus `scout_intel`.
- Sprite `unit.spy`, Handbuch, i18n.

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/types.ts` · `data/units.ts` | `spy`, `attackClass` (siehe auch 19-12) |
| `shared/src/logic/combat.ts` | `resolveSpying` |
| `shared/src/schema/api.ts` | Bericht `scout`, `ScoutIntel` |
| `server/src/engine/military.ts` | `resolveScoutArrival` |
| `server/src/db/ddl.ts` · Migration | `scout_intel`, `CHECK`-Liste der Einheiten (siehe README) |
| `server/src/ai/perceive.ts` · `decide/military.ts` · `decide/recruit.ts` | Aufklärung |
| `client/src/features/{map,reports,village}/…` | Formular, Bericht, Panel |
| Sprites, `i18n/de.ts`, Handbuch | wie im README beschrieben |

## Verifikation

- **Pur:** 10 Späher gegen 0 → kein Verlust, Stufe 3. 10 gegen 10 → Verluste nach Formel,
  Stufe passend. 1 gegen 100 → Totalverlust, kein Bericht.
- **Szenario:** A schickt 5 Späher zu B (B hat 0 Späher, 100 Speere) → A erhält einen
  Bericht mit B's Speeren und Rohstoffen zum Ankunftszeitpunkt (auf die Einheit genau).
  B erhält keinen Bericht, B's Speere kämpfen nicht.
- **Szenario:** B hat 20 Späher, A schickt 5 → A verliert alle, kein Bericht für A, B
  erhält einen Bericht „Spähversuch von A abgewehrt".
- **Gemischt:** 100 Äxte + 5 Späher → normaler Kampf. Überleben Späher, enthält A's
  Bericht die Gebäude.
- **Bots:** In einer simulierten Woche (Harness) schicken `raider`-Bots messbar Späher
  vor Angriffen, und ihre Angriffe haben eine höhere Erfolgsquote als ohne Aufklärung
  (A/B über zwei Seeds, Messwert im Test).
- **Rechte:** C sieht A's Spähbericht nicht (19-9).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
