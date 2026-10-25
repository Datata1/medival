# Ticket 20-1: WAL-Checkpoint im eigenen Thread

**Status:** ✅ erledigt (2026-10-25) · **Voraussetzung:** [19-15](../19-prototyp/19-15-lastprobe.md)

> **Ergebnis:** `CheckpointThread` (`engine/checkpointThread.ts`) und
> `engine/checkpoint-worker.mjs` schreiben alle 2 s das WAL jeder Welt in einem
> Worker-Thread mit eigener Verbindung zurück (`PASSIVE`, `fileMustExist`). Danach
> erledigt der Haupt-Thread den Rest, der während des Worker-Laufs dazukam
> (`checkpointTail`). Fällt der Worker aus, checkpointet der Haupt-Thread wie vorher im
> 15-s-Takt. `/api/health` meldet beide Dauern getrennt (`checkpoint`,
> `checkpointTail`).
>
> **Ein Fehler im ersten Entwurf:** Ohne den Rest im Haupt-Thread lief der erste
> Stresslauf voll. SQLite beginnt das WAL erst dann von vorn, wenn **alles**
> zurückgeschrieben ist. Unter Dauerlast schrieb der Haupt-Thread aber weiter, während
> der Worker arbeitete, und das WAL wuchs, bis die Platte voll war (14 GB). Seitdem
> schreibt der Haupt-Thread den Rest zurück, und der Lasttest bricht ab, wenn die Welt-DB
> über `--max-db-mb` (Standard 2 048) wächst.
>
> **Gemessen** (Stresslauf `pnpm loadtest --speed=1000 --minutes=20`, gleiche Welt wie in
> 19-15; jetzt hält er alle Grenzen):
>
> | | 19-15 (Haupt-Thread, 15 s) | 20-1 (Worker, 2 s) |
> |---|---|---|
> | HTTP p99 (Dorfansicht, Kommandos) | 536 ms | 15 ms |
> | `map/tiles` p99 | 789 ms | 17 ms |
> | Event-Loop p99 / max | 5,1 / 1 315 ms | 6,5 / 53 ms |
> | Event-Verspätung p99 / max | 344 / 761 ms | 11 / 38 ms |
> | Checkpoint im Haupt-Thread | p50 287 ms, max 711 ms | Rest: p50 7,4 ms, max 13,9 ms |
> | Checkpoint im Worker | — | p50 36 ms, max 119 ms |
> | Welt-DB am Ende | 231 MB | 19 MB |
>
> Im Kurzlauf (`pnpm loadtest:smoke`, Speed 10) hält alles weiter, mit Bot-Tick p99
> 2,8 ms.
>
> **Tests:** `test/integration/checkpoint.test.ts`:
> - Gut 20 MB WAL werden zurückgeschrieben, danach ist das WAL ≤ 16 MB und die Daten sind
>   nach dem Wiederöffnen vollständig.
> - Eine gelöschte Datei entsteht nicht neu.
> - Für dieselbe Datei läuft kein zweiter Checkpoint.
> - Eine Welt lässt sich löschen, während der Thread sie offen hat.
> - Unter Dauerlast beginnt das WAL nach Worker und Rest von vorn.
>
> **Abweichung:** Der Haupt-Thread ist nicht ganz frei, er zahlt den Rest (im Stresslauf
> p50 7 ms alle 2 s). Ohne ihn wächst das WAL unbegrenzt, siehe oben.

## Kontext

Seit 19-15 läuft der WAL-Checkpoint jeder Welt alle 15 s im Persist-Takt des
`WorldManager`, im Haupt-Thread. Im Zielszenario (Speed 10) kostet das 15 ms
(p50). Im Stresslauf (Speed 1000, ~830 Events/s) wächst das WAL in 15 s auf Hunderte
MB, und der Checkpoint blockiert den Event-Loop 287 ms (p50) bis 711 ms. Das war der
einzige Grund für die gerissenen HTTP-Grenzen (p99 0,5–0,8 s).

## Kernentscheidung: Eine zweite Verbindung in einem Worker-Thread

Im WAL-Modus darf eine **andere** Verbindung den Checkpoint ausführen, und `PASSIVE`
blockiert dabei weder Leser noch Schreiber. Ein Worker-Thread (`node:worker_threads`)
mit eigener `better-sqlite3`-Verbindung je Welt-DB übernimmt das. Der Haupt-Thread
schreibt nur noch ins WAL. Das ist weit kleiner als „Worker je Welt" (Plan 03): Die
Simulation bleibt, wo sie ist, nur das Zurückschreiben wandert aus.

- Ein Worker für alle Welten, gestartet beim ersten Bedarf, `unref`.
- Der `WorldManager` schickt im Takt `{ file }`, der Worker meldet Dauer und Ergebnis
  (`busy`, `log`, `checkpointed`) zurück, die in `totals.checkpoint` landen.
- Takt **2 s** statt 15 s: Kleinere Schübe halten das WAL klein, und der Haupt-Thread
  zahlt nichts dafür.
- Schließen/Löschen einer Welt: Der Worker schließt seine Verbindung, **bevor** die
  Datei geschlossen oder gelöscht wird.
- Fällt der Worker aus, checkpointet der Haupt-Thread wie bisher, mit Warnung im Log.

## Verifikation

- Integrationstest: Welt schreibt, Worker-Checkpoint läuft, WAL schrumpft
  (`journal_size_limit`), Daten sind nach dem Wiederöffnen vollständig.
- Welt löschen, während ein Checkpoint läuft → keine Ausnahme, Datei weg.
- Stresslauf (`pnpm loadtest --speed=1000 --minutes=20`) vorher/nachher: Event-Loop max
  und HTTP p99 im Bericht.
- Abnahmelauf (`pnpm loadtest:smoke`) unverändert grün.
