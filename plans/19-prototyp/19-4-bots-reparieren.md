# Ticket 19-4: Bots reparieren

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** [19-1](19-1-integrationstest-harness.md) (19-2 entgegen der Planung *nicht*, siehe unten)

> **Ergebnis:** Bots schlafen nicht mehr und liefern nicht mehr im Sekundentakt. Gemessen
> über den Harness (Seed 555, zehn Bots, zwei echte Spielwochen): **8 840 Bot-Punkte gegen
> 1 187 bei Barbaren, Faktor 7,4** (der alte Test maß 2,3). Speicher im Schnitt 4,8,
> Bauernhof 3,8 (vorher in jeder echten Welt 1–2). Die Persönlichkeiten unterscheiden sich:
> Wall turtle 15,5 / raider 7,7, Hauptgebäude expander 14,0 / turtle 4,0.
>
> **Am echten Server**, dieselbe Welt (Speed 200, 20 Bots, Seed 24680) je 90 s: `main`
> 26,6 Punkte im Schnitt (praktisch kein Wachstum ab Start ~26), dieser Stand 41,9;
> keine abgewiesenen Intents, Event-Rückstand 0.
>
> **Umgesetzt:** `queueFreeAt` im Snapshot und in `planBot`; Denkintervalle in Spielzeit
> (`maxThinkInterval(speed)`, 2 Spielstunden, mindestens 10 s); `wakeBot` mit
> `Scheduler.pullForward` bei `build_complete`, abgeschicktem Angriff (Ziel) und jeder
> Ankunft (beide Seiten); Mindestlieferung (`minShipment`) und höchstens eine Lieferung
> gleichzeitig je Partner; Speicher-Horizont (3 Spielstunden) und Bauernhof-Prognose ab
> Kaserne. Nur Bau und Rekrutierung verkürzen den nächsten Tick.
>
> **Die drei Wochensimulationen** laufen jetzt über den Harness in `test/integration/`
> (`bots-week`, `war-week`, `barbarians-week`) mit echten Spielwochen (`gameWeeks`).
> Die alten Tests spulten 168 *Echt*stunden vor, bei Speed 100 rund 700 Spielwochen, von
> denen sie nur einen Bruchteil abarbeiteten.
>
> **Abweichungen von der Planung:**
>
> - **Reihenfolge: 19-4 vor 19-2.** 19-2 macht die Zeit in Handlern korrekt, und damit
>   zeigten die alten Wochentests, was sie wirklich simuliert hatten: rund sechs Stunden
>   statt einer Woche. Ehrlich einmessen ließen sie sich erst ohne die Lieferschleife,
>   und 19-4 braucht 19-2 nicht, weil der Harness Uhr und Fälligkeit bereits gleichsetzt.
>   19-2 setzt jetzt auf 19-4 auf.
> - **Statt `SHIPMENT_COOLDOWN` gibt es „eine Lieferung je Partner gleichzeitig":** Die
>   Wahrnehmung sieht die Lieferung, die unterwegs ist, und braucht keinen
>   gespeicherten Zeitstempel in `BotState`.
> - **Der Speed-Unabhängigkeitstest** (Speed 1 über 48 h gegen Speed 100) ist nicht
>   gebaut. `MIN_THINK_INTERVAL` bleibt bewusst Echtzeit (2 s nach eigener Aktion), damit
>   gilt die Gleichheit nur ungefähr. Das gehört in die Lastprobe (19-15).
> - **Regressionstest Lieferungen** prüft die Regel statt einer Zahl: keine Lieferung
>   unter 200, je Partner höchstens eine unterwegs, und < 1,5 Ankünfte je Bot und
>   Spielstunde. Gemessen: 878 Ankünfte in Stunde 4 (vorher 2 485), 1 745 in Stunde 6
>   (vorher ~25 000).

## Kontext

Im Browser „tun Bots nichts". Das stimmt fast. Eine Kopie von Welt 19 (Speed 200, 151 min
Laufzeit) zeigt alle 20 Bots bei 280–310 Punkten. Bei Speed 200 entsprechen 151 min
Laufzeit ~500 Spielstunden auf Speed 1. Viele Bots haben auf den Punkt identische Werte.
Bauernhof steht überall auf **1**, Speicher auf 1–2, bei einer Produktion von 23 000–37 000
Holz pro Stunde (Lager voll nach ~2,5 min).

Ein Tick-für-Tick-Protokoll von Bot 8 zeigt die Ursache:

```
t=9088  q=0  intents=[build:clay_pit]  next=2s
t=9090  q=1  intents=[build:clay_pit]  next=2s
t=9092  q=2  intents=[]                next=600s   ← Bauten nach ~30 s fertig
t=9692  q=0  intents=[build:iron_mine] next=2s
```

