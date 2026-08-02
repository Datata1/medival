# Plan 10: TanStack Router — Feature-Seiten statt Zustandsschalter

**Status:** ✅ erledigt (2026-08-01) · **Voraussetzung:** [Plan 09](09-mobx-state-management.md)

> **Ergebnis:** Ansichten sind Routen. Sieben Routendateien unter `src/routes/`,
> `App.tsx` entfällt. Die Spielerprofil-Seite ist End-to-End gebaut und von der
> Karte aus erreichbar. Server-Tests: 28 → **32**.
>
> **Im Browser verifiziert (alle 7 Prüfungen):** Weiterleitung aufs aktive Dorf,
> Tab-Wechsel ändert die URL, Deep-Link auf `/worlds/N/map` überlebt einen
> Reload, Browser-Zurück wechselt zwischen Tabs, Profil über die Karte
> erreichbar, unbekannter Spieler zeigt eine Fehlermeldung, unbekannte Route
> zeigt die 404-Seite.
>
> **Zwei Fehler, die erst der Router sichtbar gemacht hat:**
> - `RootStore.openWorld` meldete „schon offen", sobald die Welt-ID gesetzt war —
>   also *bevor* die Daten geladen waren. Solange nur eine Komponente die Welt
>   öffnete, fiel das nie auf; mit parallel ladenden Eltern- und Kind-Loadern
>   bekam die Index-Route eine leere Dorfliste und leitete nicht weiter. Der
>   Guard prüft jetzt ID **und** geladene Daten, und ein laufendes Öffnen wird
>   von parallelen Aufrufen abgewartet statt neu gestartet.
> - Der Fehler-Handler beantwortete „nicht gefunden" mit HTTP 400. Codes auf
>   `_not_found` liefern jetzt 404 (verifiziert für unbekannte Welt und
>   unbekannten Spieler); fehlerhafte Parameter bleiben 400.
>
> **Weitere Abweichungen:**
> - Die Tab-Leiste nutzt `navigate()` statt `<Link>`, weil die Buttons das
>   bestehende `Button`-Aussehen behalten sollten.
> - `routeTree.gen.ts` ist generiert und aus Biome sowie beiden Prüfskripten
>   ausgenommen (`*.gen.ts`).
> - **Bundle:** 123 → **154 kB gzip** (+31 kB für den Router). Für ein
>   self-hosted Spiel unkritisch; Code-Splitting pro Route (`autoCodeSplitting`)
>   wäre der nächste Hebel, falls es stört.
> - Die Verlinkung aus dem Kampfbericht steht noch aus — die Karte deckt den
>   Nachweis ab, und Berichte zeigen Dorf-, nicht Spielernamen.

## Kontext

Die Navigation lebt heute in `useState`:

- `App.tsx` schaltet über `worldId === null` zwischen Lobby und Welt.
- `features/world/WorldView.tsx` hält den Tab (`village` | `map` | `reports`) und die
  Dorf-Auswahl in zwei weiteren `useState`.

Daraus folgt:

1. **Nichts ist verlinkbar.** Es gibt keine URL für „Karte von Welt 3" oder „mein zweites
   Dorf". Ein Reload wirft immer in die Lobby zurück.
2. **Browser-Zurück funktioniert nicht** — der Knopf verlässt die Anwendung, statt einen
   Tab zurückzugehen.
3. **Für neue Feature-Seiten gibt es keinen Ort.** Ein Spielerprofil wäre heute ein
   weiterer Zweig im Zustandsbaum von `WorldView` — und der nächste danach der
   übernächste Zweig.

Ziel: Ansichten werden Routen. Eine neue Feature-Seite ist dann eine neue Datei.

Entschieden (mit Nutzer): **file-based Routing** (das Vite-Plugin generiert den Routenbaum),
und die **Spielerprofil-Seite wird gleich mitgebaut** — als Beleg, dass der Umbau sein Ziel
erreicht.

## Routenbaum

`packages/client/src/routes/` (via `@tanstack/router-plugin/vite`, generiert
`routeTree.gen.ts` — wird mitversioniert):

```
__root.tsx                              Shell (Fehlerseite, 404)
index.tsx                               Lobby                        /
worlds.$worldId.tsx                     Layout: Topbar + Tabs
worlds.$worldId.index.tsx               Weiterleitung aufs aktive Dorf
worlds.$worldId.village.$villageId.tsx  Dorf
worlds.$worldId.map.tsx                 Karte
worlds.$worldId.reports.tsx             Berichte
worlds.$worldId.players.$playerId.tsx   Spielerprofil (neu)
```

