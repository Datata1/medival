# Ticket 19-2: Zeit-Engine — Konsistenz & Millisekunden

**Status:** 📋 offen · **Voraussetzung:** [19-1](19-1-integrationstest-harness.md) · **Ergänzt:** [Plan 03](../03-zeit-stabilitaet-node.md)

## Kontext

Plan 03 hat die Uhr robust gemacht. Sie ist monoton, ein fehlerhaftes Event friert die
Welt nicht ein, und Batches geben den Event-Loop wieder frei. Die Kampfauflösung rechnet
bereits mit `movement.arrivalGameTime` statt mit der Uhr. Für **einen** Spieler reicht das.
Sobald mehrere Menschen gleichzeitig in derselben Welt handeln, werden fünf Lücken sichtbar:

1. **Befehle sehen veralteten Zustand.** Ein Bau ist bei t − 5 ms fertig, der Timer hat
   aber noch nicht gefeuert (Node feuert „frühestens dann", typisch +1–16 ms). Kommt jetzt
   ein Befehl, sieht er das Gebäude auf der alten Stufe. Bei Angriffen ist das
   spielentscheidend: Ein Spieler zieht Truppen ab, „bevor" ein Angriff ankommt, der laut
   Zeitstempel schon da war.
2. **Fälligkeiten sind keine ganzen Millisekunden.** `exponentialWait`
   (`shared/src/logic/rng.ts:64`) liefert `Duration.hours(-ln(…)/rate)` ungerundet. In der
   Welt-DB steht etwa `due_game_time = 9079141.3072`. Gleichstand und Reihenfolge sind
   damit zufällig statt definiert.
3. **Reihenfolge bei Gleichstand ist Einfügereihenfolge.** `ORDER BY due, id`. In Tribal
   Wars ist das eine Regel („wer in derselben Millisekunde ankommt …"), hier ist es ein
   Nebeneffekt.
4. **Handler fragen die Uhr statt den Zeitstempel.** Fundstellen:
   `military.ts:398` (Rückkehr: `settleResources(m.targetVillageId)` ohne Zeitpunkt),
   `military.ts:79/102/288`, `trade.ts:102`, `tribes.ts:49/96/124`, alle Bot- und
   Barbaren-Ticks (`scheduleBotTick` plant ab `world.now()`). Bei Rückstand verschiebt
   sich damit die Fachlogik.
5. **Ein Event je rekrutierter Einheit.** `handleRecruitTick` (`military.ts:175`) legt für
   jede Einheit ein neues `recruit_tick` an und sendet jedes Mal `village_updated` an
   **alle** verbundenen Clients (`world.ts:184`). 500 Speere ergeben 500 Events und
   500 × (Anzahl Clients) Nachrichten. Dazu schreibt `handleEvent` nach jedem Event
   `persist()` in die Meta-DB (`world.ts:652`).

## Kernentscheidung: Genauigkeit durch Zeitstempel, nicht durch Threads

> *„Node ist single-threaded, ein Timer ist nie genau. Brauchen wir Worker für die
> Zeitvalidierung und Millisekunden?"*

**Nein.** Die Ungenauigkeit des Timers betrifft nur, **wann** ein Event verarbeitet wird,
nicht **mit welchem Zeitpunkt**. Ein Angriff mit Ankunft 12:00:00.437 wird mit
12:00:00.437 abgerechnet, auch wenn der Timer um .452 feuert. Millisekunden-Genauigkeit ist
eine Eigenschaft der Daten (ganzzahlige Zeitstempel, feste Reihenfolge), keine Eigenschaft
des Timers.

Die echte Lücke ist Punkt 1. Sie wird nicht mit mehr Threads geschlossen, sondern mit einer
Regel:

> **Vor jedem Befehl und jedem Lesezugriff werden synchron alle Events bis `now` nachgeholt.**

Danach ist es gleichgültig, ob der Timer pünktlich war. Der Zustand, den ein Befehl sieht,
ist immer „alles bis jetzt ist geschehen". Weil better-sqlite3 synchron ist und Node einen
Thread hat, kann zwischen Nachholen und Befehl nichts dazwischenkommen.

Worker würden das **erschweren**. SQLite erlaubt nur einen Schreiber, und eine Welt verteilt
auf mehrere Threads bräuchte eine eigene Synchronisation der Reihenfolge, also genau das
Problem, das heute nicht existiert. Der Plan-03-Pfad „ein Worker pro Welt" bleibt richtig,
löst aber ein anderes Problem (Simulation blockiert die API). Darüber entscheidet die
Lastprobe in 19-15.

## Umsetzung

### Nachholen vor jedem Zugriff

```ts
// World
command<T>(fn: (now: GameTime) => T): T {
    const now = this.now();
    this.scheduler.drainUntil(now);   // aus 19-1
    return this.sqlite.transaction(() => fn(now))();
}
query<T>(fn: (now: GameTime) => T): T  // dasselbe ohne Transaktion
```

Alle öffentlichen Kommandos (`upgradeBuilding`, `recruitUnits`, `sendUnits`,
`sendResources`, Stammes-Aktionen) und alle lesenden Routen laufen darüber.
`execute.ts` (Bots) ebenfalls. Bots haben keinen Sonderweg. `drainUntil` innerhalb eines
Handlers ist ein No-op (Reentranz-Flag), damit ein Kommando aus einem Handler heraus nicht
rekursiv nachholt.

**Begrenzung:** Steht ein großer Rückstand an (Neustart nach Stunden), holt `command` nicht
alles synchron nach. Die Welt meldet `catching_up` (HTTP 503 mit `Retry-After`), bis der
Batch-Catch-up aus Plan 03 aufgeschlossen hat. Schwelle: Rückstand > 1 s.

### Ganze Millisekunden und feste Reihenfolge

- `GameTime.add` / `GameTime.of` runden auf ganze ms (`Math.round`) in `shared/src/time.ts`.
  Ein Unit-Test sichert: Kein `GameTime` hat Nachkommastellen.
- Migration: `UPDATE events SET due_game_time = ROUND(due_game_time)`.
- Neue Spalte `events.priority INTEGER NOT NULL DEFAULT 50` und Index
  `(due_game_time, priority, id)`. Feste Priorität je Typ, zentral in `scheduler.ts`:

| Priorität | Event | Begründung |
|---|---|---|
| 10 | `build_complete`, `recruit_done` | Was fertig ist, steht der nächsten Ankunft zur Verfügung |
| 20 | `arrival` (support, return, trade) | Verstärkung vor Angriff derselben ms |
| 30 | `arrival` (attack) | Angriffe nach Unterstützung; untereinander nach `id` = Absendereihenfolge |
| 90 | `bot_tick`, `barbarian_tick` | Entscheidungen sehen das Ergebnis aller Ankünfte derselben ms |

### Handler bekommen den Zeitpunkt

`handler(event)` → `handler(event, at: GameTime)` mit `at = event.dueGameTime`. Alle
Fundstellen aus dem Kontext reichen `at` weiter. `scheduleBotTick` und
`scheduleBarbarianTick` planen ab `at`. Eine Lint-Regel ist nicht nötig, der
Szenario-Test „Rückstand von 10 min" (siehe Verifikation) deckt Rückfälle auf.

### Rekrutierung beim Zugriff ausrechnen

Wie `settleResources`: `settleRecruits(villageId, at)` rechnet
`fertig = floor((at − startedAt) / perUnitMs)`, schreibt die Einheiten gut und kürzt den
Auftrag. Aufgerufen wird es in `getUnits`, `popInUse`, vor `sendUnits` und im Kampf (für
das Verteidigerdorf zum Ankunftszeitpunkt). Pro Auftrag gibt es **ein** Event
`recruit_done` zum Ende, das den nächsten Auftrag derselben Gebäudeschleife startet.
`recruit_queue.next_unit_done_at` wird zu `started_at`. Die Migration rechnet laufende
Aufträge um. Das alte `recruit_tick` wird beim Laden in `recruit_done` übersetzt.

### Weniger Schreiben, gezielteres Senden

- `persist()` fällt aus `handleEvent` heraus. Es bleibt im 15-s-Intervall des
  `WorldManager` und bei `pause`/`close`. Nach einem Absturz gehen höchstens 15 s
  Uhrstand verloren. Das ist unkritisch, weil die Events in der Welt-DB liegen und die
  Uhr in 19-3 ohnehin an die Wanduhr gebunden wird.
- `broadcast` wird gebündelt: Nachrichten eines Event-Batches werden je `villageId`
  dedupliziert und am Ende des Batches gesendet. Die Filterung nach Spieler folgt in 19-9.

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/engine/scheduler.ts` | Priorität, `drainUntil`-Reentranz, `at` an Handler |
| `server/src/engine/world.ts` | `command`/`query`, `persist` raus aus `handleEvent`, Broadcast-Bündelung |
| `server/src/engine/military.ts` | `settleRecruits`, `recruit_done`, `at` statt `now()` |
| `server/src/engine/trade.ts` · `tribes.ts` | `at` statt `now()` |
| `server/src/ai/bot.ts` · `barbarian.ts` | Neuplanung ab `at` |
| `server/src/api/routes.ts` | alle Routen über `command`/`query`; `catching_up` → 503 |
| `server/src/engine/worldManager.ts` | Migrationen (ms runden, `priority`, `recruit_queue`) |
| `server/src/db/ddl.ts` · `schema.ts` | `events.priority`, Index, `recruit_queue.started_at` |
| `shared/src/time.ts` | Rundung auf ganze ms |
| `shared/src/schema/events.ts` | `recruit_done` |

## Verifikation

Alle Szenarien über den Harness aus 19-1:

- **Nachholen:** Bau fertig bei t, Uhr auf t + 5 ms ohne `drainUntil`, dann
  `upgradeBuilding` → der Befehl sieht die neue Stufe.
- **Gleichstand:** Unterstützung und Angriff mit identischer Ankunfts-ms → die
  Unterstützung kämpft mit. Zwei Angriffe derselben ms → Reihenfolge = Absendereihenfolge,
  über 100 Seeds stabil.
- **Ganze ms:** Nach einer simulierten Spielwoche hat kein `events.due_game_time`
  Nachkommastellen.
- **Rückstand:** Welt mit Bots 10 min ohne Verarbeitung, danach `drainUntil(now)` → identischer
  Endzustand wie eine Welt, die pünktlich verarbeitet wurde (gleicher Seed, Vergleich der
  Dorf-, Truppen- und Gebäudetabellen).
- **Rekrutierung:** 10 000 Speere → genau 1 Event. Nach der halben Bauzeit liefert
  `getUnits` die Hälfte (±1), und ein Angriff zu diesem Zeitpunkt trifft genau diese
  Verteidiger.
- **Migration:** eine alte Welt-DB aus `data/` (Kopie) öffnen → läuft weiter, keine
  verwaisten `recruit_tick`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
