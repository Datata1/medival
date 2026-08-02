# Plan 12: Assets — Pixel-Art-Sprites statt Emojis

**Status:** ✅ erledigt (2026-08-01) · **Voraussetzung:** [Plan 11](11-mittelalterliches-design.md)

> **Ergebnis:** **Alle 15 Emojis sind verschwunden**, auch die aus dem Sprachkatalog.
> An ihrer Stelle stehen 36 Pixel-Art-Sprites (zusammen 4,7 kB): UI-Symbole,
> zehn Gebäude, sieben Einheiten und drei Kartendörfer. Registry, `<Icon>`,
> Atlas-Laden mit Rückfall und die Anleitung zum Selberzeichnen stehen.
>
> **Im Browser verifiziert:** 36 von 36 Icons geladen, alle mit
> `image-rendering: pixelated`; Canvas mit abgeschaltetem Smoothing; Hineinzoomen
> bleibt scharf; ein absichtlich zerstörtes Sprite lässt die Karte weiterzeichnen
> (23 Farben statt leer), protokolliert eine Warnung und wirft keinen Fehler.
>
> **Drei Befunde, die erst die Verifikation gezeigt hat:**
> - `image-rendering: pixelated` griff **nirgends**: Tailwinds Kurzschreibweise
>   `[image-rendering:pixelated]` wurde nicht angewendet, und der Canvas hatte gar
>   keine Regel. Letzteres wog schwerer — der Canvas ist intern 720 px breit und
>   wird per CSS gestreckt, sodass der Browser das fertige Bild interpolierte und
>   `imageSmoothingEnabled = false` wirkungslos blieb. Jetzt eine echte
>   `.pixelated`-Klasse in `styles.css`, die auch für `canvas` gilt.
> - Vite bettete die Sprites als **Data-URIs** ins JavaScript ein (Standard bei
>   Dateien unter 4 kB). Das hätte bedeutet: winzige Platzhalter verhalten sich
>   anders als größere eigene Zeichnungen, und ein ausgetauschtes Sprite hätte
>   einen neuen JS-Download nach sich gezogen. Mit `assetsInlineLimit` für PNGs
>   werden sie jetzt immer als Datei ausgeliefert — das JS-Bundle wurde dadurch
>   sogar 6 kB kleiner.
> - Die Kartenlegende zeigte weiterhin Farbflächen, während die Karte längst
>   Sprites malte. Sie zeigt jetzt dieselben Sprites.
>
> **Abweichungen von der Planung:**
> - Gebäude- und Einheiten-Icons sind 16×16 statt 32×32 — sie stehen in Tabellen,
>   wo 32 px zu groß wären. Nur die Kartendörfer sind 32×32.
> - Die Platzhalter-Kartendörfer entstehen aus 16×16-Definitionen mit doppelter
>   Skalierung, damit die Pixelkarten im Quelltext lesbar bleiben. Eigene Sprites
>   sollten echte 32×32 sein.
> - Zusätzlich zum geplanten Umfang: Icons in Bau- und Rekrutierungsschleife,
>   Truppenliste, Tab-Leiste, Pause-Knopf und den Sende-Knöpfen.
>
> **Nebenbefund:** Die Größenprüfung im PNG-Schreiber fing beim ersten Lauf drei
> um ein Zeichen zu kurze Zeilen in den Sprite-Definitionen ab — genau der
> Tippfehler, der sonst ein verschobenes Bild ergeben hätte.

## Kontext

Die Oberfläche benutzt 15 verschiedene Emojis als Behelfs-Icons — 🪵 für Holz, ⚔️ für
Angriffe, 🏰 für Eroberungen. Das hat zwei Probleme über den Stil hinaus:

1. **Emojis sehen auf jedem System anders aus.** Apple, Windows, Android und Linux
   rendern dieselbe Codepoint völlig unterschiedlich; ein einheitliches mittelalterliches
   Bild ist damit unmöglich.
2. **Sie stecken im Sprachkatalog.** In `src/i18n/de.ts` steht `tabVillage: '🏠 Dorf'` —
   Bildsprache ist dort falsch aufgehoben: Ein Icon ist keine Übersetzung, und bei einer
   zweiten Sprache würde man es mitkopieren.

Dazu zeichnet `features/map/MapCanvas.tsx` Dörfer als farbige Rechtecke.

Entschieden (mit Nutzer): **Pixel-Art**. Für Nicht-Illustratoren die zugänglichste
Technik — kleine Raster verzeihen zeichnerische Schwächen, und das Ergebnis wirkt trotzdem
zusammenhängend. Dieses Dokument ist deshalb zweiteilig: erst die Integration, dann die
Anleitung zum Selbermachen.

---

# Teil A — Integration

## Ablage und Registry

```
src/assets/
  fonts/                    (aus Plan 11)
  sprites/
    buildings/headquarters.png  timber_camp.png  …
    map/village-player.png      village-bot.png  village-barbarian.png
    icons/wood.png              clay.png  iron.png  population.png  …
    units/spear.png             axe.png  …
  registry.ts
  palette.gpl
```

`registry.ts` ist ein **typisierter Katalog** nach dem Muster des i18n-Katalogs aus
Plan 07:

```ts
export const SPRITES = {
    'icon.wood': woodUrl,
    'building.headquarters': hqUrl,
    …
} as const;
export type SpriteId = keyof typeof SPRITES;
```

Ein Tippfehler in `<Icon name="wodd" />` ist damit ein Compile-Fehler, kein leeres Bild.
Vite hasht die Dateien beim Bauen, sodass sie dauerhaft cachebar sind.

