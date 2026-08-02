# Ticket 18-3: Karte — Nahansicht, Übersichtskarte & Gelände

**Status:** 📋 offen · **Voraussetzung:** [18-1](18-1-rahmen-und-kopfzeile.md) ·
**Vorlage:** `ideas/assets/Karte_beispiel.png`

## Kontext

Die Karte ist der Ort, an dem das Spiel stattfindet, und der am schwersten
lesbare Bildschirm. Fünf Ursachen:

**Zu dunkel.** `MAP_COLORS.ground` in `features/map/MapCanvas.tsx:12-21` ist
`#241a10` — der Ton `timber`, gewählt in [Plan 11](../11-mittelalterliches-design.md),
damit die Dörfer „darauf leuchten". In der Praxis ist es ein schwarzes Feld mit
Punkten darauf. Diese Entscheidung wird hier auf ausdrücklichen Wunsch umgekehrt.

**Unscharf.** Der Canvas hängt auf `width={720} height={560}`
(`MapCanvas.tsx:168-169`) und wird per CSS auf die volle Breite gestreckt.
`imageSmoothingEnabled = false` und `image-rendering: pixelated` mildern das, aber
die Pixel bleiben nicht quadratisch.

**Zoom statt Ausschnitt.** `useMapCamera.ts:102-112` skaliert am Mausrad zwischen 6
und 48 px/Feld, verankert an der Bildmitte statt am Zeiger — der Punkt unter der
Maus wandert beim Zoomen weg. Es gibt weder Berührungsbedienung noch einen Weg
zurück zum eigenen Dorf.

**Die Bewegungsstrahlen sagen nicht, wo etwas ist.** `MapCanvas.tsx:85-100` zieht
eine gerade Linie von Ursprung zu Ziel, ohne Marker. Die Richtung wird per
`movements.incoming.includes(m)` über beide Listen gesucht — eine
Identitätssuche mit quadratischem Aufwand für eine Information, die beim
Zusammenführen der Listen bekannt war.

**Die Karte ist leer.** Zwischen den Dörfern ist nichts. Ein Raster aus
`grid`-Linien und sonst Fläche.

## Zwei Ansichten mit festem Zoom

```
┌ Nahansicht ────────────────────────┐  ┌ Übersichtskarte ───────┐
│              ▲                     │  │                        │
│  ◀   Dörfer, Namen, Gelände    ▶   │  │   ganze Welt,          │
│              ▼                     │  │   1–2 px je Dorf,      │
│                                    │  │   ▭ = Ausschnitt links │
└────────────────────────────────⇲───┘  └───────────────────⇲────┘
```

Beide haben **festen Zoom** und sind **in der Größe veränderbar**; die Seite selbst
scrollt nicht.

- **Nahansicht** (links, groß): ≈ 40 px/Feld. Dorfsprites mit Namen, nicht nur
  Koordinaten — `MapVillage.name` liegt bereits vor, `MapCanvas.tsx:151` zeichnet
  heute nur `x|y`. Verschieben per Ziehen und über vier Pfeilknöpfe am Rand
  (wie in der Vorlage). Kein Mausrad-Zoom.
- **Übersichtskarte** (rechts, klein): die ganze Welt eingepasst, ein bis zwei
  Pixel je Dorf, gefärbt nach Besitzer. Ein helles Rechteck zeigt den Ausschnitt
  der Nahansicht; ein Klick springt dorthin.

**Veränderbare Größe** statt Zoom: Beide Rahmen bekommen `resize: both` und einen
`ResizeObserver`, der die Auflösung des Canvas auf Elementgröße ×
`devicePixelRatio` setzt und neu zeichnet. Damit fällt die feste Backing-Store-Größe
weg und mit ihr die Unschärfe. Die gewählte Größe wird im `MapStore` gehalten, damit
sie einen Seitenwechsel überlebt.

`useMapCamera.ts` verliert damit den Zoom-Zweig vollständig; `Camera` schrumpft auf
`{ x, y }`. Der Treffertest beim Klick bleibt, ebenso der bestehende Umgang mit dem
Unterschied zwischen Ziehen und Klicken (≤ 5 px = Klick).

