# Ticket 20-2: Barbaren-Rate bei hohem Speed

**Status:** 📋 offen · **Voraussetzung:** [19-15](../19-prototyp/19-15-lastprobe.md)

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
