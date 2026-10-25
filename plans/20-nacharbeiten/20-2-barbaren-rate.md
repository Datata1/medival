# Ticket 20-2: Barbaren-Rate bei hohem Speed

**Status:** ✅ erledigt (2026-10-25) · **Voraussetzung:** [19-15](../19-prototyp/19-15-lastprobe.md)

> **Ergebnis:** `barbarianTickPlan` (`ai/barbarian.ts`) deckelt die Rate je Dorf auf
> `BARBARIAN_MAX_TICKS_PER_HOUR = 720` (höchstens alle 5 s). Liegt die gewünschte Rate
> darüber, handelt ein Tick mehrfach (`ceil(gewünscht / 720)`, höchstens 20 Handlungen),
> und die Rate sinkt entsprechend. Das Mittel der Handlungen je Stunde bleibt damit
> gleich. Jede Handlung würfelt für sich und sieht den Stand nach der vorigen. Unter dem
> Deckel (Speed 10: 10 Ticks je Stunde) ändert sich nichts.
>
> **Der Deckel ist gemessen, nicht gesetzt.** Bei hohem Speed läuft das Lager eines
> Barbarendorfs zwischen zwei Ticks über, und mehrere Handlungen je Tick holen verlorene
> Produktion nicht zurück. Gemessen bei Speed 1000 mit 40 Dörfern, 6 Spielminuten, Mittel
> über drei Seeds:
>
> | Deckel je Dorf und Stunde | Barbaren-Events | Punktezuwachs |
> |---|---|---|
> | ohne (vorher) | 4 050 | 9 600 |
> | 120 | 450 | 2 400 (25 %) |
> | 360 | 1 375 | 7 400 (77 %) |
> | **720** | **2 070** | **9 100 (96 %)** |
>
> **Ein Fehler im ersten Entwurf:** Der Tick endete beim ersten `idle`. Die Barbaren wuchsen
> dadurch um rund 1 000 statt 9 600 Punkte. Seitdem würfelt jede Handlung unabhängig, wie
> es N einzelne Ticks getan hätten.
>
> **Stresslauf** (Speed 1000, 20 min, gleiche Welt wie in 20-1):
>
> | | vorher | nachher |
> |---|---|---|
> | Barbaren-Ticks je s | 532 | 266 |
> | Dauer je Barbaren-Tick p50 | 0,25 ms | 0,59 ms |
> | CPU im Mittel | 44 % | 42 % |
> | Event-Loop p99 | 6,5 ms | 6,2 ms |
>
> Die Events halbieren sich, die CPU sinkt aber kaum: Die Arbeit (Entscheiden, Bauen,
> Rekrutieren) bleibt dieselbe, nur auf halb so viele Ticks verteilt. Gespart werden
> Scheduler-Arbeit und Zeilen in `events`, nicht Rechenzeit.
>
> **Tests:** `test/integration/barbarian-rate.test.ts` prüft `barbarianTickPlan` (unter
> dem Deckel unverändert, darüber aufgeteilt, höchstens 20 Handlungen) und eine Welt bei
> Speed 1000. Dort fallen weniger als 2 500 statt 4 005 Ticks an, bei mindestens 90 %
> des Wachstums ohne Deckel.
>
> **Abweichung:** Der Deckel liegt bei 720 statt der geplanten 60, siehe Messung.

## Kontext

Ein Barbarendorf handelt im Mittel `barbarianAttemptsPerHour × speed` Mal je
Spielstunde (Plan 14). Bei 2 000 Barbaren und Speed 1000 sind das 531 Events/s, fast zwei
Drittel aller Events im Stresslauf. Jedes Event tut höchstens **eine** Handlung, auch wenn
das Dorf genug Rohstoffe für mehrere hätte.

## Kernentscheidung: Rate deckeln, Handlungen je Tick zulassen

- Die Rate je Dorf wird auf `BARBARIAN_MAX_TICKS_PER_HOUR` gedeckelt (60 je Spielstunde
  Wanduhr, also höchstens einer je Minute).
- Ist die gewünschte Rate höher, macht ein Tick so viele Handlungen, wie dem Verhältnis
  entspricht (`ceil(gewünscht / gedeckelt)`, höchstens 20). Das Wachstum der Barbaren
  bleibt damit im Mittel gleich, nur die Zahl der Events sinkt.
- `decideBarbarianAction` bleibt pur und unverändert. Die Schleife sitzt in
  `handleBarbarianTick`.

## Verifikation

- Pur/Harness: Bei Speed 10 ändert sich nichts. Die Zahl der Barbaren-Events in einer
  Spielstunde ist gleich wie vorher (gleicher Seed).
- Bei Speed 1000: Events je Dorf und Stunde ≤ 60, Punkte der Barbaren nach einer
  Spielwoche im Rahmen wie vorher (Messwert vorher/nachher im Test).
- Stresslauf: Events/s und CPU vorher/nachher im Bericht.