Zusätzlich ein Knopf „Zum eigenen Dorf" und Pfeiltastenbedienung, damit die Karte
ohne Maus benutzbar ist.

## Helleres Kartenbild

`MAP_COLORS.ground` wird zu einem Grünton, das Raster entsprechend dunkler statt
heller. Die Dorffarben (`own`, `enemy`, `barbarian`, Umrandungen) müssen darauf neu
abgestimmt werden.

Wichtig: Die Legende in `MapView.tsx` speist sich bereits aus `MAP_COLORS` — das
war ein Befund aus Plan 11 und muss so bleiben, sonst driften Legende und Karte
wieder auseinander. Alle neuen Paarungen kommen in `scripts/check-contrast.mjs`;
die Beschriftungen auf der Karte (`MAP_COLORS.label`) müssen auf dem hellen Grund
AA erreichen, was mit dem bisherigen Pergamentton **nicht** mehr der Fall sein wird.

## Marker auf dem Bewegungsstrahl

Die Position einer Truppe ist heute nicht berechenbar, weil `MovementInfo` keinen
Abflugzeitpunkt trägt (`packages/shared/src/schema/api.ts:191-199`). In der
Datenbank steht er längst: `departureGameTime` in
`packages/server/src/db/schema.ts:118`. Nur `describe()` in
`packages/server/src/api/routes.ts:468-484` lässt das Feld fallen.

Zu tun:

1. `departureGameTime: GameTimeSchema` in `MovementInfoSchema` ergänzen.
2. Das Feld in `describe()` mit ausgeben. **Auch bei eingehenden Feindbewegungen** —
   verborgen bleibt nur die Truppenzusammensetzung (`units: null`), nicht die
   Tatsache, dass etwas unterwegs ist; die Ankunftszeit wird ja bereits verraten.
3. Im Renderer den Fortschritt `p = (now − departure) / (arrival − departure)`
   gegen `world.gameTime` bilden, auf `[0, 1]` begrenzen und das Symbol des
   jeweiligen `kind` an der interpolierten Stelle zeichnen. `KIND_ICONS` aus
   `features/map/MovementsPanel.tsx:15-20` liefert die Zuordnung bereits.

Dabei `MapCanvas.tsx:85-100` aufräumen: die Richtung beim Zusammenführen der beiden
Listen mitführen, statt sie per `includes` zurückzusuchen.

## Gelände aus dem Seed

**Entschieden:** deterministisch berechnet, kein Datenbankschema, keine Migration.
Die Welt trägt bereits einen `seed` (`packages/shared/src/schema/world.ts:44`);
Client und Server rechnen dasselbe Ergebnis aus.

Neues reines Modul `packages/shared/src/logic/terrain.ts`:

```ts
export type Terrain = 'plain' | 'forest' | 'hill' | 'water';

export function terrainAt(seed: number, x: number, y: number): Terrain;
```

Umgesetzt als Wertrauschen über dem vorhandenen `createRng`
(`packages/shared/src/logic/rng.ts:6`): pro Gitterpunkt eines groben Rasters ein
Zufallswert aus `createRng(hash(seed, gx, gy))`, dazwischen interpoliert. Das ist
zustandslos und ortsunabhängig — `terrainAt` darf nicht von der Aufrufreihenfolge
abhängen, sonst zeichnet der Client anderes Gelände als der Server annimmt.
Anteile grob: rund 70 % `plain`, der Rest verteilt auf Wald, Hügel und Wasser, in
zusammenhängenden Flecken statt als Streusel.

**Sperrt Bauplätze:** `pickFreeSpot()` in
`packages/server/src/engine/mapgen.ts:60-78` lehnt zusätzlich zu belegten Feldern
und dem Mindestabstand zum Zentrum auch Felder ab, auf denen `terrainAt(...)`
nicht `plain` liefert. Die Schleife läuft bereits 10 000 Versuche und wirft
danach `'Map too crowded'`; bei 30 % gesperrter Fläche bleibt das reichlich
Spielraum, sollte aber mit einer vollen kleinen Karte (`mapSize: 20`) getestet
werden.

