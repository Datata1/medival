# Ticket 19-12: Bogenschützen

**Status:** 📋 offen · **Voraussetzung:** [19-10](19-10-spaeher.md) (führt `attackClass` ein)

## Kontext

Die Kampfformel (`shared/src/logic/combat.ts`) kennt zwei Angriffsklassen. `UnitSpec`
hat `isCavalry: boolean`, und jede Einheit hat `defense` (gegen Infanterie) und
`defenseCavalry`. `attackPower` teilt den Angriff in Infanterie- und Kavallerieanteil,
`defensePower` gewichtet die Verteidigung damit.

Tribal Wars hat auf Welten mit Bogenschützen **drei** Klassen. Bogenschützen greifen als
eigene Klasse an, und jede Einheit hat einen dritten Verteidigungswert gegen Bogen. Damit
entsteht das typische Schere-Stein-Papier: Speer gegen Kavallerie, Schwert gegen
Infanterie, Bogen gegen Bogen.

Bogenschützen sind in Tribal Wars eine **Welt-Option**. Das wurde mit dem Nutzer so
entschieden: Einstellung `archers`, Standard an.

## Kernentscheidung: Drei Klassen, eine Formel

`isCavalry` wird zu `attackClass: 'infantry' | 'cavalry' | 'archer'`. 19-10 führt das
Feld für den Späher ein, dieses Ticket vervollständigt es. Jede Einheit bekommt
`defenseArcher`. Die bestehende Formel verallgemeinert sich ohne Sonderfall:

```
anteil_k   = angriff_k / angriff_gesamt               k ∈ {inf, cav, arc}
verteidigung = Σ_k anteil_k · Σ_einheiten verteidigung_k
```

Bei `archers: false` ist `anteil_arc = 0`, die Formel ergibt exakt das heutige
Ergebnis. Ein Test sichert das für alle bestehenden Kampftests ab (siehe Verifikation).

**Ist die Option aus, gibt es die Einheiten in dieser Welt nicht.** Sie sind weder
rekrutierbar noch sichtbar. Das regelt eine zentrale Funktion
`unitsEnabled(settings): UnitType[]`, die Server (Prüfung in `recruitUnits`, Bots) und
Client (Tabellen, Formulare, Handbuch) gleichermaßen benutzen. Kein Codepfad prüft
`settings.archers` direkt.

## Umsetzung

### Shared

- `UnitType` + `'archer'`, `'mounted_archer'`. Werte nach Tribal Wars:

| | Angriff | Vert. Inf/Kav/Bogen | min/Feld | Tragkraft | Bev. | Kosten | Zeit | Gebäude | Klasse |
|---|---|---|---|---|---|---|---|---|---|
| archer | 15 | 50 / 40 / 5 | 18 | 10 | 1 | 100/30/60 | 1800 s | Kaserne | archer |
| mounted_archer | 120 | 40 / 30 / 50 | 10 | 50 | 5 | 250/100/150 | 2700 s | Stall | archer |

- `defenseArcher` für alle bestehenden Einheiten (Tribal-Wars-Werte, z. B. Speer 20,
  Schwert 40, Axt 10, leichte Kavallerie 30, schwere Kavallerie 180, Rammbock 20,
  Katapult 100, Adelsgeschlecht 100, Späher 2).
- `combat.ts`: `attackPower` → Anteile je Klasse, `defensePower` → drei Summen.
  `estimateBattle` und `attackMargin` ziehen nach.
- `WorldSettings.archers: boolean` mit `.default(true)`.
- `shared/src/logic/units.ts` (neu): `unitsEnabled(settings)`, `isUnitEnabled`.

### Server

- `recruitUnits`: `unit_disabled`, wenn `!isUnitEnabled`.
- `sendUnits`: unverändert. Was nicht rekrutierbar ist, existiert nicht.
- Bots: `decide/recruit.ts` bekommt `enabledUnits` im Snapshot, `turtle` mischt
  Bogenschützen in die Verteidigung, `raider` berittene Bogenschützen.

### Client

- Alle Einheitenlisten (Rekrutierung, Sendeformular, Dorfübersicht, Berichte, Handbuch)
  iterieren über `unitsEnabled(world.settings)` statt `UNIT_ORDER`.
- Weltanlage: Schalter „Bogenschützen".
- Sprites `unit.archer`, `unit.mounted_archer`, i18n.

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/types.ts` · `data/units.ts` | `attackClass`, `defenseArcher`, zwei Einheiten |
| `shared/src/logic/combat.ts` | drei Klassen |
| `shared/src/logic/units.ts` | **neu** — `unitsEnabled` |
| `shared/src/schema/world.ts` | `archers` |
| `shared/test/combat.test.ts` | Regressions- und neue Tests |
| `server/src/engine/military.ts` | `unit_disabled` |
| `server/src/db/ddl.ts` · Migration | `CHECK`-Liste |
| `server/src/ai/perceive.ts` · `decide/recruit.ts` | aktivierte Einheiten |
| `client/src/features/{village,map,reports,handbook,lobby}/…` | `unitsEnabled` |

## Verifikation

- **Regression:** Alle bestehenden `combat.test.ts`-Fälle ergeben ohne Bogenschützen
  bitgenau dasselbe Ergebnis wie vorher (Ergebnisse vor dem Umbau als Fixture
  festhalten).
- **Pur:** 1 000 Bogenschützen gegen 1 000 Speere vs. gegen 1 000 Bogenschützen →
  Verteidigung entspricht `defenseArcher` (5 bzw. 20). Gemischter Angriff → Gewichtung
  nach Anteilen.
- **Welt-Option:** Welt mit `archers: false` → `POST /recruit {archer}` → 400
  `unit_disabled`. Das Handbuch und `GET /api/worlds/:id` enthalten keine
  Bogenschützen.
- **Ältere Welt:** `settings_json` ohne `archers` lädt mit `true`.
- **Bots:** In einer simulierten Woche mit Bogenschützen rekrutieren `turtle`-Bots
  Bogenschützen. Ohne Bogenschützen tut es kein Bot.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
