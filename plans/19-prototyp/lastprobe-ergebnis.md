# Lastprobe Prototyp — Ergebnis

Erzeugt von `scripts/loadtest/run.ts` (plans/19-prototyp/19-15) am 2026-10-23 14:49 UTC.

## Szenario

| Größe | Wert |
|---|---|
| Karte | 1000×1000 |
| Bots | 300 |
| Barbarendörfer | 2000 |
| Simulierte Menschen | 50 (HTTP + WebSocket) |
| Speed | 10 |
| Dauer | 60 min Messung nach 120 s Aufwärmen |
| Weltanlage | 0.4 s (nicht in den Messwerten) |
| Rechner | linux, 12th Gen Intel(R) Core(TM) i7-12700K, Node v24.12.0 |

## Abnahmegrenzen

**Ergebnis: alle Grenzen eingehalten.**

| Kennzahl | Messwert | Grenze | |
|---|---|---|---|
| Event-Loop-Latenz p99 | 1.21 ms | < 50 ms | ✅ |
| Event-Rückstand max (Health, alle 10 s) | 1.00 ms | < 1 s | ✅ |
| Event-Verspätung max (je Event) | 20.0 ms | < 1 s | ✅ |
| HTTP p99 (Dorfansicht, Kommandos) | 1.81 ms | < 100 ms | ✅ |
| `map/tiles` p99 | 2.86 ms | < 50 ms | ✅ |
| WS-Verzögerung p99 | 7.00 ms | < 200 ms | ✅ |
| Bot-Tick p99 | 3.63 ms | < 5 ms | ✅ |
| Abgewiesene Bot-Intents | 0.00 % (0 von 1626) | < 1 % | ✅ |
| Fehler 5xx | 0 | 0 | ✅ |
| Bevölkerung > Bauernhof | 0 Dörfer | 0 | ✅ |
| Mehr als ein Paladin je Spieler | 0 Spieler | 0 | ✅ |
| Verwaiste Events | 0 | 0 | ✅ |
| Bewegungen mit Ankunft in der Vergangenheit | 0 | 0 | ✅ |

## Antwortzeiten je Route (Client-Sicht)

| Route | Anfragen | p50 | p99 | max |
|---|---|---|---|---|
| `build` | 2987 | 1.04 ms | 1.98 ms | 13.8 ms |
| `join` | 50 | 3.62 ms | 19.1 ms | 19.1 ms |
| `map/tiles` | 2868 | 1.74 ms | 2.86 ms | 12.6 ms |
| `recruit` | 2212 | 0.92 ms | 1.68 ms | 15.8 ms |
| `register` | 50 | 22.1 ms | 61.3 ms | 61.3 ms |
| `reports` | 1496 | 0.72 ms | 1.28 ms | 3.70 ms |
| `village` | 5122 | 1.00 ms | 1.76 ms | 14.4 ms |

Statuscodes: 10057 × 2xx, 4728 × 4xx (Spielfehler wie `not_enough_resources`, erwartet), 0 × 5xx. WebSocket: 2163 Nachrichten, p50 0.00 ms, p99 7.00 ms.

## Server

Event-Loop-Latenz über den ganzen Lauf: p50 0.06 ms, p99 1.21 ms, max 26.4 ms. Bot-Ticks: 5071, p50 2.16 ms, p99 3.63 ms, max 8.65 ms. Verspätung der Events gegenüber ihrer Fälligkeit: p50 0.69 ms, p99 2.58 ms, max 20.0 ms. WAL-Checkpoints im 15-s-Takt: 241, p50 15.4 ms, max 26.1 ms (blockieren den Event-Loop so lange).

| Event-Typ | Anzahl | je s | p50 | p99 | max |
|---|---|---|---|---|---|
| `barbarian_tick` | 21379 | 5.7 | 0.49 ms | 0.94 ms | 7.62 ms |
| `build_complete` | 14311 | 3.8 | 0.30 ms | 0.56 ms | 7.05 ms |
| `bot_tick` | 5071 | 1.4 | 2.17 ms | 3.64 ms | 8.67 ms |
| `recruit_done` | 77 | 0.0 | 0.15 ms | 0.24 ms | 0.47 ms |

**Aufwärmphase** (erste 120 s, nicht in den Grenzen oben): Event-Loop p99 1.50 ms, max 52.8 ms; Bot-Ticks 1120, p99 3.64 ms, max 7.60 ms; Event-Verspätung max 34.4 ms.

Keine abgewiesenen Bot-Intents.

## Ressourcen (alle 10 s)

RSS am Ende 296 MB (Spitze 307 MB). CPU im Mittel 1 % eines Kerns (Spitze 16 %). Welt-DB inklusive WAL am Ende 18.9 MB.

Stand der Welt am Ende: 2450 Dörfer, 0 Bewegungen unterwegs, 2938 ausstehende Events, 0 Berichte, 2100 Forschungen, 18742 Punkte bei Spielern, 77 Spieler mit Paladin.