Die Tabs aus `WorldView` werden echte `<Link>`s; Tab- und Dorf-Auswahl leben in der URL
statt in `useState`. `WorldView` schrumpft damit auf das Layout (Topbar + Tab-Leiste +
`<Outlet />`).

## Die entscheidende Regel: Loader laden keine Daten

```ts
// richtig — der Loader stößt nur den Store an
loader: ({ context, params }) => context.stores.openWorld(Number(params.worldId)),

// falsch — das wäre neben den Stores eine zweite Datenquelle
loader: ({ params }) => api.getWorld(Number(params.worldId)),
```

Gäben Loader Daten zurück, hätten wir nach Plan 09 wieder zwei Orte, an denen Serverdaten
leben. Der Router beantwortet ausschließlich: *Welche Ansicht ist sichtbar und welche IDs
sind aktiv?* Der `RootStore` wird über `createRouter({ context: { stores } })`
bereitgestellt; Komponenten bleiben `observer` und lesen aus den Stores.

Ungültige Parameter (`worldId` keine Zahl, unbekannte Welt) werden im Loader abgefangen und
führen zur Fehlerkomponente der Route — nicht zu einem weißen Bildschirm.

## Spielerprofil (End-to-End)

**Server** — neuer Endpunkt `GET /api/worlds/:id/players/:playerId`:
Name, Mensch/Bot, Persönlichkeit, Dorfanzahl, Gesamtpunkte, Rang nach Punkten und die
Dorfliste mit Koordinaten. Die Daten liegen bereits in `players` und `villages`
(`packages/server/src/db/schema.ts`); der Rang ist eine Aggregation über `villages.points`.

**shared** — `PlayerProfileSchema` in `packages/shared/src/schema/api.ts`. Der Endpunkt wird
im Client wie alle anderen geparst, nicht gecastet (Plan 08).

**Client** — `PlayerStore` (Plan-09-Muster), die Routen-Komponente und neue Einträge in
`i18n/de.ts` (Plan 07: keine Literale außerhalb des Katalogs).

**Erreichbarkeit** — die Seite wird verlinkt, sonst ist sie totes Gewicht:
- Besitzername im Karten-Zielpanel (`features/map/TargetPanel.tsx`)
- Gegnernamen im Kampfbericht (`features/reports/ReportDetail.tsx`)

**Design-Entscheidung zum Festhalten:** Die Bot-Persönlichkeit (Turtle/Raider/Expander)
wird angezeigt. In einem Singleplayer-Spiel macht sie Gegner lesbar und die Strategie
interessanter; wer sie später verbergen will, blendet ein Feld aus — die Daten sind dann
schon da.

## Schritte

1. `@tanstack/react-router` + `@tanstack/router-plugin` installieren, Vite-Plugin
   einrichten, `__root.tsx` und `index.tsx` (Lobby) anlegen, `App.tsx` durch den
   `RouterProvider` in `main.tsx` ersetzen.
2. `worlds.$worldId.tsx` als Layout: Topbar + Tabs als `<Link>`s + `<Outlet />`;
   Loader ruft `stores.openWorld()`, Cleanup ruft `closeWorld()`.
3. Die drei bestehenden Ansichten auf Routen ziehen; Dorf-Auswahl über `$villageId`
   statt `useState`, `worlds.$worldId.index.tsx` leitet aufs erste eigene Dorf.
4. Server-Endpunkt + Schema + Server-Test für das Profil.
5. `PlayerStore` + Profilroute + Katalogeinträge + die beiden Verlinkungen.

## Verifikation

- **Deep-Link überlebt Reload:** `/worlds/1/map` direkt aufgerufen zeigt die Karte;
  `/worlds/1/village/1` zeigt genau dieses Dorf.
- **Browser-Zurück** wechselt zwischen Tabs statt die Anwendung zu verlassen.
- **Das Profil ist tatsächlich erreichbar** — von der Karte *und* aus einem Kampfbericht,
  beides im Browser durchgeklickt.
- **Fehlerfälle:** `/worlds/999`, `/worlds/1/players/999` und `/worlds/abc` zeigen eine
  saubere Fehlerseite; Server-Test deckt die unbekannte Spieler-ID ab (HTTP 404/400).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün; Browser-Smoke-Test über
  alle Routen inklusive einer Aktion pro Ansicht.
