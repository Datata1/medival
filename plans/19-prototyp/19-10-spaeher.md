# Ticket 19-10: Späher & Spähberichte

**Status:** 📋 offen · **Voraussetzung:** [19-2](19-2-zeit-engine-konsistenz.md), [19-9](19-9-welt-beitreten-und-rechte.md) (Berichte je Empfänger)

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
