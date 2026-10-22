# Ticket 19-6: Weltkarte 1000×1000, 100 Kontinente, kreisförmige Besiedlung

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** [19-5](19-5-bot-wahrnehmung-skalierbar.md), 18-3 committet · **Grundlage für:** [19-7](19-7-karten-api-ausschnitt.md), [19-9](19-9-welt-beitreten-und-rechte.md)

> **Ergebnis:** Karten bis 1000×1000 (Standard 1000), 100 Kontinente K00–K99. Die
> Besiedlung beginnt genau in der Mitte und wächst kreisförmig nach außen
> (`shared/logic/placement.ts`, pur): Das n-te Dorf liegt im Ring um
> `r(n) = √(n / (π·d))`. Es gilt ein Mindestabstand von 1 Feld, Ebene wird bevorzugt.
> Gibt es im Ring keinen Platz, wird der Ring breiter, zuletzt folgt eine
> deterministische Suche über den ganzen Kreis. Bots und Barbaren werden verzahnt
> platziert. Der Zähler `settled_count` liegt in der Meta-DB.
> `engine/settle.ts:settleNewPlayer` setzt neue Spieler mit `barbariansPerSettler`
> Barbaren an den Rand; 19-9 ruft es beim Beitreten auf. Neue Einstellungen:
> `settlementDensity` (Standard 0,15, max. 0,2) und `barbariansPerSettler` (Standard 2).
>
> **Gemessen:** 300 Bots + 2 000 Barbaren auf 1000×1000 werden in 0,63 s angelegt
> (Laptop) und liegen alle in K44/K45/K54/K55, höchstens 80 Felder von der Mitte.
> 5 000 Platzierungen (pur) brauchen ~60 ms. Am echten Server liegen in der Standardwelt
> (30 Bots, 80 Barbaren) alle 111 Dörfer innerhalb von 18 Feldern um (500|500).
> `GET /map` liefert 8 KB.
>
> **Tests:** `shared/test/placement.test.ts`: keine Doppel- und keine Nachbarbelegung,
> Beginn in der Mitte, Rundheit (≥ 95 % im Ring), Dichte im Zielband (±20 %), die ersten
> 300 Dörfer in den vier mittleren Kontinenten, Determinismus, Kontinente auf 1000×1000,
> volle Karte → `MapFullError`. `test/integration/settle.test.ts`: Weltstart,
> gleichmäßige Mischung Bots/Barbaren, 100 Ansiedlungen am Rand mit je zwei Barbaren
> (die sofort ticken), `map_full`, Zähler über Neustart.
>
> **Abweichungen von der Planung:**
>
> - **Das erste Dorf steht genau in der Mitte**, nicht mit Streuung. Dort beginnt die
>   Besiedlung, und bis 19-9 ist es das Dorf des Menschen.
> - **Neue Kapazitätsregel:** Statt „ein Dorf je vier Felder der ganzen Karte" gilt
>   `settlementCapacity(mapSize, density) = ⌊π·(mapSize/2 − 2)²·d⌋`. Der Test der
>   „randvollen 20×20-Karte mit 100 Dörfern" prüft deshalb jetzt eine Karte genau an
>   ihrer Kapazitätsgrenze (40 Dörfer bei Dichte 0,2), ebenfalls über vier Seeds.
> - **Höchstdichte 0,2 statt 0,5:** Mit Mindestabstand 1 lässt sich mehr nicht
>   verlässlich füllen (theoretisch 0,25 bei perfektem Raster).
> - **Übersichtskarte zeigt 100×100 Felder statt der ganzen Welt** (Rückmeldung des
>   Nutzers nach dem ersten Stand). Auf 1000×1000 war die Gesamtansicht ein Punktehaufen,
>   in dem sich einzelne Dörfer nicht erkennen ließen. Jetzt folgt ein Ausschnitt von
>   100×100 Feldern der Kamera, bleibt in der Welt und zeigt Kontinentgrenzen mit
>   Nummer. Kleine Welten werden ganz gezeigt (`miniWindow` in `features/map/derive.ts`,
>   getestet). Im Browser per Headless-Screenshot geprüft.
> - **Weltanlage-Formular** zeigt die neuen Einstellungen noch nicht. Die Kamera folgte
>   schon dem eigenen Dorf.

## Kontext

