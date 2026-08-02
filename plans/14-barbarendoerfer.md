# Plan 14: Barbarendörfer — zufälliges Wachstum ohne Tick

**Status:** ✅ erledigt (2026-08-02) · **Voraussetzung:** keine (unabhängig von 15–17)

> **Ergebnis:** Barbarendörfer wachsen und bewaffnen sich. Eine Kette aus
> `barbarian_tick`-Events je Dorf plant sich nach jeder Handlung selbst neu, die
> Entscheidung ist eine pure Funktion ohne Datenbankzugriff, und Truppen entstehen über
> `recruitUnits` — dieselbe Funktion, die auch der Spieler benutzt.
>
> **Gemessen** (80 Dörfer, Speed 200, Basisrate 1/h): **2,1 Events pro Sekunde**, Punkte von
> 4773 auf 25439 in einer Echtzeitstunde, Rechenaufwand 3,9 s für diese Stunde (0,1 % der
> Wanduhr). **18 Server-Tests und 7 Verteilungstests**; im Browser **7 von 7 Prüfungen**:
> Voreinstellung greift, Dörfer wachsen sichtbar (4591 → 5449 Punkte in 40 s), Pause hält
> das Wachstum an, nach dem Fortsetzen wird nichts nachgeholt, Event-Loop-p99 bei 11,1 ms
> ohne Rückstand.
>
> **Der wichtigste Befund — die Planung hatte die Zeitrechnung falsch:** Dieses Dokument
> nahm ursprünglich an, dass `speed` die Uhr beschleunigt („bei Speed 200 vergeht eine
> Spielstunde in 18 echten Sekunden"). Das stimmt nicht. Die Spielzeit läuft **1:1 mit der
> Echtzeit** (`engine/clock.ts`); `speed` skaliert Produktion und Bauzeiten, nicht die Uhr.
> Aufgefallen ist es erst am laufenden Server: 60 Sekunden zusehen, null Wachstum. Die Rate
> wird deshalb jetzt ausdrücklich mit `settings.speed` multipliziert — genauso wie
> `resourceRatePerHour` es tut. Ohne diese Skalierung stünden Barbaren in einer 500x-Welt
> relativ zu allem anderen still. Die Einstellung heißt entsprechend
> `barbarianAttemptsPerHour` (Basisrate bei Weltgeschwindigkeit 1), nicht
> `…PerGameHour`.
>
> **Der `persist()`-Verdacht wurde gemessen und verworfen.** Ja, nach jedem Event wird in
> `worlds.sqlite` geschrieben — 2,1-mal pro Sekunde statt der 0,067, die der 15-Sekunden-
> Timer bräuchte. Der Aufwand dafür sind aber nur **4,7 % der Rechenzeit** (1733 ms → 1651 ms
> ohne persist), und diese Rechenzeit ist selbst 0,1 % der Wanduhr. Damit ist der Code
> unverändert geblieben: Der Plan verlangte eine Änderung nur, *falls* die Last ins Gewicht
> fällt.
>
> **Zwei Fallen, die beim Bauen aufgefallen sind:**
> - `startBarbarianTicks` musste **idempotent** werden. Ohne die Prüfung auf bereits
>   laufende Ketten hätte jedes Öffnen einer Welt die Zahl der Events verdoppelt — nach ein
>   paar Neustarts hätte ein Barbarendorf im Sekundentakt gebaut. Ein Test hält das fest.
> - `WorldSettingsSchema` hätte bestehende Spielstände unlesbar gemacht, weil deren
>   `settings_json` die neuen Felder nicht kennt. Mit `.default()` öffnen sie sich weiter
>   und bekommen die Vorgabewerte; verifiziert am echten Spielstand aus `data/`, der
>   prompt 80 Ketten nachgerüstet bekam.
>
> **Abweichung von der Planung:** Statt zweier Zahlenfelder in der Lobby gibt es eine
> Voreinstellung (statisch / träge / lebhaft) — die Lobby arbeitet durchgehend mit
> Voreinstellungen statt Rohwerten, und `barbarianMaxPoints` bleibt eine Stellschraube auf
> Einstellungsebene.
>
> **Nebenbefund:** Bestehende Server-Tests mussten Barbaren stillstellen
> (`barbarianAttemptsPerHour: 0`). Sonst hätten tickende Dörfer ihre Ereigniszahlen
> unvorhersehbar gemacht — ein Test zur Warteschlange erwartete zu Recht eine leere Queue.

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

### Die Rate skaliert mit der Weltgeschwindigkeit

Hier lag der Fehler der ersten Planung, deshalb steht die Richtigstellung ausführlich da.

**Die Spielzeit läuft 1:1 mit der Echtzeit.** `engine/clock.ts` sagt es deutlich:
*„Game time advances 1:1 with wall time while running (world speed scales
durations/production, not the clock rate)."* Eine Spielstunde ist eine echte Stunde. Was
`speed` beschleunigt, sind Produktion (`resourceRatePerHour` multipliziert damit) und
Bauzeiten (`buildTime` dividiert damit) — nicht die Uhr.

Daraus folgt: Eine feste Rate „x Versuche pro Stunde" wäre **unabhängig von der
Weltgeschwindigkeit**. In einer 500x-Welt, in der ein Gebäude in Sekunden fertig wird,
würde ein Barbarendorf genauso träge handeln wie in einer 1x-Welt — es stünde relativ zu
allem anderen still. Die Rate wird deshalb wie die Produktion behandelt:

```
wirksame Rate = barbarianAttemptsPerHour × settings.speed
```

`barbarianAttemptsPerHour` ist damit eine **Basisrate bei Weltgeschwindigkeit 1**, genau wie
`baseTimeS` bei Gebäuden und `recruitTimeS` bei Einheiten.

Mit dieser Skalierung stimmen auch die Größenordnungen:

| Basisrate | Wirksam bei Speed 200 | Events/s bei 80 Dörfern |
|---|---|---|
| 1 % pro Sekunde (= 36/h Basis) | 7200/h je Dorf | **160** |
| 1 pro Stunde (Vorgabe) | 200/h je Dorf | **4,4** rechnerisch · **2,1** gemessen |

Der gemessene Wert liegt unter dem rechnerischen, weil ein Dorf mit laufendem Bauvorhaben
keinen neuen Bau anstößt und über dem Punktedeckel seltener tickt.

160 Events pro Sekunde wären nicht unbedingt zu langsam, aber sie wären reine
Verschwendung: Der weitaus größte Teil dieser Versuche würde ohnehin an fehlenden
Rohstoffen scheitern. Die Wirtschaft ist bereits die eigentliche Bremse — der Zufall soll
nur dafür sorgen, dass Barbaren **nicht** sofort bauen, sobald sie könnten.

Vorgabe deshalb: **Basisrate 1**, einstellbar über `WorldSettings` und in der Lobby als
statisch (0) / träge (1) / lebhaft (3).

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
| `barbarianAttemptsPerHour` | 1.0 | Basisrate bei Weltgeschwindigkeit 1; wird mit `speed` multipliziert (0 = statisch) |

Beide **validiert**, mit Ober- und Untergrenze. Der Befund aus Plan 08 war genau hier:
`{"speed":"schnell"}` lief ungeprüft bis in `buildTime()` und schrieb NaN-Zeitstempel in
die Datenbank. Eine unvalidierte Rate von 0 oder NaN würde hier zu einer Wartezeit von
`Infinity` oder `NaN` — im ersten Fall stehen die Barbaren still, im zweiten friert der
Scheduler auf einem kaputten Zeitstempel ein.

`barbarianAttemptsPerHour: 0` bleibt ausdrücklich erlaubt und bedeutet „keine Ticks
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

**Ergebnis der Messung: unverändert gelassen.** 2,1 Schreibvorgänge pro Sekunde, und ihr
Anteil an der Rechenzeit sind 4,7 % (1733 ms mit, 1651 ms ohne) einer Rechenzeit, die
selbst nur 0,1 % der Wanduhr ausmacht. Eine Optimierung hätte Komplexität gekostet und
nichts gebracht.

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
| `client/src/features/lobby/CreateWorldForm.tsx` · `i18n/de.ts` | Voreinstellung statisch/träge/lebhaft |

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
