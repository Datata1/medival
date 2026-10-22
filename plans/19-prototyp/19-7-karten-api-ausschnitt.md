# Ticket 19-7: Karten-API nach Ausschnitt

**Status:** 📋 offen · **Voraussetzung:** [19-6](19-6-weltkarte-kreisfoermige-besiedlung.md)

## Kontext

`GET /api/worlds/:id/map` (`server/src/api/routes.ts:120`) liefert **alle Dörfer der Welt**
in einer Antwort. `MapStore` (`client/src/stores/MapStore.ts:51/65`) lädt sie einmal in ein
`AsyncValue<MapVillage[]>` und lädt bei jeder Änderung alles neu. Die Minimap
(`MiniMap.tsx`) zeichnet jedes Dorf als Punkt.

Bei 100 Dörfern ist das ideal, bei 20 000 Dörfern (Ziel nach einigen Wochen PoC) sind es
~2 MB JSON je Abruf, und jeder Bau eines beliebigen Spielers löst einen Neuabruf aus.

Die Nahansicht zeigt bei üblicher Zoomstufe etwa 30×20 Felder, also einen Bruchteil
eines Kontinents.

## Kernentscheidung: Kacheln im Kontinentraster

Die Karte wird in **Kacheln zu 20×20 Feldern** geladen (25 Kacheln je Kontinent).
Kacheln sind fest ausgerichtet (`x0 = floor(x/20)·20`), damit sie sich cachen lassen und
eine Änderung genau eine Kachel ungültig macht. Die Nahansicht braucht typischerweise
4–6 Kacheln.

**Die Übersicht zeigt seit 19-6 einen Ausschnitt von 100×100 Feldern** um die Kamera
(Entscheidung des Nutzers: Die ganze Welt auf kleinem Raum macht einzelne Dörfer
unkenntlich). Sie braucht deshalb dieselben Kacheln wie die Nahansicht, nur mehr davon
(5×5 bis 6×6 Kacheln), und kein eigenes Aggregat. Eine Gesamtansicht der Welt
(Dorfzahl je Kachel, eingefärbt) ist eine mögliche spätere Ergänzung, etwa als
eigene Weltkarten-Seite, aber nicht Teil dieses Tickets.

**Invalidierung per WebSocket.** Ändert sich ein Dorf in einer Weise, die die Karte
betrifft (Punkte über eine Rundungsstufe, Besitzer, Name, neues Dorf), sendet der Server
`map_tile_changed { tx, ty }`. Der Client lädt die Kachel nach, wenn sie geladen und
sichtbar ist, und verwirft sie sonst. Punkte werden für die Karte auf 10er gerundet, sonst
wäre jede Bauaktion ein Karten-Event.

## Umsetzung

### Server

- `GET /api/worlds/:id/map/tiles?tx0&ty0&tx1&ty1`. Höchstens 6×6 Kacheln je Anfrage,
  geparst mit zod. Die Antwort ist `{ tiles: [{ tx, ty, villages: MapVillage[] }] }`.
  Die Abfrage läuft über `villagesInBox` aus 19-5.
- `MapVillage` erhält `tribeTag` (heute separat in `/diplomacy` abgefragt), damit die
  Nahansicht ohne zweite Anfrage färben kann.
- `map_tile_changed` aus `insertVillage`, Eroberung, Umbenennung und
  Punkte-Rundungssprung (`onBuildComplete`). Dedupliziert pro Event-Batch (19-2).
- Die alte Route `/map` bleibt bis zum Ende des Tickets und fällt dann weg.

### Shared

`shared/src/logic/tiles.ts`: `TILE_SIZE = 20`, `tileOf(x, y)`, `tilesInView(view)`,
`tileKey(tx, ty)`. Client und Server benutzen dieselben Funktionen.

### Client

- `MapStore`: `tiles: ObservableMap<string, AsyncValue<MapVillage[]>>`,
  `ensureTiles(view)` (aufgerufen aus der Kamera-Reaktion, entprellt 100 ms) für den
  Ausschnitt der Übersicht (`miniWindow`), der die Nahansicht einschließt,
  LRU-Grenze 400 Kacheln.
- `visibleVillages` als `computed` über die Kacheln im Ausschnitt.
- `MapCanvas.tsx`/`MapView.tsx` lesen `visibleVillages` statt aller Dörfer. Noch nicht
  geladene Kacheln werden als Gelände ohne Dörfer gezeichnet, ohne Spinner.
- `MiniMap.tsx` liest die Dörfer seines 100×100-Ausschnitts aus denselben Kacheln.
- Ziel- und Dorfsuche (`TargetPicker.tsx`) nutzen eine neue Route
  `GET /map/search?q=` statt der vollen Dorfliste.
- Layering-Regel bleibt: nur Stores rufen die API.

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/api/routes.ts` | `map/tiles`, `map/search`; alte `/map` entfernen |
| `server/src/engine/world.ts` · `military.ts` · `mapgen.ts` | `map_tile_changed` |
| `shared/src/logic/tiles.ts` | **neu** |
| `shared/src/schema/api.ts` | `MapTilesResponse`, `MapVillage.tribeTag` |
| `client/src/api/client.ts` | neue Methoden |
| `client/src/stores/MapStore.ts` | Kachel-Cache, WS-Invalidierung |
| `client/src/features/map/{MapCanvas,MapView,MiniMap}.tsx` · `village/TargetPicker.tsx` | auf Kacheln umstellen |
| `client/test/stores.test.ts` | API-Mock ergänzen, Kachel-Tests |

## Verifikation

- **Server (inject):** Welt mit 5 000 Dörfern → `map/tiles` für 4×4 Kacheln liefert genau
  die Dörfer in diesem Rechteck, Antwortzeit < 20 ms; 6×6 Kacheln (Übersicht) < 30 ms.
- **Grenzen:** 7×7 Kacheln → 400, Kacheln außerhalb der Karte → leer statt Fehler.
- **Invalidierung:** Eroberung in Kachel (3,4) → genau ein `map_tile_changed {3,4}`.
  Ein normaler Ausbau ohne Rundungssprung löst keines aus.
- **Store-Test:** Kamera über drei Kacheln schieben → genau drei Anfragen, die zweite
  Bewegung zurück → keine weitere (Cache). LRU verwirft die älteste Kachel bei 401.
- **Browser:** Karte auf 1000×1000 mit 5 000 Dörfern ruckelfrei scrollen; die Übersicht
  lädt beim Verschieben nach.
- `pnpm lint` (inkl. Layering und Kontrast für neue Kachelfarben), `pnpm typecheck`,
  `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
