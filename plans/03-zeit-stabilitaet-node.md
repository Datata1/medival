# Plan 03: Zeit-Korrektheit & Stabilität der Node-Engine

**Status:** ✅ erledigt (2026-08-01) · **Nutzer-Punkt:** 7 (Recherche + Härtung)

> Umsetzungsnotizen: Uhr auf `performance.now()` (clock.ts); Scheduler mit
> try/catch pro Event + injizierbarem Error-Callback (World loggt mit Welt-ID),
> Batch = 200 Events mit `setImmediate`-Fortsetzung, `arm()` im finally-Pfad;
> `EngineHealth` (engine/health.ts) mit `monitorEventLoopDelay` + Backlog-Metrik,
> Check alle 15 s im WorldManager, Ausgabe über `GET /api/health` (live getestet).
> 3 neue Scheduler-Tests inkl. Poison-Event und 10k-Event-Sturm.

## Rechercheergebnis: Wie stabil ist unser Zeitsystem wirklich?

**Die Kernfrage** war: Node ist single-threaded — kippt das Zeittracking, wenn viele Events
anfallen?

**Antwort: Das Design ist strukturell robust, mit vier konkreten Schwachstellen.**

Entscheidend ist, dass wir Spielzeit **aus der Uhr ableiten** (`GameClock.now()` =
akkumulierte Zeit + Wanduhr-Delta) statt sie durch Ticks zu **akkumulieren**. Die bekannten
Node-Probleme — `setTimeout` feuert nur „frühestens dann" (typisch +1–16 ms, bei blockiertem
Event-Loop beliebig später) — verschieben bei uns daher nur die *Verarbeitung*, nie die
*Spielzeit*: Ein verspätet verarbeitetes Event rechnet trotzdem mit seinem korrekten
Spielzeit-Stempel (`dueGameTime`; seit M2 nutzt die Kampfauflösung explizit
`movement.arrivalGameTime` als Battle-Zeit). Ein „100 % framegenauer" Tick-Loop
(setTimeout+setImmediate-Hybrid wie in node-game-loop) ist für uns unnötig — wir haben
keinen festen Tick.

**Die tatsächlichen Schwachstellen:**

1. **`Date.now()` ist nicht monoton.** NTP-Korrekturen oder manuelle Systemzeit-Änderungen
   springen — `GameClock` würde Spielzeit verlieren oder erfinden (inkl. negativer Deltas).
   → `performance.now()` (monotone Uhr) für das Laufzeit-Delta verwenden.
2. **Scheduler-Deadlock bei Handler-Exception (echter Bug).** In
   `packages/server/src/engine/scheduler.ts` läuft `processDue()` durch
   `try { … } finally { processing = false }` und ruft **danach** `arm()` auf. Wirft ein
   Handler, propagiert die Exception nach dem `finally` — `arm()` wird nie erreicht, der
   Timer bleibt tot, die Welt friert bis zum nächsten `insert()` ein.
   → try/catch **pro Event**, Fehler loggen, weiterverarbeiten; `arm()` garantiert erreichen.
3. **Event-Stürme blockieren den Event-Loop.** `processDue()` verarbeitet unbegrenzt viele
   fällige Events synchron (better-sqlite3 ist synchron). Beim Catch-up nach langer Pause
   oder mit hunderten Bots (M3!) blockiert das HTTP/WS für die gesamte Dauer.
   → Batch-Verarbeitung (z. B. 200 Events), dann `setImmediate`-Yield und Fortsetzung —
   I/O kommt zwischen den Batches dran, die Reihenfolge bleibt strikt gewahrt.
4. **Keine Beobachtbarkeit.** Ob der Loop hinterherhinkt, sieht man derzeit nicht.
   → `monitorEventLoopDelay` (`perf_hooks`) + Rückstands-Metrik (jetzt − ältestes fälliges
   Event) mit Warn-Log.

**Worker-Threads?** Ja, aber als vorbereiteter Pfad, nicht jetzt (mit Nutzer entschieden):
Jede Welt ist bereits perfekt isoliert (eigene SQLite-Datei, `World` als einzige
Schnittstelle) — das ist die ideale Zuschnittgrenze für **einen `worker_thread` pro Welt**:
Main-Thread = Fastify + WS-Routing, Worker = World-Simulation; Commands/Queries als
Request/Response über `postMessage`, Broadcasts als Push zurück. Kein SharedArrayBuffer
nötig (kein geteilter Zustand). Damit blockiert Simulation nie mehr die API und der
Worker-Event-Loop tickt unabhängig weiter, selbst wenn Main beschäftigt ist.
**Trigger-Kriterium:** M3-Profiling zeigt Event-Loop-Lag p99 > 50 ms oder Event-Rückstand
> 1 s im Normalbetrieb.

Quellen:
- [node-game-loop (timetocode)](https://github.com/timetocode/node-game-loop) — setTimeout-Genauigkeit & Hybrid-Loop
- [Node.js worker_threads Doku](https://nodejs.org/api/worker_threads.html)
- [Inngest: Node.js worker threads in Produktion](https://www.inngest.com/blog/node-worker-threads) — unabhängiger Worker-Event-Loop
- [react/Node Event-Loop-Verhalten von setTimeout](https://dev.to/mrrishimeena/settimeout-is-not-the-same-as-you-think-44ep)

## Schritte

1. **Monotone Uhr:** `packages/server/src/engine/clock.ts` — `runningSince`/Deltas auf
   `performance.now()` umstellen (Import aus `node:perf_hooks`). Semantik unverändert;
   `Date.now()` verschwindet aus der Engine (bleibt ok für `created_at`-Metadaten).
2. **Fehlerisolation:** `scheduler.ts` — Handler-Aufruf in try/catch pro Event; Fehler mit
   Event-Typ/Payload loggen (Logger-Injection oder `console.error` mit Welt-Kontext);
   `arm()` in `finally`-Semantik garantieren. Poison-Event wird gelöscht (ist es schon,
   Delete passiert vor dem Handler) und blockiert nichts mehr.
3. **Batch-Yield:** `processDue()` — nach N=200 Events `setImmediate(() => this.processDue())`
   planen und zurückkehren. `processing`-Flag beibehalten (Reentranz-Schutz).
4. **Metriken:** kleines Modul `packages/server/src/engine/health.ts` —
   `monitorEventLoopDelay` starten; im `WorldManager`-Persist-Intervall (15 s) prüfen:
   Loop-Delay p99 und pro laufender Welt `now − minDueGameTime`; Warn-Log über Schwellwerten.
   Werte zusätzlich über `GET /api/health` ausgeben (fürs M3-Profiling).
5. **Worker-Pfad dokumentieren:** Abschnitt oben ist die Doku; zusätzlich in `world.ts`
   einen kurzen Verweis-Kommentar an der Klassendefinition (Schnittstellen-Grenze für
   künftige Worker-Isolation).

## Verifikation

- Neuer Test: Handler wirft → Scheduler verarbeitet nachfolgende Events trotzdem
  (Welt friert nicht ein).
- Neuer Test: 10.000 gleichzeitig fällige Events → alle verarbeitet, Reihenfolge korrekt
  (Batch-Fortsetzung terminiert); mit Fake-Yield synchron testbar via wiederholtem `processDue()`.
- Bestehende Tests grün; manuell: Welt pausieren, Systemzeit-Simulation ist nicht nötig —
  `performance.now()`-Umbau ist durch bestehende Clock-Tests abgedeckt.
- `GET /api/health` liefert Loop-Delay und Event-Rückstand.