## Verwendung

- **UI:** eine `<Icon name="icon.wood" size={16} />`-Komponente unter `src/components/`.
  Sie bleibt pure (Plan 05) und trägt `alt=""` plus `aria-hidden`, weil daneben immer der
  übersetzte Text steht — ein Icon soll nichts doppelt vorlesen.
- **Alle 15 Emojis verschwinden**, auch die aus `i18n/de.ts`. Text bleibt Text, Bild wird
  Bild: `tabVillage: 'Dorf'` plus `<Icon name="icon.village" />` in der Komponente.
- **Karte:** `MapCanvas` zeichnet Sprites statt Rechtecke. Zwingend dabei:
  `ctx.imageSmoothingEnabled = false` und `image-rendering: pixelated` im CSS — sonst
  verwaschen die Pixel beim Zoomen zu Matsch.
- **Laden:** ein `useSpriteAtlas`-Hook lädt die Kartensprites einmalig und meldet
  Bereitschaft; gezeichnet wird erst danach.

## Fallback statt leerer Karte

Fehlt ein Sprite (Datei gelöscht, Ladefehler), zeichnet die Karte die bisherige Farbfläche
und die UI zeigt ein neutrales Kästchen. Ein fehlendes Bild darf niemals dazu führen, dass
die Karte leer bleibt — beim Austausch eigener Assets passiert genau das sonst ständig.

## Platzhalter

`scripts/generate-placeholder-assets.mjs` erzeugt stilkonforme Sprites in der Palette aus
Plan 11. PNG wird dabei **ohne Fremdbibliothek** geschrieben: Nodes eingebautes `zlib`
reicht für IHDR, IDAT und IEND. So ist die Pipeline vom ersten Tag an sichtbar, und jeder
Platzhalter lässt sich einzeln durch eine eigene Datei ersetzen — gleicher Name, gleiche
Größe, fertig.

---

# Teil B — Eigene Sprites erstellen

## Werkzeug

- **LibreSprite** — kostenlos, quelloffen, Fork von Aseprite. Für den Anfang völlig
  ausreichend.
- **Aseprite** — ~20 €, der Industriestandard für Pixel-Art; komfortabler bei Animationen.
- **Piskel** — läuft im Browser, keine Installation, gut zum Ausprobieren.

## Verbindliche Konventionen

| Was | Größe | Hinweis |
|---|---|---|
| UI-Icons | 16×16 | einfache Silhouette, kein Detail |
| Gebäude | 16×16 | stehen in Tabellenzeilen — größer wäre zu wuchtig |
| Einheiten | 16×16 | seitlich stehend, Blick nach rechts |
| Dörfer (Karte) | 32×32 | werden skaliert gezeichnet, brauchen Reserve |

Immer: transparenter Hintergrund, PNG, **keine Zwischengrößen** (keine 20×20-Sprites).
`pnpm check:assets` weist ein falsches Maß ab, bevor es in der Oberfläche auffällt.

**Die Palette ist verbindlich.** `src/assets/palette.gpl` (aus den Farben von Plan 11)
lässt sich in LibreSprite und Aseprite direkt laden. Assets aus einer gemeinsamen Palette
wirken zusammengehörig, selbst wenn sie unterschiedlich gut gezeichnet sind — das ist der
größte Hebel für ein stimmiges Gesamtbild.

## Die zwei Regeln, die am meisten bringen

1. **Licht kommt immer von oben links.** Also: obere und linke Kanten hell, untere und
   rechte Kanten dunkel. Konsequent angewandt wirken selbst einfache Formen plastisch.
2. **Konturen nie in Schwarz**, sondern in einem dunkleren Ton derselben Farbe. Schwarze
   Umrisse lassen Pixel-Art billig und ausgeschnitten aussehen.

Dazu: erst die Silhouette, dann Details. Wenn die Form bei 100 % Zoom nicht erkennbar ist,
helfen Details nicht — sie machen es schlimmer.

## Arbeitsablauf

1. Neue Datei in der richtigen Größe anlegen, Palette laden.
2. Unter dem Registry-Namen speichern, z. B.
   `src/assets/sprites/buildings/barracks.png`.
3. `pnpm dev` läuft bereits — Vite lädt das Bild sofort neu.
   Kontrolle mit `pnpm check:assets`.
4. Neues Motiv? Zusätzlich einen Eintrag in `registry.ts` ergänzen; der Compiler zeigt
   danach, wo es verwendet werden kann.

## Checkliste zum Abnehmen eines eigenen Sprites

- [ ] Richtige Größe, keine Zwischenmaße
- [ ] Nur Farben aus `palette.gpl`
- [ ] Hintergrund vollständig transparent (keine weißen Restpixel an den Rändern)
- [ ] Bei 100 % Zoom erkennbar, nicht nur vergrößert
- [ ] Licht von oben links, Kontur nicht schwarz
- [ ] Auf hellem *und* dunklem Grund geprüft (UI ist Pergament, Karte ist dunkel)

## Verifikation

- `scripts/check-assets.mjs`: Jede `SpriteId` hat eine Datei, jede Datei einen Eintrag —
  keine Karteileichen, keine toten Verweise.
- `grep` findet kein Emoji mehr in `packages/client/src` (auch nicht im Sprachkatalog).
- Karte zeigt Sprites; Hineinzoomen bleibt scharf statt verwaschen.
- Ein absichtlich gelöschtes Sprite fällt sichtbar auf die Farbfläche zurück, ohne Fehler
  in der Konsole.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün; Bundle-Zuwachs gemessen
  und hier festgehalten.
