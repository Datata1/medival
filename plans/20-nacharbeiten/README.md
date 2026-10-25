# Plan 20: Nacharbeiten aus dem Prototyp

**Status:** ✅ erledigt (2026-10-25) · **Voraussetzung:** [Plan 19](../19-prototyp/README.md)

Plan 19 ist abgenommen ([Lastprobe](../19-prototyp/lastprobe-ergebnis.md)). Beim Bauen
und Messen sind Punkte liegen geblieben, die in den Ergebnisblöcken der Tickets als
„nicht gebaut" oder „für den PoC" stehen. Dieser Plan arbeitet sie ab, **bevor** das
Audit durch den Nutzer und die UX-Arbeit beginnen. Es kommt nichts Neues dazu, nur
Offenes aus Plan 19.

| # | Ticket | Bereich | Herkunft | Status |
|---|---|---|---|---|
| 20-1 | [WAL-Checkpoint im eigenen Thread](20-1-checkpoint-thread.md) | server | 19-15, Stresslauf | ✅ erledigt |
| 20-2 | [Barbaren-Rate bei hohem Speed](20-2-barbaren-rate.md) | server | 19-15, Stresslauf | ✅ erledigt |
| 20-3 | [Truppen unterwegs bei Eroberung](20-3-truppen-bei-eroberung.md) | server | 19-14, Lücke Paladin | ✅ erledigt |
| 20-4 | [Weltanlage: Besiedlung & Optionen](20-4-weltanlage-optionen.md) | client + server | 19-6, 19-12, 19-14 | ✅ erledigt |
| 20-5 | [„Zuletzt erkundet" im Kartenpanel](20-5-spaehwissen-karte.md) | server + client | 19-10 | ✅ erledigt |

**Reihenfolge:** 20-1 und 20-2 zuerst, weil der Stresslauf aus 19-15 ihre Wirkung
messbar macht (dasselbe Skript, `--speed=1000 --minutes=20`). Danach sind 20-3 bis 20-5
voneinander unabhängig.

**Bewusst nicht hier:** Design und UX (eigener Plan nach dem Audit), Paladin-Waffen,
Anmeldezeitraum, Premades (PoC, siehe [Plan 19](../19-prototyp/README.md)).

Es gelten die Regeln aus Plan 19: Tests in jedem Ticket, Messwerte erst nach dem
Messen eintragen, `pnpm lint`, `typecheck`, `test`, `build` grün.
