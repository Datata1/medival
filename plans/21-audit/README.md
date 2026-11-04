# Plan 21: Audit durch den Nutzer

**Status:** 🔄 laufend · **Voraussetzung:** [Plan 20](../20-nacharbeiten/README.md)

Nach Plan 20 prüft der Nutzer das Spiel selbst. Jeder Befund steht hier mit Ursache und
Korrektur. Kleine Fehler werden direkt behoben, größere bekommen ein eigenes Ticket.
UX- und Designarbeit folgt danach als eigener Plan.

| # | Befund | Ursache | Korrektur | Status |
|---|---|---|---|---|
| A1 | Nach „Welt erschaffen" und „Beitreten" bleibt die Beitreten-Karte stehen; der zweite Klick meldet „Du spielst in dieser Welt schon mit" | `reopenWorld` lud nicht neu: `openWorld` hielt die Welt für offen, weil ein Stand da war, und dieser Stand war der von vor dem Beitreten (ohne Spieler) | `reopenWorld` schließt die Welt erst. `openWorld` verwendet einen vorhandenen Stand nur, wenn man dort mitspielt; das greift auch auf dem Weg über die Weltenliste | ✅ |
| A2 | Welten öffnen nicht („Welt konnte nicht geladen werden."), alles reagiert träge | Vier Ursachen, siehe unten: zehn Tage Stillstand bei Speed 200 wurden nachgeholt; jede Anfrage startete eine weitere Abarbeitungskette; Abschnitte von ~240 ms; der Client gab bei `catching_up` auf | Entwicklermodus: Server aus heißt Pause. Höchstens eine Kette, 20-ms-Budget, Anfragen nach 50 ms abgewiesen. Client versucht es erneut und zeigt das an | ✅ |

## A1 im Detail

**Nachgestellt:** Admin legt eine Welt an, landet auf „Du spielst in dieser Welt noch nicht
mit" und klickt „Beitreten". Der Beitritt gelingt (Dorf angelegt), die Karte bleibt.

**Tests:** `client/test/stores.test.ts`, „Audit: Beitreten nach dem Anlegen einer Welt".
Er prüft beide Wege: `reopenWorld` nach dem Beitreten und `openWorld` über die Liste.
Ohne die Korrektur scheitern beide (gegengeprüft).

**Im Browser:** Welt erschaffen → Beitreten → man steht im eigenen Dorf
(„Verwalters Dorf (485|495)"), ohne Fehlermeldung.

## A2 im Detail

**Nachgestellt** mit einer Kopie der echten Daten (`data/`). Die Welten 20–22 laufen bei
Speed 200, der Server war zehn Tage aus. Bei Welt 22 stand die Uhr auf 241 h, das älteste
offene Event lag bei 27 h. Gemessen:
- Die Welt baut 0,077 Spielstunden pro Sekunde ab, braucht also rund 47 min bis zur
  Spielbarkeit. Die Welten 20 und 21 brauchen je etwa eine Stunde.
- Jede Anfrage antwortet nach 1–3 s mit `503 catching_up`.
- Der Event-Loop liegt im Mittel bei 240 ms.

**Ursachen und Korrekturen:**

1. **Stillstand wurde nachgeholt.** Seit 19-3 läuft die Spielzeit an der Wanduhr. Auf
   einem Mehrspieler-Server ist das richtig und bleibt so. Mit `MEDIVAL_DEV=1` (`pnpm dev`)
   gilt die Zeit, in der der Server aus war, jetzt als Pause. Eine Welt läuft beim Laden
   beim ältesten offenen Event weiter, falls das vor der gespeicherten Uhr liegt
   (`resumeWhereLeft`, `engine/worldManager.ts`). Das ist unbedenklich, weil Handler mit
   der Event-Zeit rechnen. Ergebnis: Alle vier Welten öffnen in 4–23 ms.
2. **Jede Anfrage startete eine weitere Abarbeitungskette.** `catchUp` → `arm()` → Timer →
   `processDue`, neben der laufenden `setImmediate`-Kette. Nach zehn Anfragen liefen zehn
   Ketten. Die Antwortzeit stieg mit jeder Anfrage um ~40 ms (gemessen: 0,12 → 0,45 s in
   90 s). Den Fehler gab es schon vor dem Audit. Der Client fragt Bewegungen und Berichte
   regelmäßig ab und hat so laufend neue Ketten gestartet. Jetzt gibt es höchstens eine
   Fortsetzung (`Scheduler.continuation`). Mit Anfragen alle 10 s bleibt `/health` bei
   ~40 ms, der Event-Loop bei p99 20 ms.
3. **Abschnitte zu lang.** 200 Events am Stück dauerten bei ~1 ms je Bot-Tick ~240 ms. Jetzt
   gilt ein Zeitbudget von `SLICE_BUDGET_MS = 20`. Das Nachholen vor einer Anfrage hat
   50 ms statt 1 000 Events (~1 s).
4. **Der Client gab auf.** Bei `503 catching_up` stand „Welt konnte nicht geladen werden."
   Jetzt versucht `WorldStore` es alle 1,5 s erneut, und die Route zeigt
   („pendingComponent"): „Die Welt holt nach, was seit dem letzten Start passiert ist. Sie
   öffnet sich gleich von selbst …". Vorher blieb die Seite während des Wartens leer, weil
   der Router bis zum Ende des Loaders nichts zeigt.

**Tests:**
- `integration/clock.test.ts`:
  - Zehn Tage aus im Entwicklermodus: Die Uhr steht wie vorher, der Angriff kommt zu
    seiner Zeit.
  - Eine zurückliegende Welt setzt beim ältesten Event an.
  - Ohne Entwicklermodus bleibt es bei der Wanduhr.
- `scheduler.test.ts`:
  - Ein Abschnitt endet nach dem Budget.
  - Zehn `arm()`/`processDue()` während eines Rückstands halten die längste Lücke im
    Event-Loop unter 60 ms. Ohne Korrektur waren es 443 ms (gegengeprüft).
- `integration/time.test.ts`: 503 kommt in unter 500 ms, auch bei 200 000 offenen Events.
  Der Test war vorher wacklig.
- `client/test/stores.test.ts`: `WorldStore` versucht es bei `catching_up` erneut, andere
  Fehler zeigt er an.

**Nebenbei:** Ältere Tests riefen `processDue()` auf und erwarteten, dass danach alles
abgearbeitet ist. Sie benutzen jetzt `drainUntil(world.now())`, das genau dafür da ist.
