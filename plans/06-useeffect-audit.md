# Plan 06: useEffect-Audit nach „You Might Not Need an Effect"

**Status:** ✅ erledigt (2026-08-01) · **Nutzer-Punkt:** 5

> Umsetzungsnotizen: Alle drei Befunde behoben — Kamera als abgeleiteter Wert mit
> User-Override (useMapCamera), Mark-read im Tab-Klick-Handler (WorldView.openTab),
> useGameTime via useSyncExternalStore mit geteiltem Ticker-Store plus
> "adjust state during render"-Pattern für den Anker (statt useMemo+Suppression).
> Keine biome-ignore/eslint-disable mehr im Client; verbleibende Effects: nur
> MapCanvas (Canvas) und useWorldSocket (WebSocket). Bonus-Fund beim Verifizieren:
> Der fetch-Wrapper sendete Content-Type: application/json auch bei körperlosen
> POSTs → Fastify 500 (betraf mark-read und pause/resume aus der UI); behoben in
> api/client.ts.

## Kontext

Grundlage ist https://react.dev/learn/you-might-not-need-an-effect (gelesen und auf diese
Codebase angewendet). Die goldene Regel daraus:

> Code, der läuft, **weil die Komponente angezeigt wurde** → Effect.
> Code, der läuft, **weil der Nutzer etwas getan hat** → Event-Handler.
> Werte, die sich **aus Props/State ableiten** lassen → im Render berechnen (ggf. useMemo).
> State-Reset bei Prop-Wechsel → `key`. Externe Systeme abonnieren → Effect oder besser `useSyncExternalStore`.

## Audit-Befunde (Stand nach M2; Dateipfade ggf. nach Plan 05 aktualisiert)

| # | Stelle | Befund | Maßnahme |
|---|--------|--------|----------|
| 1 | `hooks.ts` → `useWorldSocket` | ✅ legitim: WebSocket = externes System, Subscribe/Cleanup ist genau der Effect-Anwendungsfall | behalten |
| 2 | `hooks.ts` → `useGameTime` | ⚠️ Interval ist legitim, aber: Ref-Mutation **während des Renders** (`anchor.current = …` im Funktionskörper) und Dummy-State (`force`) als Re-Render-Trigger sind unsauber | Umbau auf `useSyncExternalStore`: ein kleiner Ticker-Store (subscribe = setInterval, getSnapshot = abgeleitete GameTime aus Anker + Date.now()); Anker-Update gehört in die Snapshot-Berechnung, nicht in den Renderkörper |
| 3 | `MapView.tsx` → Kamera-Zentrierung (`useEffect(() => { if (!camera && home) setCamera(...) }, [camera, home])`) | 🔴 Anti-Pattern „State an Props anpassen": setState in Effect erzeugt einen Extra-Renderdurchlauf mit veraltetem Zwischenzustand | Ableitung im Render: `const effectiveCamera = camera ?? (home ? {x: home.x, y: home.y, zoom: 22} : null)` — `camera`-State bleibt `null`, bis der Nutzer selbst pant/zoomt. Kein Effect. |
| 4 | `MapView.tsx` → Canvas-Draw-Effect | ✅ legitim: Canvas ist ein externes (imperatives) System, Zeichnen synchronisiert React-Daten dorthin | behalten; durch Plan 05 in `MapCanvas.tsx` gekapselt |
| 5 | `ReportsView.tsx` → Mark-as-read (`useEffect(..., [reports.data])` + eslint-disable!) | 🔴 Als Datenreaktion modelliert, ist aber das Ereignis „Nutzer hat den Berichte-Tab geöffnet". Der vorhandene `eslint-disable`-Kommentar ist das klassische Warnsignal aus dem Artikel | In den Tab-Wechsel-Handler in `WorldView` verlagern: beim Klick auf „Berichte" `markReportsRead`-Mutation feuern (optimistisch Badge auf 0). Effect + disable-Kommentar entfernen |

Weitere Kandidaten, die beim Audit **nicht** anfassen: `main.tsx`/Provider (kein Effect),
TanStack-Query-Hooks (Fetching gehört der Library, nicht eigenen Effects — das bleibt so).

## Schritte

1. Befund 3 umsetzen (MapView/useMapCamera): abgeleitete Kamera statt Initialisierungs-Effect.
2. Befund 5 umsetzen (WorldView/ReportsView): Mark-read in den Tab-Klick; Badge-Logik prüfen
   (unread zählt aus Query-Cache; nach Mutation invalidieren).
3. Befund 2 umsetzen (`useGameTime` → `useSyncExternalStore`); `useGameTimeContext`
   (aus Plan 05) konsumiert den neuen Hook unverändert.
4. Biome-Regel `useExhaustiveDependencies` auf `error` prüfen (aus Plan 01) — nach den
   Umbauten darf es keine Suppressions mehr geben; verbleibende Effects haben vollständige,
   ehrliche Dependency-Arrays.
5. Kurze Doktrin (5 Zeilen, Entscheidungsregel von oben) in `packages/client/README.md`
   oder CLAUDE.md festhalten, damit neue Komponenten dem Muster folgen.

## Verifikation

- Browser-Smoke-Test: Ressourcen ticken live weiter, Karte zentriert initial aufs Heimatdorf
  und lässt sich pannen/zoomen, Berichte-Badge verschwindet beim Öffnen des Tabs.
- grep: kein `eslint-disable`/`biome-ignore` für Hook-Dependencies im Client.
- `pnpm lint` (inkl. `useExhaustiveDependencies`) fehlerfrei; Tests/Build grün.
