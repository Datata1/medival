# Plan 14: Barbarendörfer — zufälliges Wachstum ohne Tick

**Status:** ⬜ offen · **Voraussetzung:** keine (unabhängig von 15–17)

## Kontext

`engine/mapgen.ts` legt 80 Barbarendörfer an — mit Rohstoffgebäuden zwischen Stufe 1 und 6
und einer Handvoll Speerträgern. Danach passiert **nichts mehr**: Ein Barbarendorf hat
heute exakt dieselben Punkte wie in der ersten Spielsekunde. Die Karte ist bevölkert, aber
tot. Wer früh ein Dorf abfarmt, hat es für immer entwertet.

Im Vorbild sind Barbarendörfer träge, aber nicht statisch: Sie wachsen langsam und ohne
erkennbaren Plan, bewaffnen sich gelegentlich, und sie greifen **nie** an. Genau das ist
das Ziel dieses Plans.

Entschieden (mit Nutzer): Barbaren wachsen **zufällig** (nicht sofort beim ersten
bezahlbaren Gebäude), nur bis zu einem Punktedeckel, und sie kommen über den **echten**
Rekrutierungsweg an Truppen — dieselbe Funktion mit denselben Kosten und Grenzen wie beim
Spieler, keine Sonderregeln.

---

## Die Kernentscheidung: Wartezeit ziehen statt jede Sekunde würfeln

Der Vorschlag war: *„es besteht für jedes Babarendorf eine 1 % Chance etwas zu bauen für
jede Sekunde die vergeht"*. Das ist ein Bernoulli-Prozess und beschreibt das gewünschte
Verhalten treffend — nur darf man ihn in dieser Engine nicht so **umsetzen**.

Die Engine ist ereignisgetrieben mit fauler Auswertung: ein einziges `setTimeout` auf das
nächste fällige Event (`engine/scheduler.ts`), Ressourcen werden erst beim Zugriff
hochgerechnet (`world.settleResources`). Es gibt bewusst keinen Tick — im Leerlauf
verbraucht eine Welt keine CPU. Eine Schleife, die 80 Dörfer jede Sekunde abfragt, wäre die
erste Stelle, die dieses Prinzip bricht.

Der Ausweg ist keine Näherung, sondern die exakte Umkehrung: **Die Wartezeit bis zum
nächsten Treffer eines Bernoulli-Prozesses ist exponentialverteilt.** Statt tausendmal zu
würfeln, bis einmal „ja" fällt, zieht man direkt, wann das „ja" fällt:

```
λ  = -ln(1 - p)          # p = Trefferchance pro Zeiteinheit
Δt = -ln(1 - U) / λ      # U gleichverteilt [0,1), aus world.rng
```

Das ist **dieselbe Verteilung**, nicht eine ähnliche. Der Unterschied liegt allein in den
Kosten: ein Event pro Bauversuch statt 3600 Würfen pro Stunde und Dorf.

### Warum 1 % pro Sekunde trotzdem zu viel ist

Die Zahl selbst muss angepasst werden, unabhängig vom Verfahren. Alle Zeiten in der Engine
sind Spielzeit; bei Speed 200 vergeht eine Spielstunde in 18 echten Sekunden.

| Rate | Versuche/Spielstunde | Events/echte Sekunde bei 80 Dörfern, Speed 200 |
|---|---|---|
| 1 % pro Spielsekunde | 36 | **160** |
| 1 Versuch pro Spielstunde | 1 | **4,4** |

160 Events pro Sekunde wären nicht unbedingt zu langsam, aber sie wären reine
Verschwendung: Der weitaus größte Teil dieser Versuche würde ohnehin an fehlenden
Rohstoffen scheitern. Die Wirtschaft ist bereits die eigentliche Bremse — der Zufall soll
nur dafür sorgen, dass Barbaren **nicht** sofort bauen, sobald sie könnten.

Vorgabe deshalb: **1 Versuch pro Spielstunde**, einstellbar über `WorldSettings`.

---

## Umsetzung

### Ein Event pro Dorf, das sich selbst neu plant

