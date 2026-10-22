# Ticket 19-15: Lastprobe & Abnahme des Prototyps

**Status:** 📋 offen · **Voraussetzung:** 19-1 bis 19-14 · **Entscheidet:** Worker-Pfad aus [Plan 03](../03-zeit-stabilitaet-node.md)

## Kontext

Plan 03 hat die Frage „Worker-Thread pro Welt?" bewusst offengelassen und ein
**Auslösekriterium** festgelegt: Event-Loop-Latenz p99 > 50 ms oder Event-Rückstand > 1 s
im Normalbetrieb. Plan 15 forderte eine Lastmessung „zusammen mit den Barbaren". Beides
ist nie geschehen, weil es bei 30 Bots keinen Anlass gab.

Der Prototyp soll beweisen, dass die Architektur (ein Node-Prozess, SQLite je Welt,
Events statt Ticks, faule Auswertung) **mehrere hundert Spieler auf einer 1000×1000-Welt**
trägt. Das ist eine Messung, keine Behauptung. Dieses Ticket baut die Messung und
legt die Abnahme fest.

## Kernentscheidung: Lasttest gegen den echten Server, nicht gegen die Engine

Die Engine-Simulation im Harness (19-1) misst Rechenzeit, aber nicht das, was ein
Spieler erlebt: HTTP-Antwortzeiten, WebSocket-Verzögerung und das Zusammenspiel von
Simulation und Anfragen im selben Event-Loop. Der Lasttest startet deshalb den
Server-Prozess **wirklich** (`buildApp` + `listen` auf einem freien Port) und erzeugt
Last von außen.

**Szenario „Prototyp-Welt":**

| Größe | Wert |
|---|---|
| Karte | 1000×1000 |
| Bots | 300 |
| Barbarendörfer | 2 000 |
| Simulierte Menschen | 50 Accounts über HTTP + WS |
| Speed | 10 (Mehrspieler-Obergrenze aus 19-3) |
| Dauer | 60 min Echtzeit |

Ein simulierter Mensch ist ein einfacher Skriptspieler: einloggen, beitreten, alle 5–30 s
eine Aktion (bauen, rekrutieren, Karte im Umkreis laden, Bericht öffnen, gelegentlich
angreifen oder spähen). Die Abstände folgen einer Exponentialverteilung. Das Skript
benutzt nur die öffentliche API, genau wie der Client.

## Umsetzung

- `scripts/loadtest/` (TypeScript, über `tsx` gestartet): `run.ts` (Orchestrierung),
  `human.ts` (Skriptspieler mit `fetch` + `ws`) und `report.ts` (Auswertung).
- Server-seitige Messwerte kommen über `GET /api/health`: Event-Loop-Latenz
  p50/p99/max, Rückstand je Welt, Events/s je Typ, Dauer je Bot-Tick (19-5).
  `health.ts` erhält dafür ein Histogramm je Kennzahl.
- Client-seitig misst das Skript die Antwortzeit je Route (p50/p99) und die
  WebSocket-Verzögerung: Der Server stempelt jede Nachricht mit `sentAt`, und das Skript
  misst gegen die eigene Uhr. Beide laufen auf derselben Maschine.
- Ressourcen: RSS-Speicher, Größe der Welt-DB inklusive WAL und CPU-Anteil des
  Prozesses, alle 10 s erfasst.
- Ergebnis als Markdown-Bericht unter `plans/19-prototyp/lastprobe-ergebnis.md`, mit
  Tabelle, Grenzwerten und Einschätzung.
- Kurzvariante `pnpm loadtest:smoke` (5 min, 50 Bots, 10 Menschen) für die regelmäßige
  Prüfung nach größeren Änderungen. Sie läuft nicht in `pnpm test`.

## Abnahmegrenzen

| Kennzahl | Grenze | Herkunft |
|---|---|---|
| Event-Loop-Latenz p99 | < 50 ms | Plan 03 |
| Event-Rückstand max | < 1 s | Plan 03 |
| HTTP p99 (Dorfansicht, Kommandos) | < 100 ms | Spielgefühl |
| `map/tiles` p99 | < 50 ms | 19-7 |
| WS-Verzögerung p99 | < 200 ms | Spielgefühl |
| Bot-Tick p99 | < 5 ms | 19-5 |
| Abgewiesene Bot-Intents | < 1 % | Plan 15: jeder ist ein Bot-Fehler |
| Fehler 5xx | 0 | |
| Invarianten danach | alle grün | Bevölkerung ≤ Bauernhof, ein Paladin je Spieler, keine verwaisten Events, keine Bewegungen mit Ankunft in der Vergangenheit |

## Entscheidung nach der Messung

- **Alle Grenzen eingehalten:** Der Prototyp ist abgenommen. Der Worker-Pfad bleibt
  dokumentiert und wird nicht gebaut. Der PoC beginnt.
- **Event-Loop-Latenz oder Rückstand gerissen:** Zuerst gezielt messen, welcher
  Event-Typ dominiert (Histogramm je Typ), und dort optimieren. Erst wenn das nicht
  reicht, wird „Worker pro Welt" (Plan 03) als eigenes Ticket für den PoC aufgenommen.
- **Nur Antwortzeiten gerissen:** Die Ursache liegt in den Routen. Indizes und Abfragen
  prüfen (`EXPLAIN QUERY PLAN`), die Architektur bleibt.

## Dateien

| Datei | Änderung |
|---|---|
| `scripts/loadtest/{run,human,report}.ts` | **neu** |
| `server/src/engine/health.ts` | Histogramme je Kennzahl und Event-Typ |
| `server/src/api/routes.ts` | `sentAt` in WS-Nachrichten, erweitertes `/api/health` |
| `package.json` | `loadtest`, `loadtest:smoke` |
| `plans/19-prototyp/lastprobe-ergebnis.md` | **neu** — Messbericht |

## Verifikation

- `pnpm loadtest:smoke` läuft lokal in ~5 min durch und erzeugt einen Bericht.
- Der volle Lauf (60 min) ist einmal durchgeführt und der Bericht eingecheckt.
- Jede Grenze aus der Tabelle steht mit Messwert im Bericht.
- Die Status-Zeilen in `plans/19-prototyp/README.md` und `plans/README.md` sind
  aktualisiert.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