`generateMap` (`server/src/engine/mapgen.ts`) setzt den Spieler fest in die Mitte und würfelt
alle anderen Dörfer über die **gesamte** Karte (`pickFreeSpot`: `randInt(1, size − 2)` für x
und y, Mindestabstand zur Mitte 8 bzw. 3). `mapSize` ist auf 500 begrenzt
(`shared/src/schema/world.ts:16`). Für eine kleine Singleplayer-Karte ist das in Ordnung.
Für eine Mehrspielerwelt passen beide Eigenschaften nicht:

- **Tribal Wars besiedelt von innen nach außen.** Die Spieler stehen in einem dichten,
  runden Haufen in der Kartenmitte. Neue Spieler kommen an den Rand des Haufens, und der
  Haufen wächst mit jeder Anmeldung. Gleichmäßig verteilte Dörfer auf 1000×1000 hätten
  dagegen Abstände von 20+ Feldern. Niemand hätte Nachbarn, und Angriffe dauerten Tage.
- **Die Kontinent-Einteilung steht schon.** `continentOf` (`shared/src/logic/continent.ts`)
  rechnet `floor(y/100)·10 + floor(x/100)`. Auf 1000×1000 ergibt das genau **100
  Kontinente K00–K99**. Die Kartenmitte (500|500) liegt an der Ecke von K44, K45, K54 und
  K55. Hier ist keine Änderung nötig. Das Ticket muss nur sicherstellen, dass die
  Besiedlung dort beginnt.
- Das **Gelände** (`terrainAt`, 18-3) ist aus dem Seed berechnet und damit unabhängig von
  der Kartengröße. Es skaliert bereits.

Der Prototyp braucht keine Wunschrichtung (N/O/S/W), keine Platzierung nahe Freunden und
keine Premades. Das kommt im PoC.

## Kernentscheidung: Der Siedlungsradius ist eine Funktion der Dorfzahl

Bei einer Zieldichte `d` (Dörfer je Feld innerhalb des Kreises) braucht ein Kreis für `n`
Dörfer den Radius

```
r(n) = sqrt( n / (π · d) )
```

Das **n-te** Dorf wird in einem Ring um `r(n)` platziert, mit zufälligem Winkel und
radialem Jitter ±`RING_WIDTH`. So entsteht ohne weitere Regeln ein runder, gleichmäßig
dichter Haufen, der von innen nach außen wächst. Beispiele bei `d = 0.15`:

| Dörfer | Radius | Kontinente berührt |
|---|---|---|
| 300 | 25 | K44, K45, K54, K55 |
| 2 300 (300 Spieler + 2 000 Barbaren) | 70 | weiterhin nur die 4 inneren |
| 20 000 | 206 | ~32 (Kontinentspalten und -zeilen 2–7) |

`n` ist ein **Zähler in der Welt** (`worlds.settled_count`), kein `COUNT(*)`: Eroberte oder
gelöschte Dörfer verkleinern den Radius nicht wieder. Der Ring bewegt sich nur nach außen.

**Rein und deterministisch.** Die Platzierung ist eine pure Funktion in `shared`
(`(n, seed, rng, isFree) → {x, y}`) mit eigenem Zufallsstrom, wie es `mapgen.ts` heute
schon für `placeRng` begründet. Datenbankzugriff passiert nur über den hereingereichten
`isFree`-Rückruf.

**Barbaren wachsen mit.** Bei Weltstart entstehen Barbarendörfer im Anfangskreis. Danach
entstehen mit jedem neu angesiedelten Spieler `barbariansPerSettler` Barbarendörfer im
selben Ring (Einstellung, Standard 2). Sonst wären neue Spieler am Rand ohne Farmziele,
während die Mitte voller Barbaren steht.

## Umsetzung

### `shared/src/logic/placement.ts` (neu)

```ts
export function settlementRadius(n: number, density: number): number
export function placeVillage(input: {
    n: number; density: number; center: { x: number; y: number };
    mapSize: number; rng: Rng; seed: number;
    isFree: (x: number, y: number) => boolean;
}): { x: number; y: number }
```

- Bis zu 200 Versuche im Ring `r(n) ± RING_WIDTH` (Standard 3). Danach wird der Ring
  schrittweise verbreitert. So findet sich auch bei ungünstigem Gelände immer ein Platz.
- Zwei Durchgänge wie heute: erst nur `plain`, dann jedes freie Feld (Begründung aus
  `pickFreeSpot` übernehmen).