Neuer Event-Typ `barbarian_tick` mit Payload `{ villageId }`. Das Schema kommt nach
`packages/shared/src/schema/events.ts` in `EVENT_SCHEMAS` — der Handler **parst**, er
castet nicht (Plan 08). Der Zweig in `world.ts:handleEvent` ersetzt einen Teil des heutigen
Kommentars *„future milestones add handlers here"*.

Jedes Feuern in dieser Reihenfolge:

1. Ressourcen abrechnen (`settleResources`).
2. Snapshot bauen, Aktion entscheiden (pure, siehe unten).
3. Aktion ausführen — über die vorhandenen Kommandos.
4. **Nächsten Tick einplanen**, mit frisch gezogener Wartezeit.

Schritt 4 ist der wichtigste: Die Kette hält sich selbst am Leben und liegt in der
`events`-Tabelle. Sie überlebt damit Serverneustarts, respektiert Pause automatisch (der
Scheduler entwaffnet den Timer bei angehaltener Uhr) und braucht keinen eigenen Zustand.

Gestartet wird die Kette in `mapgen.ts`, mit einem **zufälligen Versatz** je Dorf. Ohne den
würden alle 80 Dörfer im selben Moment ticken und danach in Schwärmen weiterlaufen.

### Entscheidung: pure, gefiltert, gewichtet

`packages/server/src/ai/decide/barbarian.ts` — eine pure Funktion
`(snapshot, rng) → BarbarianAction`. Kein Datenbankzugriff, keine Uhr. Getestet wird sie
mit einem Snapshot als Literal.

Kandidaten werden **vorher gefiltert** — mit den Regeln aus `shared`, die auch der Spieler
durchläuft: `canAfford`, `requirementsMet`, `farmCapacity`, `BUILDINGS[type].maxLevel`.
Nicht per try/catch aussieben: Wenn nur bezahlbare Aktionen herauskommen, ist ein
`GameError` aus einem Barbaren-Tick ein **echter Fehler** und keine Alltagsmeldung. Sonst
gewöhnt man sich an rote Logzeilen und übersieht die eine, die zählt.

Gewichte über die verbleibenden Kandidaten:

| Aktion | Gewicht | Bedingung |
|---|---|---|
| Holzfäller / Lehmgrube / Eisenmine | hoch | unter Deckel |
| Speicher | hoch, sobald er der Engpass ist | Vorrat oft am Anschlag |
| Bauernhof | hoch, sobald die Bevölkerung klemmt | `popInUse` nahe `farmCapacity` |
| Hauptgebäude | mittel | — |
| Kaserne | niedrig | HQ ≥ 3 |
| Wall | niedrig | Kaserne ≥ 1 |
| Truppen (`spear`/`sword`) | mittel | Kaserne ≥ 1 |
| nichts tun | Rest | — |

Kein Stall, kein Adelshof: Ein Barbarendorf stellt keine Kavallerie auf und bekommt nie
einen Adligen. Truppen laufen über `recruitUnits` aus `engine/military.ts` — mit Kosten,
Bauernhof-Limit und Warteschlange. Barbaren starten mit `barracks: 0` und
`headquarters: 1` (`shared/src/index.ts`), müssen sich die Kaserne also erst verdienen.

### Punktedeckel

Ab `points >= settings.barbarianMaxPoints` (Vorgabe **1500**) wird nicht mehr gebaut. Der
Tick läuft weiter, aber seltener, und nur noch Rekrutierung ist möglich — sonst würde ein
ausgewachsenes Dorf mit der Zeit zum wehrlosen Ziel.

Zur Einordnung der Zahl, gerechnet mit `villagePoints`: 1500 Punkte entsprechen grob
Rohstoffgebäuden um Stufe 20 und HQ/Speicher/Bauernhof um Stufe 15. Das ist ein
ausgewachsenes Dorf — ein lohnendes Eroberungsziel, kein Selbstbedienungsladen.

### Neue Welteinstellungen

In `WorldSettings` (`shared/src/types.ts`) und `WorldSettingsSchema`
(`shared/src/schema/world.ts`):

| Feld | Vorgabe | Bedeutung |
|---|---|---|
| `barbarianMaxPoints` | 1500 | Deckel, ab dem nicht mehr gebaut wird |
| `barbarianAttemptsPerGameHour` | 1.0 | mittlere Versuchsrate (0 = Barbaren bleiben statisch) |

