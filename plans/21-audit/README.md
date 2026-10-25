# Plan 21: Audit durch den Nutzer

**Status:** 🔄 laufend · **Voraussetzung:** [Plan 20](../20-nacharbeiten/README.md)

Nach Plan 20 prüft der Nutzer das Spiel selbst. Jeder Befund steht hier mit Ursache und
Korrektur. Kleine Fehler werden direkt behoben, größere bekommen ein eigenes Ticket.
UX- und Designarbeit folgt danach als eigener Plan.

| # | Befund | Ursache | Korrektur | Status |
|---|---|---|---|---|
| A1 | Nach „Welt erschaffen" und „Beitreten" bleibt die Beitreten-Karte stehen; der zweite Klick meldet „Du spielst in dieser Welt schon mit" | `reopenWorld` lud nicht neu: `openWorld` hielt die Welt für offen, weil ein Stand da war, und dieser Stand war der von vor dem Beitreten (ohne Spieler) | `reopenWorld` schließt die Welt erst. `openWorld` verwendet einen vorhandenen Stand nur, wenn man dort mitspielt; das greift auch auf dem Weg über die Weltenliste | ✅ |

## A1 im Detail

**Nachgestellt:** Admin legt eine Welt an, landet auf „Du spielst in dieser Welt noch nicht
mit" und klickt „Beitreten". Der Beitritt gelingt (Dorf angelegt), die Karte bleibt.

**Tests:** `client/test/stores.test.ts`, „Audit: Beitreten nach dem Anlegen einer Welt".
Er prüft beide Wege: `reopenWorld` nach dem Beitreten und `openWorld` über die Liste.
Ohne die Korrektur scheitern beide (gegengeprüft).

**Im Browser:** Welt erschaffen → Beitreten → man steht im eigenen Dorf
(„Verwalters Dorf (485|495)"), ohne Fehlermeldung.
