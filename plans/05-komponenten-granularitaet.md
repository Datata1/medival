# Plan 05: Feingranulares Komponentensystem (pure Komponenten)

**Status:** ✅ erledigt (2026-08-01) · **Nutzer-Punkt:** 3

> Umsetzungsnotizen: Struktur wie geplant (api/, hooks/ mit zentralen Query-Keys,
> components/, features/lobby|world|village|map|reports, lib/). Abweichungen:
> useLiveResources/useEffectiveLevels wurden pure Functions in features/village/derive.ts
> (kein Hook nötig); SendUnitsForm in features/map/ statt eigener Datei pro Feld;
> zusätzlich Countdown- und ResourceCost-Komponenten. Größte Datei ~130 Zeilen (MapCanvas).
> Browser-Smoke-Test mit einer Aktion pro Ansicht bestanden.

## Kontext

Die Client-Komponenten sind zu groß und mischen Verantwortlichkeiten. Ist-Zustand:

- `VillagePanel.tsx` (~260 Zeilen): Datenladen (2 Queries, 2 Mutations), Live-Ressourcen-
  Berechnung, Gebäudetabelle, Rekrutierungstabelle, zwei Queues, Truppenliste — alles in einer Komponente.
- `MapView.tsx` (~330 Zeilen): Canvas-Rendering, Kamera-State, Maus-Interaktion,
  Zielpanel mit Sende-Formular, Bewegungs-Panel — plus 4 Queries.
- `WorldView.tsx`: Tabs, Pause-Steuerung, Berichte-Badge, Dorf-Auswahl.

Ziel: Container laden Daten (Hooks), Präsentationskomponenten sind **pure Functions**
(Props rein, JSX raus, keine Fetches, kein globaler Zustand). Kleine Bausteine, klare
Feature-Ordner.

## Zielstruktur

```
packages/client/src/
  api/
    client.ts          (fetch-Wrapper + Endpunkte, aus api.ts)
    types.ts           (Response-Typen, aus api.ts)
  hooks/
    useWorld.ts        (Query world)
    useVillage.ts      (Query village)
    useMovements.ts    (Query movements, 5s-Interval)
    useReports.ts      (Query reports)
    useGameTime.ts     (aus hooks.ts)
    useWorldSocket.ts  (aus hooks.ts)
    mutations.ts       (useBuild, useRecruit, useSendUnits, useTogglePause, …)
  components/          (pure, feature-unabhängig)
    Button.tsx  Card.tsx  Tabs.tsx  CountInput.tsx
    ResourceCost.tsx   (🪵/🧱/⛏️-Tripel, ersetzt 3 Kopien)
    Countdown.tsx      (formatDuration(until − gameTime))
    UnitCountList.tsx
  features/
    lobby/    Lobby.tsx  CreateWorldForm.tsx  WorldList.tsx  WorldListItem.tsx
    world/    WorldView.tsx  Topbar.tsx  GameTimeContext.tsx
    village/  VillagePanel.tsx (Container)
              ResourceBar.tsx  BuildQueueCard.tsx  BuildingsTable.tsx  BuildingRow.tsx
              RecruitQueueCard.tsx  RecruitTable.tsx  RecruitRow.tsx  UnitsCard.tsx
              useLiveResources.ts  (pure Ableitung: Snapshot + Raten + gameTime → live Werte)
              useEffectiveLevels.ts (Levels inkl. Queue — Spiegel der Server-Validierung)
    map/      MapView.tsx (Container)
              MapCanvas.tsx (nur Canvas-Rendering, Props: villages/movements/camera/selection)
              useMapCamera.ts (Pan/Zoom/Klick-Hit-Test)
              TargetPanel.tsx  SendUnitsForm.tsx  MovementsPanel.tsx
    reports/  ReportsView.tsx (Container)
              ReportList.tsx  ReportRow.tsx  ReportDetail.tsx  UnitLossTable.tsx
  lib/
    format.ts          (bestehend)
```

## Prinzipien (gelten ab diesem Plan verbindlich)

1. **Pure Präsentation:** Komponenten unter `components/` und die Nicht-Container in
   `features/` erhalten alles über Props; keine Query-/Mutation-Aufrufe, kein Context-Zugriff
   außer `GameTimeContext`.
2. **Ein Query-Hook pro Ressource** (`useVillage(worldId, id)`), Komponenten rufen nie
   direkt `useQuery` mit inline QueryKey auf — Keys leben zentral in den Hooks.
3. **`GameTimeContext`** ersetzt das `gameTime`-Prop-Drilling (WorldView stellt Provider,
   `useGameTimeContext()` liefert tickende `GameTime`).
4. **Abgeleitete Werte als pure Helper** (`useLiveResources`, `useEffectiveLevels`) —
   testbar ohne Rendering.
5. Dateien > ~120 Zeilen sind ein Signal zum Aufteilen.

## Schritte

1. `api.ts` → `api/client.ts` + `api/types.ts`; `hooks.ts` auflösen nach `hooks/`.
2. Query-/Mutation-Hooks extrahieren (Keys zentralisieren; `useWorldSocket` invalidiert
   über dieselben Key-Konstanten).
3. `GameTimeContext` einführen; `WorldView` → `Topbar` + Tabs via `components/Tabs.tsx`.
4. `VillagePanel` zerlegen (Reihenfolge: ResourceBar → Queues → BuildingsTable →
   RecruitTable → UnitsCard), `useLiveResources`/`useEffectiveLevels` extrahieren.
5. `MapView` zerlegen: zuerst `useMapCamera` (State+Handler), dann `MapCanvas`
   (reines Zeichnen), dann Panels.
6. `ReportsView` zerlegen (mechanisch).
7. `Lobby` zerlegen (mechanisch).
8. Alte Dateien löschen, Importe fixen, `pnpm lint:fix`.

## Verifikation

- `pnpm typecheck`, `pnpm lint`, `pnpm build` grün.
- Browser-Smoke-Test aller vier Ansichten inkl. einer Aktion pro Ansicht
  (Welt öffnen, Gebäude bauen, Einheit rekrutieren, Angriff senden, Bericht öffnen).
- Stichprobe: `components/`-Dateien enthalten keine `useQuery`/`useMutation`-Importe (grep).