Beide **validiert**, mit Ober- und Untergrenze. Der Befund aus Plan 08 war genau hier:
`{"speed":"schnell"}` lief ungeprüft bis in `buildTime()` und schrieb NaN-Zeitstempel in
die Datenbank. Eine unvalidierte Rate von 0 oder NaN würde hier zu einer Wartezeit von
`Infinity` oder `NaN` — im ersten Fall stehen die Barbaren still, im zweiten friert der
Scheduler auf einem kaputten Zeitstempel ein.

`barbarianAttemptsPerGameHour: 0` bleibt ausdrücklich erlaubt und bedeutet „keine Ticks
einplanen" — das ist der Rückweg zum heutigen Verhalten und macht Vergleichsmessungen
möglich.

### Ein Befund, der bei der Planung aufgefallen ist

`world.ts:512` ruft nach **jedem** Event `this.persist()` auf — ein Schreibvorgang in
`worlds.sqlite`. Bei rund vier Barbaren-Events pro Sekunde (und später zusätzlich
Bot-Ticks) wird das zum häufigsten Schreibzugriff im ganzen Spiel, obwohl der
`WorldManager` ohnehin alle 15 Sekunden persistiert und ein Absturz höchstens diese 15
Sekunden Spielzeit kostet.

Der Plan **misst** das zuerst (Schreibvorgänge pro Sekunde vorher/nachher) und macht das
Persistieren nur dann für KI-Events bedingt, wenn es messbar ins Gewicht fällt. Vermutungen
über Leistung werden hier nicht umgesetzt, sondern geprüft.

---

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/schema/events.ts` | `barbarian_tick` in `EVENT_SCHEMAS` |
| `shared/src/types.ts` · `schema/world.ts` | zwei neue Einstellungen, validiert |
| `shared/src/logic/rng.ts` | `exponentialWait(rng, ratePerHour)` |
| `server/src/ai/decide/barbarian.ts` | **neu** — pure Entscheidung |
| `server/src/ai/barbarian.ts` | **neu** — Tick-Handler (Wahrnehmung + Ausführung) |
| `server/src/engine/world.ts` | Zweig in `handleEvent` |
| `server/src/engine/mapgen.ts` | erste Ticks mit Versatz einplanen |
| `client/src/features/lobby/*` · `i18n/de.ts` | die zwei Einstellungen bei „Welt erstellen" |

Keine neuen Tabellen und keine neuen Spalten — deshalb auch keine Migration. Barbarendörfer
sind Zeilen in `villages` mit `player_id IS NULL`; das bleibt so.

---

## Verifikation

- **Verteilung, ohne Datenbank:** 10 000 gezogene Wartezeiten haben den erwarteten
  Mittelwert (±3 %); derselbe Seed liefert dieselbe Folge (Determinismus ist die Grundlage
  reproduzierbarer Spielstände). Rate 0 plant keinen Tick ein, statt `Infinity`
  zurückzugeben.
- **Entscheidung, ohne Datenbank:** leerer Speicher → keine Aktion; Deckel erreicht → kein
  Bau, aber Rekrutierung; Bevölkerung am Anschlag → Bauernhof statt Kaserne; ohne Kaserne
  → keine Truppen; **niemals** Stall, Adelshof oder ein Angriff.
- **Engine-Test:** Welt mit 20 Barbaren über eine simulierte Spielwoche. Alle wachsen,
  keiner überschreitet den Deckel, und in `movements` steht **kein einziges** `attack` mit
  barbarischem Ursprung.
- **Last gemessen, nicht geschätzt:** Events pro Sekunde, Schreibvorgänge pro Sekunde und
  Event-Loop-Latenz aus `/api/health` — vorher, nachher, und hier festgehalten.
- **Im Browser:** Ein Barbarendorf auf der Karte anklicken, Welt laufen lassen, Punkte
  steigen sichtbar. Pause hält das Wachstum an; nach dem Fortsetzen läuft es weiter, ohne
  die Pausenzeit nachzuholen.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