**Der Fehler** (`server/src/ai/bot.ts:54-75`, `208-217`): `planBot` startet mit
`soonest = MAX_THINK_INTERVAL` (10 min). Bei voller Bauschleife liefert `decideBuild`
`null` (`decide/build.ts:212`, `QUEUE_LIMIT = 2`). Dann wird kein Intent erzeugt und
`soonest` nie verkürzt. Der Bot schläft 10 Minuten. Diese 10 Minuten sind **echte**
Minuten und skalieren nicht mit `speed`. Bei Speed 200 sind das ~33 Spielstunden Untätigkeit
nach jeweils ~6 s Arbeit.

Der Plan 15 sah vor: *„Ereignisse, die die Lage ändern, planen den Tick außerdem sofort
neu."* Das wurde nie umgesetzt. Kein `build_complete`, keine Ankunft und kein eingehender
Angriff weckt einen Bot.

**Zweiter Befund: Speicher und Bauernhof.** Die Speicherregel (`build.ts`, Schritt 2) greift
nur, wenn das nächste Wirtschaftsziel nicht ins Lager *passt*. Ein Lehmgruben-Ausbau für
700 passt in 1 000, also wird nie ein Speicher gebaut, während die Produktion stündlich
das 30-Fache des Lagers verfallen lässt. Der Bauernhof wird erst bei 85 % Auslastung
gebaut. Das ist bei reinem Gebäudeausbau korrekt, verhindert aber das Wachstum des Heeres
(19-10 ff. bringen bevölkerungsintensive Einheiten).

**Dritter Befund: Kleinstlieferungen im Sekundentakt** (gefunden beim Bau des
Harness, 19-1). `decideShipment` (`ai/decide/trade.ts`) liefert jeden Überschuss über
der Schwelle, auch wenn er nur 20 Rohstoffe beträgt. Jede ausgeführte Absicht setzt den
nächsten Tick auf `MIN_THINK_INTERVAL` (`bot.ts:204`). Das ergibt eine Schleife:
Lieferung, 2 s, Lieferung … Gemessen bei Seed 555 mit zehn Bots: ~25 000 Events in
Spielstunde 6, davon zwei Drittel Ankünfte. Erst Fehler 1 hat das im Browser verdeckt,
denn ein Bot, der zehn Minuten schläft, kann nicht im Sekundentakt liefern.

**Warum es niemand bemerkt hat:** siehe 19-1. Die Testsimulation läuft mit `now()` am
Stundenende, sodass „10 min schlafen" in jeder simulierten Stunde nur einen Tick kostet.

## Kernentscheidung: Ein Bot wacht auf, wenn sich seine Lage ändert

Statt die Obergrenze zu verkleinern (ein häufigerer Tick wäre wieder Polling), wird der
nächste Denkzeitpunkt aus **drei** Quellen bestimmt:

```
nextIn = min( Bezahlbarkeit des Sparziels,          // gibt es schon
              früheste Fertigstellung der Bauschleife, // neu
              MAX_THINK_INTERVAL / speed )            // jetzt skaliert
```

Dazu kommt das **Aufwecken bei Ereignissen**. `build_complete`, Ankunft eines Angriffs
auf ein eigenes Dorf, erhaltene Unterstützung oder Lieferung und eine Eroberung rufen
`wakeBot(world, playerId, at)` auf. Ist der nächste geplante `bot_tick` später als
`at + MIN_THINK_INTERVAL`, wird er **vorgezogen**. Es wird kein zweiter angelegt. Eine
Kette je Bot bleibt die Invariante aus Plan 15 (`startBotTicks` prüft sie).

`MIN_THINK_INTERVAL` und `MAX_THINK_INTERVAL` werden Spielzeitgrößen. Sie skalieren mit
`speed`, mit einer Untergrenze von 1 s Echtzeit, damit Speed 10 000 nicht zur
Dauerschleife wird.

## Umsetzung

### `ai/bot.ts`

- `planBot`: `soonest` zusätzlich aus `village.queueFreeAt − gameTime` für jedes Dorf
  mit voller Schleife.
- `thinkIntervals(speed)` → `{ min, max }`, rein und getestet.
- `wakeBot(world, playerId, at)`: sucht das `bot_tick`-Event des Spielers (Index auf
  `json_extract(payload_json,'$.playerId')` oder neue Spalte `events.subject_id`, die
  auch 19-5 nutzt) und setzt `due_game_time = max(at, …)` herab.

### `ai/perceive.ts`

`VillageSnapshot.queueFreeAt: GameTime | null`. Zeitpunkt, an dem die Bauschleife unter
`QUEUE_LIMIT` fällt, berechnet aus `build_queue.completes_at`.

### `ai/decide/build.ts` — Speicher und Bauernhof vorausschauend

- **Speicher**, wenn das Lager bei aktueller Produktion in weniger als
  `STORE_FILL_HORIZON` voll läuft. Der Horizont ist in **Spielzeit**, also unabhängig vom
  Speed, Startwert 3 h bei Speed 1. Zusätzlich muss die längste Bauzeit der Schleife
  länger sein. Das verhindert den Irrweg aus Plan 15 (Speicher 12 vor dem ersten
  Holzfäller): Ein Lager, das in 3 Spielstunden voll wird, ist bei Stufe 1 schnell
  ausgebaut und deckelt nicht mehr.
