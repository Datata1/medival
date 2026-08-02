# Assets

Alles Bildmaterial des Spiels. Ausführliche Begründungen und die Anleitung zum
Selberzeichnen stehen in [plans/12-assets-und-sprites.md](../../../../plans/12-assets-und-sprites.md);
hier steht das Nötigste zum Nachschlagen.

```
assets/
  fonts/       Cinzel + EB Garamond (OFL, siehe fonts/LICENSE.md)
  sprites/
    icons/     16×16  UI-Symbole (Rohstoffe, Aktionen, Zustände)
    buildings/ 16×16  Gebäude für die Bautabelle
    units/     16×16  Einheiten für die Rekrutierungstabelle
    map/       32×32  Dörfer auf der Karte
  palette.gpl  Farbpalette für LibreSprite / Aseprite
  registry.ts  typisierter Katalog aller Sprites
```

Das Tab-Symbol liegt bewusst nicht hier, sondern in
[../../public/](../../public/) — siehe unten.

## Ein eigenes Sprite einsetzen

1. In LibreSprite (kostenlos) oder Aseprite eine Datei in der **richtigen Größe** anlegen
   und `palette.gpl` laden.
2. Zeichnen. Zwei Regeln bringen am meisten: **Licht kommt von oben links**, und
   **Konturen nie in Schwarz**, sondern in einem dunkleren Ton derselben Farbe.
3. Als PNG mit transparentem Hintergrund **unter demselben Dateinamen** speichern, den der
   Platzhalter hat. An `registry.ts` ist nichts zu ändern.
4. `pnpm check:assets` bestätigt Größe und Vollständigkeit.

## Ein neues Motiv aufnehmen

Datei anlegen, dann `registry.ts` um eine Zeile ergänzen. Der Compiler zeigt anschließend
überall, wo die neue `SpriteId` verwendet werden kann — ein Tippfehler in
`<Icon name="…" />` ist ein Übersetzungsfehler, kein leeres Bild.

## Platzhalter

Die aktuellen Sprites sind Platzhalter, erzeugt von `pnpm assets:generate` aus lesbaren
Pixelkarten in `scripts/lib/sprite-definitions.mjs`. Sie lassen sich dort anpassen oder
einzeln durch eigene Zeichnungen ersetzen.

## Das Tab-Symbol

Es steht in `packages/client/public/`, nicht hier: Sprites holt der Bundler per
Import, das Tab-Symbol fragt der Browser von sich aus unter `/` an. `index.html`
verweist per Pfad darauf, also muss es unverändert ausgeliefert werden.

| Datei | Größen | Wofür |
|---|---|---|
| `favicon.ico` | 16, 32, 48 | Browserleiste, Lesezeichen, Verlauf |
| `favicon-192.png` | 192 | hochauflösende Kacheln, Android-Startbildschirm |
| `apple-touch-icon.png` | 180 | iOS-Startbildschirm |

Vorlage ist [ideas/assets/favicon_idea.png](../../../../ideas/assets/favicon_idea.png):
das Wappen — roter Schild, vierfach gefasster Rand, goldener steigender Löwe mit
Krone — vor rotem Hintergrund. Als Tab-Symbol taugt nur das Wappen selbst,
freigestellt.

Die Vorlage ist 2048×2048 groß, liegt aber auf einem Pixelraster von 100×100
Zellen (20,48 px je Zelle). Daraus wurde sie zurückgewonnen: je Zelle der
Mittelwert — das schluckt Rauschen und Papiertextur —, dann der Hintergrund von
außen geflutet bis zur dunklen Außenkontur und alles Erreichte transparent
gesetzt. Die Schildspitze fehlte, weil die Vorlage sie am unteren Bildrand
abschneidet; sie ist über fünf Zeilen bis zum Punkt ergänzt.

Ergebnis ist ein Wappen von 72×99 Zellen. Die drei Dateien entstehen daraus
durch Flächenmittelung, wobei das Wappen die volle Höhe füllt — bei 16 px zählt
jede Zeile. Das Apple-Symbol bekommt Rand und Pergamentgrund
(`--color-parchment`, `#f2e6d0`), weil iOS Transparenz sonst schwarz füllt.

Zum Ersetzen: ein Wappen von 72×99 (oder einem ganzzahligen Vielfachen) als
transparentes PNG zeichnen und die drei Dateien daraus skalieren.

## Prüfungen

| Befehl | Prüft |
|---|---|
| `pnpm check:assets` | Registry und Dateien decken sich, Maße stimmen |
| `pnpm assets:generate` | erzeugt die Platzhalter neu |

Beides läuft auch als Teil von `pnpm lint`.
