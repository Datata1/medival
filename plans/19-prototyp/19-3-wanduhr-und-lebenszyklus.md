# Ticket 19-3: Wanduhr & Welt-Lebenszyklus

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** [19-2](19-2-zeit-engine-konsistenz.md), [19-4](19-4-bots-reparieren.md)

> **Ergebnis:** Spielzeit läuft an der Wanduhr. Ein Serverausfall hält die Welt nicht mehr
> an. Nach dem Neustart steht die Uhr dort, wo sie ohne Ausfall stünde, und Verpasstes
> wird zu seiner ursprünglichen Zeit abgerechnet. Pause und Vorspulen gibt es nur noch
> mit `MEDIVAL_DEV=1` (`pnpm dev` setzt es). Ohne Entwicklermodus existieren die Routen
> nicht. Der Client zeigt Ankünfte als Serveruhrzeit auf die Millisekunde
> (`14:03:12:437`, „morgen …", Datum), Berichte und die Uhr in der Dorfleiste ebenfalls.
> Standard-Speed für neue Welten ist 1.
>
> **Am echten Server geprüft:** Welt anlegen, Server ~14 s laufen lassen, ~14 s aus,
> neu starten. Die Spielzeit steht bei 29,6 s, also der gesamten Wanduhrzeit seit dem
> Anlegen (vorher wären es ~14 s gewesen). `POST /pause` ohne Entwicklermodus: 404.
>
> **Tests** (`test/integration/clock.test.ts`, mit austauschbarer Wanduhr statt Warten):
> Ausfall von 5 min, danach ist der Angriff zu seiner Ankunftszeit abgerechnet. Eine
> verstellte `Date.now` verschiebt nichts. Ein Spielstand ohne Nullpunkt läuft ab seinem
> gespeicherten Stand weiter, und `won` wird als `ended` gelesen und nicht neu gestartet.
> Dev-Routen: 404 ohne Entwicklermodus, sonst Pause/Vorspulen/Fortsetzen. Uhrzeit =
> Nullpunkt + Spielzeit. Im Client: `formatClock` und `WorldStore.clockOf`.
>
> **Abweichungen von der Planung:**
>
> - **Ein Wert statt zwei:** Statt `started_at_epoch_ms` und `dev_offset_ms` gibt es
>   `epoch_zero_ms`, die Wanduhrzeit, zu der die Spielzeit 0 war. Pause und Vorspulen
>   verschieben nur diesen Wert, und die Uhrzeit eines Spielzeitpunkts ist
>   `epoch_zero_ms + t`.
> - **Keine Trennung in `WallClock`/`ManualClock`:** Es bleibt eine `GameClock`. Die
>   Wanduhr-Quelle (`wallClock.now`) ist austauschbar, das reicht Tests und Harness.
> - **Entwicklermodus über die Weltzusammenfassung** (`devMode`) statt `GET /api/me`, das
>   erst mit 19-8 entsteht. Ebenso ab 19-8: Dev-Routen nur für Admins.
> - **`ClockTime`** liest wie `Countdown` die Weltzeit aus dem Store, als zweite
>   dokumentierte Ausnahme in `check-layering.mjs`. Die Umrechnung soll nicht in jeder
>   Ansicht kopiert werden.
> - **`game_time_ms`** bleibt. Bei laufenden Welten ist es ein Diagnosewert, bei
>   pausierten die eingefrorene Zeit.

## Kontext

`GameClock` (`server/src/engine/clock.ts`) ist eine **Spielstand-Uhr**. Sie akkumuliert
Spielzeit, solange der Server läuft und die Welt nicht pausiert ist, und friert sonst ein.
Für einen Singleplayer ist das ideal: Wer den Laptop zuklappt, verliert nichts.

In einer Mehrspielerwelt ist genau das falsch:

- **Pause hält die Welt für alle an.** `POST /api/worlds/:id/pause` (`routes.ts:98`) ist für
  jeden erreichbar, und der Client bietet es in `SettingsView.tsx` und
  `WorldListItem.tsx` an.
- **Ein Serverneustart verschiebt die Welt.** Ist der Server eine Stunde weg, kommen alle
  Angriffe eine Stunde später an. In Tribal Wars ist die Ankunftszeit ein Versprechen an
  den Spieler („Ankunft 14:03:12"), das er sich notiert und nach dem er plant.
- **Spielzeit ≠ Uhrzeit.** Der Client zeigt `gameTime` als Dauer seit Weltbeginn. Ein
  Mehrspieler braucht „Ankunft heute 14:03:12.437", denn darüber verständigen sich Spieler
  im Stamm.
- **`won` / `lost`** (`world.ts:69`) sind Singleplayer-Begriffe aus Sicht des einen Menschen.

## Kernentscheidung: Spielzeit ist Wanduhr seit Weltstart

```
gameTime = jetztEpochMs − startedAtEpochMs
```

`startedAtEpochMs` wird beim Anlegen gespeichert und ändert sich nie. Gemessen wird
weiterhin monoton (Plan 03): `performance.timeOrigin + performance.now()` statt
`Date.now()`. Die Uhr wird beim Start einmal gegen `Date.now()` geankert, NTP-Sprünge
während der Laufzeit verschieben sie nicht.

Damit gilt:

- Neustart → Rückstand → Catch-up mit Batch-Yield (Plan 03) und `catching_up` (19-2).
  Danach steht die Welt dort, wo sie ohne Ausfall stünde.
- Angezeigte Zeiten sind echte Uhrzeiten: `startedAtEpochMs + gameTime`.
- **`GameTime` bleibt der Typ.** Alle Formeln, Events und Tests rechnen weiter in Spielzeit
  seit Weltstart. Die Umstellung betrifft nur die Uhr und die Anzeige, nicht das Regelwerk.

**Pause und Vorspulen werden Entwicklerwerkzeuge.** Sie bleiben unverzichtbar für
Balancing und Fehlersuche, sind aber nur aktiv, wenn der Server mit `MEDIVAL_DEV=1`
läuft, und nur für Admins (19-8). Technisch bekommt die Uhr dafür einen Versatz
`devOffsetMs`, der in der Meta-DB steht. Vorspulen erhöht ihn, Pause friert ihn ein.
Im Produktivbetrieb gibt es keine Route dafür.

**Speed.** Der Prototyp unterstützt weiterhin jeden Speed, Standard wird **1**. Der
Mehrspieler-Prototyp wird mit Speed 1–10 gespielt, die Tests laufen mit hohem Speed. Das
steht so in `DEFAULT_WORLD_SETTINGS` und im Handbuch.

## Umsetzung

- **Meta-DB:** `worlds.started_at_epoch_ms`, `worlds.dev_offset_ms`. Migration für
  bestehende Welten: `started_at = jetzt − game_time_ms`. Die Welt läuft dann ab ihrem
  bisherigen Stand weiter.
- **`clock.ts`:** `WallClock` (Produktion) und `ManualClock` (Harness aus 19-1) hinter
  einer gemeinsamen Schnittstelle `Clock { now(): number; running: boolean }`. Der
  Scheduler kennt nur die Schnittstelle.
- **Status:** `running | paused | ended`. `paused` gibt es nur im Dev-Modus. `ended` setzt
  der Admin, Siegbedingungen kommen im PoC. `WorldStatusSchema` und Client ziehen nach.
- **Routen:** `pause`/`resume` und ein neues `POST /api/worlds/:id/dev/skip` nur mit
  `MEDIVAL_DEV=1` und Admin-Rolle (Prüfung als Fastify-`preHandler`). Ohne Dev-Modus
  existieren die Routen nicht (404).
- **API:** `WorldSummary` erhält `startedAtEpochMs`. Der Client rechnet daraus Uhrzeiten
  (`shared/src/time.ts`: `GameTime.toEpoch(t, startedAt)`) und zeigt sie
  millisekundengenau an der Ankunft an (`HH:MM:SS:mmm`, wie Tribal Wars).
- **Client:** Pause-Schalter aus `SettingsView.tsx` und `WorldListItem.tsx` entfernen bzw.
  hinter `devMode` aus `GET /api/me` stellen. `WorldStore` verliert `togglePause` für
  normale Spieler.
- **Persistenz:** `game_time_ms` in der Meta-DB wird überflüssig. Es bleibt als
  Diagnosewert, ist aber nicht mehr Quelle der Wahrheit.

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/engine/clock.ts` | `Clock`-Schnittstelle, `WallClock`, `ManualClock` |
| `server/src/engine/world.ts` · `worldManager.ts` | Uhr aus `startedAt`, Status `ended`, Migration |
| `server/src/db/ddl.ts` | `worlds.started_at_epoch_ms`, `dev_offset_ms` |
| `server/src/api/routes.ts` | Dev-Routen hinter `MEDIVAL_DEV` + Admin |
| `shared/src/time.ts` | `GameTime.toEpoch` |
| `shared/src/schema/world.ts` · `api.ts` | Status, `startedAtEpochMs`, Default-Speed 1 |
| `client/src/stores/WorldStore.ts` | Uhrzeit-Anzeige, kein Pause-Schalter |
| `client/src/features/world/SettingsView.tsx` · `lobby/WorldListItem.tsx` | Pause nur im Dev-Modus |
| `client/src/i18n/de.ts` | Texte |
| `server/test/harness/world.ts` | nutzt `ManualClock` |

## Verifikation

- **Neustart:** Welt anlegen, Angriff mit Ankunft in 2 min schicken, Server (im Test: den
  `WorldManager`) schließen, `ManualClock` um 5 min vorstellen, neu öffnen → der Angriff
  ist abgerechnet, und zwar zu seiner ursprünglichen Ankunftszeit (Bericht prüfen).
- **NTP-Sprung:** `Date.now` im Test um −1 h verstellen → `WallClock.now()` läuft monoton
  weiter.
- **Keine Pause im Produktivbetrieb:** `inject('POST /api/worlds/1/pause')` ohne
  `MEDIVAL_DEV` → 404, mit Dev-Modus, aber ohne Admin → 403.
- **Migration:** alte Welt aus `data/` (Kopie) öffnen → `gameTime` unmittelbar danach
  gleich dem gespeicherten `game_time_ms` (±1 s).
- **Anzeige:** Bewegungsliste zeigt Ankunft als Uhrzeit mit Millisekunden.
  Store-Test in `client/test/stores.test.ts`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
