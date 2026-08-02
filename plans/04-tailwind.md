# Plan 04: Tailwind CSS statt Hand-CSS

**Status:** ✅ erledigt (2026-08-01)

> Umsetzungsnotizen: Tailwind 4.3 (CSS-first, @theme mit Spielfarben timber/panel/bark/
> parchment/muted/gold/blood/error). Button (Varianten primary/danger/tab/link), Card und
> Table/Th/Td als Komponenten unter src/components/. styles.css = 37 Zeilen (Import, Theme,
> Base-Layer). styles.css ist von Biome ausgenommen (CSS-Parser kennt @theme/@apply nicht).
> Browser-Smoke-Test aller vier Ansichten: visuell äquivalent, keine Console-Fehler. · **Nutzer-Punkt:** 2

## Kontext

`packages/client/src/styles.css` ist eine gewachsene, handgeschriebene Klassensammlung
(~300 Zeilen: `.card`, `.row`, `.queue`, `.report-row`, …). Das skaliert schlecht: Klassen
und Komponenten driften auseinander, Naming ist ad hoc. Umstellung auf **Tailwind v4**
(CSS-first-Konfiguration, kein `tailwind.config.js` nötig).

## Schritte

1. **Setup:** `pnpm --filter @medival/client add -D tailwindcss @tailwindcss/vite`;
   Plugin in `packages/client/vite.config.ts` registrieren.
2. **Theme:** `styles.css` ersetzen durch:
   ```css
   @import 'tailwindcss';

   @theme {
     --color-parchment: #e8ddcc;   /* bisher --text */
     --color-timber:    #1a1610;   /* --bg */
     --color-panel:     #262019;
     --color-bark:      #3d332a;   /* --border */
     --color-muted:     #9c8f7c;
     --color-gold:      #c8973f;   /* --accent */
     --color-blood:     #b5483a;   /* --danger */
   }
   ```
   Danach stehen `bg-timber`, `text-gold`, `border-bark` usw. als Utilities bereit.
   `color-scheme: dark` und Basics (body-Font) in einer kleinen `@layer base`.
3. **Komponentenmuster statt @apply:** Wiederkehrende Muster werden kleine React-Komponenten
   (Vorgriff auf Plan 05, hier nur die zwei häufigsten):
   - `Card` (`rounded-lg border border-bark bg-panel p-4 mb-4`)
   - `Button` mit Varianten `primary` (gold) / `danger` (blood) / `ghost` (Tabs, link-btn)
   Ablage unter `src/components/`.
4. **Migration pro Datei** (Reihenfolge: Lobby → WorldView → VillagePanel → MapView →
   ReportsView): `className`-Strings auf Utilities umstellen; Spezialfälle:
   - Tabellen (`table.buildings`) → Utility-Klassen an `th/td` bzw. eine kleine
     `Table`-Komponente.
   - `.map-canvas` (Cursor, touch-action) → Utilities `cursor-grab active:cursor-grabbing touch-none`.
   - `font-variant-numeric: tabular-nums` → `tabular-nums`-Utility.
   - Legenden-Punkte, Badge, Countdown → Utilities inline.
5. **Aufräumen:** alte Klassen aus `styles.css` löschen, sobald keine Referenz mehr existiert
   (grep über `className="…"`). Ziel: `styles.css` < 40 Zeilen (Import + Theme + Base).

## Verifikation

- `pnpm build` (Tailwind purged korrekt), `pnpm lint`.
- Browser-Smoke-Test (headless Chrome wie in M1/M2): Screenshots von Lobby, Dorf, Karte,
  Berichte — visuell äquivalent zum Ist-Zustand (Farben/Abstände dürfen minimal abweichen,
  Layout muss identisch funktionieren).
- Keine toten CSS-Klassen mehr: grep nach den alten Klassennamen ergibt nur noch Treffer
  in styles.css-Historie/keine.