- **Bauernhof**, wenn `popInUse + geplanter Truppenzuwachs > 85 %`. Der Zuwachs
  kommt aus `decideRecruit`: Was der Bot im nächsten Intervall rekrutieren will, zählt
  mit.
- Beide Regeln bekommen eigene `reason`-Werte (`'store_horizon'`, `'farm_forecast'`) für
  Tests und spätere Diagnose.

### `ai/decide/trade.ts` — Mindestmenge und Abstand

- Eine Lieferung lohnt erst ab `MIN_SHIPMENT` (Startwert: ein voller Händler, 1 000
  Rohstoffe, oder der gesamte freie Händlervorrat, wenn er kleiner ist).
- Ein Bot liefert demselben Partner höchstens einmal je `SHIPMENT_COOLDOWN`
  (Spielzeit). Die letzte Lieferung je Partner steht in `BotState`.
- Allgemein gilt: Eine ausgeführte Absicht verkürzt den nächsten Tick nur, wenn sie
  die Lage für eine *weitere* Entscheidung geändert hat (Bau, Rekrutierung). Eine
  Lieferung oder ein Angriff tut das nicht.

### Aufweck-Stellen

| Ereignis | Ort | Wen wecken |
|---|---|---|
| `build_complete` | `world.ts:onBuildComplete` | Besitzer |
| Angriff abgeschickt | `military.ts:sendUnits` | Besitzer des Ziels (sieht „eingehend") und Stammesmitglieder in Reichweite |
| Ankunft (alle Arten) | `military.ts:handleArrival` | Besitzer von Ursprung und Ziel |
| Eroberung | `military.ts:resolveAttackArrival` | alter und neuer Besitzer |

`wakeBot` prüft `players.is_bot`. Für Menschen ist der Aufruf ein No-op.

### Simulationen umstellen (übernommen aus 19-1)

Die Wochen-Simulationen in `bot.test.ts`, `barbarian.test.ts` und `tribes.test.ts`
ziehen nach `test/integration/` um und laufen über `advance` aus dem Harness. Jede
Schwelle wird neu eingemessen und als Messwert im Testkommentar festgehalten.
Budget: Jede Simulation läuft in < 30 s. Wenn nötig, kürzer simulieren statt die
Ereignisdichte zu verfälschen.

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/ai/bot.ts` | `queueFreeAt` in `planBot`, `thinkIntervals`, `wakeBot` |
| `server/src/ai/perceive.ts` | `queueFreeAt` |
| `server/src/ai/decide/build.ts` | Speicher-Horizont, Bauernhof-Prognose |
| `server/src/ai/decide/recruit.ts` | geplanter Bevölkerungszuwachs als Rückgabe |
| `server/src/engine/world.ts` · `military.ts` · `trade.ts` | `wakeBot`-Aufrufe |
| `server/src/db/ddl.ts` | ggf. `events.subject_id` + Index |
| `server/test/bot.test.ts` | pure Tests für die neuen Regeln |
| `server/test/integration/bots.test.ts` | Szenarien (siehe unten) |

## Verifikation

- **Beide Regressionstests aus 19-1** (`it.fails` in
  `test/integration/harness.test.ts`) werden zu `it` und sind grün: Der Bot ist bei voller
  Schleife spätestens bei `queueFreeAt + MIN_THINK_INTERVAL` wieder aktiv, und zehn
  Bots erzeugen < 500 Ankünfte je Spielstunde.
- **Invariante „kein Leerlauf":** Über 2 Spieltage bei Speed 1 (und separat bei Speed
  200) gibt es keinen Zeitraum > `MAX_THINK_INTERVAL`, in dem ein Bot eine freie
  Bauschleife hat und sich das nächste Ziel leisten kann. Gemessen über einen Hook, der
  jeden `bot_tick` protokolliert.
- **Speed-Unabhängigkeit:** Dieselbe Welt bei Speed 1 über 48 h und bei Speed 100 über
  28,8 min Spielzeit → Bot-Punkte innerhalb von ±15 % (das ist der eigentliche Beweis,
  dass Intervalle in Spielzeit gerechnet werden).
- **Wachstum mit Messwert:** 10 Bots, 2 Spieltage Speed 1 → durchschnittliche Punkte und
  Speicher-/Bauernhofstufe im Test festhalten (Erwartung: Speicher > 5, Bauernhof > 3).
- **Aufwecken:** Angriff auf Bot-Dorf abschicken → der `bot_tick` des Ziels wird auf
  ≤ jetzt + `MIN_THINK_INTERVAL` vorgezogen, und es existiert weiterhin genau ein
  `bot_tick` je Bot.
- **Persönlichkeiten** unterscheiden sich weiterhin (bestehender Test aus Plan 15, jetzt
  über den Harness).
- **Browser:** neue Welt Speed 200, 5 min laufen lassen → Bot-Profile zeigen steigende
  Punkte und Speicher > 3.
- `pnpm lint` (inkl. `check-ai-purity`), `pnpm typecheck`, `pnpm test`,
  `pnpm test:integration`, `pnpm build` grün.