**Das Heimatdorf im Zentrum ist die Ausnahme.** Es wird in
`mapgen.ts:130-134` fest auf `⌊size/2⌋` gesetzt, ohne `pickFreeSpot`. Dort muss das
Gelände entweder ebenfalls geprüft und der Platz notfalls verschoben werden, oder
das Zentrumsfeld gilt per Definition als `plain`. Zweites ist einfacher und
verhindert, dass eine Welt beim Anlegen scheitert.

**Bestandswelten:** Deren Dörfer stehen schon und können in einem See liegen.
Regel im Renderer: **auf einem belegten Feld wird nie Gelände gezeichnet.** Damit
sehen alte Welten stimmig aus, ohne dass etwas migriert werden muss.

**Reisezeit bleibt Luftlinie.** `packages/shared/src/logic/travel.ts` wird nicht
angefasst — bewusst, weil Client-Vorschau und Server-Engine dieselbe Funktion
benutzen und jede Änderung dort beide Seiten und die Kampftests berührt.

Neue Sprites: `terrain.forest`, `terrain.hill`, `terrain.water`, 32×32. Die
Größenkarte `EXPECTED_SIZE` in `scripts/check-assets.mjs:27` braucht einen Eintrag
für den neuen Ordner.

## Dorfwechsel über die Karte

Klickt man ein eigenes Dorf an, zeigt `features/map/TargetPanel.tsx` „Zu diesem
Dorf wechseln" und navigiert auf `/worlds/$worldId/village/$villageId`. Das ist der
dritte Bedienweg aus 18-1 und schließt Punkt 4 der Anforderung ab.

## Kartendaten aktualisieren

`map.load()` läuft heute genau einmal beim Öffnen der Welt (`RootStore.ts:89`).
Erobert ein Bot ein Dorf, bleibt es in der Anzeige beim alten Besitzer, bis man die
Welt neu öffnet. Im `handleSocketMessage`-Verteiler (`RootStore.ts:143-175`) auf
`movement` und `village_updated` nachladen — die Liste ist klein und die
Nachrichten sind selten genug.

## Verifikation

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün, Kontrastskript
  ohne Verstöße bei den neuen Kartenfarben.
- `terrainAt` hat Tests in `packages/shared/test/`: gleicher Seed ergibt gleiches
  Gelände, unterschiedliche Seeds ergeben unterschiedliches, die Reihenfolge der
  Aufrufe ändert nichts, und die Anteile liegen für einen Beispiel-Seed im
  erwarteten Bereich.
- Server-Test: eine Welt mit `mapSize: 20` und maximaler Dorfzahl lässt sich
  anlegen, ohne dass `pickFreeSpot` aufgibt; kein erzeugtes Dorf steht auf einem
  Feld, das nicht `plain` ist.
- Im Browser:
  1. Die Karte ist auf einen Blick lesbar; Dörfer, Gelände und Namen sind ohne
     Kneifen unterscheidbar.
  2. Beide Rahmen lassen sich an der Ecke ziehen, der Inhalt bleibt scharf
     (Beleg: eine Rasterlinie ist genau einen Pixel breit).
  3. Die Seite bekommt in keiner Größe eine senkrechte Bildlaufleiste.
  4. Das Rechteck in der Übersichtskarte folgt der Nahansicht, ein Klick dort
     springt an die richtige Stelle.
  5. Truppen abschicken: das Symbol erscheint am Ursprung, wandert sichtbar über
     die Strecke und trifft mit dem Ablauf des `Countdown` am Ziel ein.
  6. Ein eigenes Dorf anklicken → „Zu diesem Dorf wechseln" führt dorthin und die
     Dorfleiste zeigt das neue Dorf.
  7. Zwei Welten mit demselben Seed zeigen dasselbe Gelände, zwei mit
     unterschiedlichem Seed nicht.
  8. In einer vor diesem Ticket angelegten Welt liegt kein Dorf sichtbar im Wasser.
- Bildschirmfoto neben `ideas/assets/Karte_beispiel.png`.
