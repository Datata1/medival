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

## Prüfungen

| Befehl | Prüft |
|---|---|
| `pnpm check:assets` | Registry und Dateien decken sich, Maße stimmen |
| `pnpm assets:generate` | erzeugt die Platzhalter neu |

Beides läuft auch als Teil von `pnpm lint`.
