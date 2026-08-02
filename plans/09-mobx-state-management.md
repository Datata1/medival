# Plan 09: State-Management mit MobX — „Stores besitzen Daten, React zeigt sie an"

**Status:** ✅ erledigt (2026-08-01)

> **Ergebnis:** Keine Komponente beschafft mehr Daten. TanStack Query ist
> vollständig entfernt; sieben Stores unter `src/stores/` besitzen den Zustand.
> Client-Tests: 4 → **22**, davon 18 neue Store-Tests, die **ohne Rendering**
> laufen — das war das eigentliche Ziel.
>
> **Belegte Verbesserungen (im Browser gemessen):**
> - Polling hängt jetzt am Welt-Lebenszyklus: 2 Bewegungs-Abfragen in 12 s auf dem
>   *Dorf*-Tab (vorher 0, weil `MovementsPanel` dort nicht gerendert wird) und
>   0 Abfragen nach Verlassen der Welt.
> - Reaktivität geprüft: Ressourcen und Countdown ticken, Pause hält die Uhr an,
>   nach Rückkehr aus der Lobby läuft alles weiter — das Risiko „vergessener
>   `observer`" ist damit gezielt abgedeckt.
>
> **Abweichungen von der Planung:**
> - `SocketConnection` wurde zur Schnittstelle `WorldSocket` mit injizierbarer
>   Umsetzung. Der erste Testlauf scheiterte an `location is not defined`; statt
>   eine Browser-Umgebung für die Tests aufzusetzen, hängt der `RootStore` jetzt
>   nicht mehr an Browser-APIs — die sauberere Lösung.
> - `components/Countdown.tsx` liest als einzige Präsentationskomponente aus einem
>   Store (die Weltzeit). Als dokumentierte Ausnahme im Layering-Check hinterlegt,
>   weil ein durchgereichter Zeitwert jede Zwischenkomponente zum `observer`
>   machen würde.
> - Die Tab-Auswahl bleibt vorerst lokaler `useState` in `WorldView` — sie wandert
>   in [Plan 10](10-tanstack-router.md) in die URL.
>
> **Durchsetzung:** `scripts/check-layering.mjs` (mit Selbsttest, in `pnpm lint`)
> prüft drei Regeln: API-Client nur in Stores, `fetch` nur in `api/`,
> Präsentationskomponenten ohne Store-Zugriff.

## Kontext

React soll Daten **darstellen** und den Datenfluss durch die Komponenten abbilden — nicht
beschaffen. Heute ist das vermischt: Acht Komponenten holen ihre Daten selbst.

```
features/world/WorldView.tsx      useWorld, useReports, useTogglePause,
                                  useMarkReportsRead, useWorldSocket
features/village/VillagePanel.tsx useWorld, useVillage, useBuild, useRecruit
features/map/MapView.tsx          useWorld, useVillage, useMap, useMovements
features/map/MovementsPanel.tsx   useMovements
features/map/SendUnitsForm.tsx    useSendUnits
features/reports/ReportsView.tsx  useReports
features/lobby/WorldList.tsx      useWorldList, useDeleteWorld
features/lobby/CreateWorldForm.tsx useCreateWorld
```

Daraus folgen vier konkrete Probleme:

1. **Verantwortung liegt falsch.** `MapView` und `MovementsPanel` laden dieselben
   Bewegungen unabhängig voneinander. TanStack Query dedupliziert das zwar, aber zwei
   Komponenten „besitzen" dieselbe Ressource — und keine ist zuständig.
2. **Der Datenfluss ist nicht testbar.** Er lebt in Hooks und braucht zum Prüfen ein
   Rendering. Der Client hat deshalb bis heute nur 4 Tests (alle zu i18n).
3. **Invalidierung ist verstreut.** 5 Stellen in `hooks/useWorldSocket.ts`, 8 in
   `hooks/mutations.ts`. Wer wissen will, wann sich ein Dorf aktualisiert, muss beide
   Dateien plus die aufrufende Komponente lesen.
4. **Polling hängt am Rendering.** `MovementsPanel` pollt nur, solange es gemountet ist.
   Wer auf dem Dorf-Tab steht, während dort kein Bewegungspanel sichtbar ist, bekommt
   veraltete Ankunftszeiten — obwohl die Welt weiterläuft.

Entschieden (mit Nutzer): **TanStack Query wird vollständig ersetzt.** Zwei Caching-Ebenen
mit je eigenen Invalidierungsregeln wären genau die Unklarheit, die dieser Plan beseitigen
soll.

## Das Idiom

> **Stores besitzen Daten, React zeigt sie an.**
> Kein `fetch` und kein Import von `api/client.ts` außerhalb von `src/stores/`.
> Container-Komponenten sind `observer` und lesen aus Stores; Präsentationskomponenten
> bekommen weiterhin alles über Props (Plan 05 bleibt unberührt).

## Architektur

`packages/client/src/stores/`:

| Datei | Verantwortung |
|---|---|
| `RootStore.ts` | Komposition der Sub-Stores, Lifecycle `openWorld()` / `closeWorld()` |
| `LobbyStore.ts` | Weltenliste, Welt erstellen, Welt löschen |
| `WorldStore.ts` | aktive Welt, Status, Pause/Fortsetzen, **Spielzeit-Ticker** |
| `VillageStore.ts` | aktives Dorf, Bauen, Rekrutieren |
| `MapStore.ts` | Kartendörfer, Auswahl, Truppen senden |
| `MovementsStore.ts` | Bewegungen + Polling (5 s) |
| `ReportsStore.ts` | Berichte, Ungelesen-Zähler, Als-gelesen-Markieren |
| `SocketConnection.ts` | WebSocket → gezielte Reloads statt pauschaler Invalidierung |
| `AsyncValue.ts` | gemeinsamer Baustein für `value` / `isLoading` / `error` / `load()` |
| `StoreContext.tsx` | Provider + `useStores()` |

**Technik:** MobX 6 mit `mobx-react-lite`. `makeAutoObservable(this)` im Konstruktor,
`runInAction` für jede Zuweisung nach einem `await`.

**`AsyncValue<T>`** verhindert, dass Lade- und Fehlerbehandlung in sechs Stores dupliziert
wird — ein Store schreibt `await this.village.load(() => api.getVillage(worldId, id))`
statt dreimal dasselbe Flag-Geschiebe.

**Spielzeit.** `features/world/GameTimeContext.tsx` und `hooks/useGameTime.ts` entfallen;
der `WorldStore` hält `gameTime` als Observable und tickt per Interval. Das ist derselbe
Gedanke wie der `useSyncExternalStore`-Umbau aus Plan 06 — nur ist MobX jetzt der externe
Store, und die Uhr gehört zur Welt statt zu einer Komponente. `components/Countdown.tsx`
wird `observer` und liest die Zeit aus dem Store.

**Polling gehört an den Welt-Lifecycle.** `MovementsStore.startPolling()` läuft, solange
eine Welt offen ist, und stoppt in `closeWorld()` — unabhängig davon, welche Ansicht
gerade gerendert wird. Das behebt Problem 4 aus dem Kontext.

**Socket statt Invalidierung.** `SocketConnection` ruft gezielt Store-Methoden auf
(`village_updated` → `villageStore.reload()`), statt Query-Keys zu invalidieren. Die
Nachrichten werden weiterhin mit `WorldMessageSchema` geparst (Plan 08).

## Schritte

1. `mobx` + `mobx-react-lite` installieren; `AsyncValue`, `RootStore`, `StoreContext`
   anlegen — mit Tests für `AsyncValue` (Erfolg, Fehler, paralleler Aufruf).
2. `LobbyStore` — kleinster isolierter Fall; `Lobby`, `WorldList`, `CreateWorldForm`
   auf `observer` umstellen.
3. `WorldStore` inklusive Uhr und `SocketConnection`; `WorldView`/`Topbar` umstellen,
   `GameTimeContext` und `useGameTime` entfernen.
4. `VillageStore`; `VillagePanel` wird ein dünner `observer`-Container.
5. `MapStore` + `MovementsStore`; `MapView`, `MovementsPanel`, `SendUnitsForm`,
   `TargetPanel` umstellen. `useMapCamera` bleibt lokaler UI-State — Kamera ist
   Ansichtssache, kein Domänenzustand.
6. `ReportsStore`; `ReportsView` umstellen, Mark-as-read-Aufruf aus `WorldView`
   in den Store verschieben.
7. **Abriss:** `hooks/queries.ts`, `hooks/mutations.ts`, `hooks/useWorldSocket.ts`,
   `hooks/useGameTime.ts`, `features/world/GameTimeContext.tsx` löschen;
   `QueryClientProvider` aus `main.tsx` entfernen; `@tanstack/react-query` deinstallieren.

## Durchsetzung

`scripts/check-layering.mjs` (Muster wie `check-no-casts.mjs` aus Plan 08, inklusive
Selbsttest) schlägt fehl, wenn

- `api/client.ts` außerhalb von `src/stores/` importiert wird,
- `fetch(` außerhalb von `src/api/` aufgerufen wird,
- eine Datei unter `src/components/` einen Store importiert (Präsentation bleibt pure).

Läuft in `pnpm lint`; Selbsttest über `pnpm check:layering`.

## Verifikation

- **Store-Tests ohne Rendering** (das eigentliche Ziel dieses Plans): Bauen aktualisiert
  das Dorf im Store; eine Socket-Nachricht löst genau einen gezielten Reload aus; Polling
  startet mit `openWorld` und stoppt mit `closeWorld`; ein API-Fehler landet in `error`
  statt zu werfen; `AsyncValue` setzt `isLoading` korrekt zurück.
- `grep` bestätigt: keine `@tanstack/react-query`-Importe mehr, keine `api.`-Aufrufe
  außerhalb von `stores/`.
- `pnpm lint` (inkl. Layering-Check), `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
- Browser-Smoke-Test aller vier Ansichten mit je einer Aktion (Welt anlegen, Gebäude
  bauen, Einheit rekrutieren, Angriff senden, Bericht öffnen).
- **Risiko gezielt prüfen:** Eine vergessene `observer`-Umhüllung äußert sich als
  Komponente, die nicht mehr aktualisiert. Der Smoke-Test prüft deshalb ausdrücklich
  tickende Werte (Ressourcen, Countdown) und den Ungelesen-Zähler.