## Einordnung (von Hand ergänzt)

**Entscheidung: Der Prototyp ist abgenommen. Ein Worker-Thread je Welt (Plan 03) wird nicht
gebaut.** Alle Grenzen halten mit großem Abstand: Event-Loop p99 1,2 ms (Grenze 50 ms),
HTTP p99 unter 2 ms (Grenze 100 ms), Bot-Tick p99 3,6 ms (Grenze 5 ms). Der Server
braucht im Mittel 1 % eines Kerns.

**Was die Messung geändert hat.** Der erste Stundenlauf hielt die Grenzen ebenfalls, zeigte
aber zwei Fehler. Beide sind behoben, und der Bericht oben stammt vom Lauf danach.

| | Lauf 1 | Lauf 2 (oben) |
|---|---|---|
| Event-Verspätung p99 / max | 135 / 210 ms | 2,6 / 20 ms |
| Event-Rückstand max | 183 ms | 1 ms |
| HTTP max (alle Routen) | bis 173 ms | bis 16 ms |
| Welt-DB inklusive WAL | 184 MB | 18,9 MB |

- **Bots im Gleichtakt.** Alle Bots starteten zusammen und warteten gleich lange. Bei
  2 800 s kamen 162 Bot-Ticks in einem einzigen 10-s-Fenster, davor und danach keiner.
  Seitdem wacht jeder Bot bis zu 15 % später auf als geplant (`BOT_TICK_SPREAD`).
- **WAL der Kartengenerierung.** Die Datenbank hatte 2,3 MB Daten und ein WAL von 151 MB.
  Die Generierung schrieb jedes Dorf als eigene Transaktion, und das WAL schrumpft nie.
  Seitdem läuft die Generierung in einer Transaktion, und `journal_size_limit` kürzt
  das WAL nach dem Checkpoint auf 16 MB.

Schon vor dem ersten Stundenlauf, in den Kurzläufen gefunden:

- **Event-Loop-Messung.** Sie zählte die Auflösung (10 ms) mit: 10,5 ms im Leerlauf,
  ein Block von 30 ms erschien als 39 ms. Gemeldet wird jetzt der Wert abzüglich der
  Auflösung.
- **`synchronous = NORMAL`.** Jeder Commit hatte auf die Platte gewartet (2,6 ms p50
  je Transaktion).
- **WAL-Checkpoint im 15-s-Takt** statt automatisch im Commit, der die Grenze
  überschreitet. Danach fiel das Maximum der Bot-Ticks nach dem Aufwärmen in einem
  Kurzlauf von 18 auf 3,3 ms.

**Was dieses Szenario nicht zeigt.** Bei Speed 10 kommt in einer Stunde niemand über die
Aufbauphase hinaus: 0 Bewegungen, 0 Berichte, 77 fertige Rekrutierungen. Kampf,
Märsche und Berichte hat deshalb ein zusätzlicher **Stresslauf** belastet: 20 min bei
Speed 1000 mit sonst gleicher Welt. Das ist nicht Teil der Abnahme. Der Bericht liegt
lokal unter `data/loadtest-krieg.md`, die Kennzahlen stehen hier:

| Kennzahl | Stresslauf (Speed 1000) |
|---|---|
| Events | ~830 je s (531 Barbaren-Ticks, 138 Bauten, 87 Rekrutierungen, 62 Bot-Ticks, 10 Ankünfte) |
| CPU | 43 % eines Kerns im Mittel, Spitze 62 % |
| Event-Loop p99 | 5,1 ms |
| Bot-Tick p99 | 3,0 ms (83 000 Ticks) |
| Abgewiesene Bot-Intents | 0 von 33 167 |
| Ankünfte (Angriffe, Rückwege) | 13 232, alle Invarianten grün, 0 × 5xx |
| HTTP p99 | 0,5–0,8 s ❌ |
| WAL-Checkpoint je 15 s | p50 287 ms, max 711 ms |

Bei gut 100-facher Last des Zielszenarios bleibt die Engine schnell. Die Event-Loop-
Latenz steigt nur auf 5 ms, und Bot-Ticks kosten so viel wie vorher. Gerissen sind
allein die Antwortzeiten, und zwar wegen der Checkpoints: Bei dieser Schreiblast wächst
das WAL in 15 s auf Hunderte MB, und das Zurückschreiben blockiert den Event-Loop.
**Für den PoC folgt daraus ein kleines Ticket statt eines Worker-Threads je Welt:** den
Checkpoint in einen eigenen Worker-Thread mit eigener Verbindung verlegen (ein
`PASSIVE`-Checkpoint blockiert Schreiber im WAL-Modus nicht) oder ihn häufiger und in
kleinen Schritten laufen lassen. Die Barbaren dominieren die Eventzahl. Ihre Rate skaliert
mit dem Speed und sollte für schnelle Welten eine eigene Obergrenze bekommen.