- **Mindestabstand 1 Feld zwischen Dörfern** (keine direkten Nachbarfelder). Er ist über
  `isFree` geprüft und hält den Haufen lesbar.
- Abbruch mit `GameError('map_full')`, wenn `r(n)` über `mapSize/2 − 1` liegt.

### `shared/src/schema/world.ts`

- `mapSize: … .max(1000)`, Default **1000**.
- Neu (mit `.default()`): `settlementDensity` (0.05–0.5, Standard 0.15),
  `barbariansPerSettler` (0–10, Standard 2).
- Die Invariante „Dörfer ≤ Fläche/4" wird zu „Startdörfer passen in den Kreis bis
  `mapSize/2`".

### `server/src/engine/mapgen.ts`

- `pickFreeSpot` entfällt, `generateMap` benutzt `placeVillage` in einer Schleife.
  `isFree` kombiniert die `taken`-Menge mit dem Mindestabstand.
- Reihenfolge beim Weltstart: Bots und Barbaren **gemischt** (je Bot
  `barbarianCount/botCount` Barbaren). So liegen die Barbaren nicht alle innen oder alle
  außen.
- Kein festes Heimatdorf in der Mitte mehr. Bis 19-9 bekommt der Mensch (`PLAYER_ID`) das
  **erste** Dorf (n = 0, also die Mitte). Danach tritt er wie alle anderen bei.
- `settled_count` wird nach der Erzeugung in die Meta-DB geschrieben.

### `server/src/engine/settle.ts` (neu)

`settleNewPlayer(world, playerId, name)` platziert das Dorf über `placeVillage`, legt die
Barbaren im selben Ring an, zählt `settled_count` hoch und startet die Barbaren-Ketten.
19-9 ruft das beim Beitreten auf. Bots, die später hinzukommen (Admin-Werkzeug), ebenso.

### Client

`mapSize` 1000 betrifft Kamera und Minimap aus 18-3 (`useMapCamera.ts`, `MiniMap.tsx`).
Die Kamera startet auf dem eigenen Dorf statt auf der Mitte. Das Nachladen der Karte ist
19-7. Bis dahin lädt der Client wie heute alles, was bei einigen tausend Dörfern noch geht.

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/logic/placement.ts` | **neu** — pure Platzierung |
| `shared/src/schema/world.ts` · `types.ts` · `index.ts` | Grenzen, neue Einstellungen |
| `shared/test/placement.test.ts` | **neu** |
| `server/src/engine/mapgen.ts` | `placeVillage` statt `pickFreeSpot`, gemischte Reihenfolge |
| `server/src/engine/settle.ts` | **neu** — `settleNewPlayer` |
| `server/src/engine/worldManager.ts` · `db/ddl.ts` | `worlds.settled_count` |
| `client/src/features/map/useMapCamera.ts` · `MiniMap.tsx` | Kartengröße 1000, Start auf eigenem Dorf |
| `client/src/features/lobby/CreateWorldForm.tsx` | neue Einstellungen |

## Verifikation

**Pur (`shared/test/placement.test.ts`):**

- 5 000 Platzierungen → keine Doppelbelegung, kein Dorf direkt neben einem anderen.
- **Rundheit:** Für 2 000 Dörfer liegt der Abstand des n-ten Dorfes zur Mitte innerhalb
  `r(n) ± RING_WIDTH + 2`. Die Dichte im Kreis `r(2000)` liegt bei `d ± 20 %`.
- **Von innen nach außen:** Die ersten 300 Dörfer liegen alle in K44, K45, K54 und K55.
- **Determinismus:** gleicher Seed → gleiche Koordinaten.
- `continentOf` auf 1000×1000: Ecken ergeben K00 und K99, die Mitte ergibt K55.
- Kartenrand: Bei `n` mit `r(n) > 499` kommt `map_full`, keine Endlosschleife.

**Integration:**

- Weltstart mit 300 Bots und 2 000 Barbaren auf 1000×1000 dauert < 5 s.
- `settleNewPlayer` × 100 → jedes neue Dorf liegt weiter außen als der Median der
  bestehenden, und je Spieler entstehen genau `barbariansPerSettler` Barbaren.
- **Browser:** Übersichtskarte zeigt einen runden Haufen in der Mitte, Kontinentlinien bei
  jeder Hunderterkoordinate.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
