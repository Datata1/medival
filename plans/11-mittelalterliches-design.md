# Plan 11: Mittelalterliches Design — Pergament & Tinte

**Status:** ✅ erledigt (2026-08-01)

> **Ergebnis:** Pergament & Tinte steht — 10 Farbtoken, zwei selbst gehostete
> Schriften (95 kB gesamt), neu gestaltete `Card`, `Button`, `Table` und
> Ressourcenleiste. Alle **13 Farbkombinationen erfüllen WCAG AA**, geprüft von
> `scripts/check-contrast.mjs` in `pnpm lint`.
>
> **Das Kontrastskript hat sich sofort bezahlt gemacht:** Der erste Entwurf hatte
> drei Verstöße, die nach Augenmaß nicht aufgefallen wären — Nebentext auf
> Zebrastreifen lag bei 4.49:1 statt der geforderten 4.50:1, die Knopfschrift auf
> Eiche bei 3.83:1, und der Fokusring auf dunklem Grund bei 2.05:1. Korrigiert
> wurden `ink-light` (#6b5a45 → #63523f) und `oak` (#8a6f47 → #755d3c); für
> dunkle Flächen kam ein eigener Fokuston `focus-dark` dazu, weil Siegelrot dort
> zu schwach ist.
>
> **Weitere Befunde beim Umsetzen:**
> - Die Papierstruktur (zwei radiale Verläufe) kachelte und erzeugte sichtbare
>   Bänder, sobald die Seite höher war als ihr Inhalt — behoben mit
>   `background-repeat: no-repeat`, `background-attachment: fixed` und
>   `min-height: 100vh`.
> - Die Kartenlegende führte eigene Hex-Werte und driftete damit sofort von den
>   Kartenfarben ab. Beide speisen sich jetzt aus `MAP_COLORS` in `MapCanvas.tsx`
>   (Canvas kennt keine CSS-Variablen, deshalb liegen die Werte dort).
>
> **Abweichungen von der Planung:**
> - `gold-leaf` wurde von `#a67c2e` auf `#7a5a1e` abgedunkelt, damit Überschriften
>   auf Pergament die 4.5:1 erreichen; `moss` entsprechend auf `#3d5636`.
> - Cinzel liefert Google Fonts als **variable Schrift** aus — eine Datei deckt
>   400–700 ab statt zweier Schnitte.
> - Die Emojis fallen im hellen Design noch stärker auf als vorher. Das ist
>   erwartet und wird von [Plan 12](12-assets-und-sprites.md) aufgelöst.
>
> **Verifiziert:** Schriften laden nachweislich (`document.fonts`), Fokusring
> sichtbar (2px Siegelrot), Screenshots von Lobby, Dorf, Karte und Berichten,
> keine Konsolenfehler.

## Kontext

Das Spiel ist im Mittelalter angesiedelt, die Oberfläche sieht aber aus wie ein
Entwickler-Prototyp: acht Braun- und Goldtöne, System-Schrift, runde Ecken. Nichts daran
ist falsch — es erzählt nur nichts.

Ist-Zustand in `packages/client/src/styles.css`: 8 Farbtoken, `font-sans` (also die
Schrift des Betriebssystems), keine eigene Typografie.

Entschieden (mit Nutzer): **Pergament & Tinte** — heller Urkunden-Look. Das ist nicht nur
Geschmack: Die Oberfläche besteht überwiegend aus Tabellen (Gebäude, Truppen, Berichte,
Dorflisten), und lange Zahlenkolonnen liest man auf hellem Grund deutlich besser. Es ist
außerdem der Look, den *Die Stämme* selbst hatte.

## Palette

Ersetzt den `@theme`-Block in `packages/client/src/styles.css`. Die Namen bleiben als
Tailwind-Farben nutzbar (`bg-parchment`, `text-ink`, …).

| Token | Wert | Verwendung |
|---|---|---|
| `parchment` | `#f2e6d0` | Grundfläche, Karten |
| `parchment-dark` | `#e3d3b3` | Zebrastreifen, gedrückte Zustände |
| `ink` | `#3b2b1a` | Fließtext |
| `ink-light` | `#63523f` | Nebentexte, Beschriftungen |
| `seal` | `#8b2f22` | Akzent, Gefahr, eingehende Angriffe |
| `gold-leaf` | `#7a5a1e` | Überschriften, Hervorhebungen |
| `moss` | `#3d5636` | Erfolg, eigener Besitz |
| `oak` | `#755d3c` | Rahmen, Trennlinien, Nebenknöpfe |
| `timber` | `#241a10` | Kartengrund, Kontrastanker |
| `focus-dark` | `#c8973f` | Fokusring auf dunklem Grund |

Der dunkle `timber`-Ton bleibt bewusst erhalten: Die Canvas-Karte braucht einen dunklen
Grund, damit die Dörfer darauf leuchten, und die Kopfzeile rahmt das Pergament.

## Schriften — selbst gehostet, kein CDN

Ein self-hosted Spiel darf beim Start nicht ins Netz greifen. Die Schriftdateien
(OFL-lizenziert, als `.woff2`) liegen unter `src/assets/fonts/` und werden per
`@font-face` mit `font-display: swap` eingebunden.

- **Cinzel** — Überschriften, Knöpfe, Tabellenköpfe. Römisch-mittelalterliche Kapitalis:
  trägt den Ton, bleibt aber vollständig lesbar.
- **EB Garamond** — Fließtext, Tabellen, Zahlen. Historisch stimmig und exzellent lesbar,
  mit echten Kapitälchen und Mediävalziffern.

**Bewusst keine Fraktur für Fließtext.** Bei deutschen Texten mit Umlauten und langen
Zahlenkolonnen kippt Authentizität in Unlesbarkeit — das lange ſ und die ähnlichen
Versalien kosten mehr, als der Look bringt. Fraktur (z. B. UnifrakturMaguntia) bleibt
optional für den Spieltitel in der Lobby, also für genau ein Wort.

Zahlen in Tabellen behalten `tabular-nums`, damit Spalten ausgerichtet bleiben.

## Komponenten

Alle unter `packages/client/src/components/`, Präsentation bleibt pure (Plan 05):

- **`Card`** — geprägter Rahmen statt runder Box: doppelte Linie in `oak`, abgesetzte
  Ecken, leichte Papiertextur über einen wiederholbaren CSS-Verlauf (kein Bild, damit
  nichts nachgeladen wird).
- **`Button`** — Siegelknopf: `seal` für Hauptaktionen, `oak` für Nebenaktionen, sichtbar
  gedrückter Zustand. Die `tab`-Variante wird zur Registerlasche.
- **`Table`** — Kopfzeile in Tinte auf `parchment-dark`, Zebrastreifen, Trennlinien in
  `oak`.
- **`ResourceBar`** (`features/village/`) — als Schriftrolle mit eingerollten Enden.

## Barrierefreiheit ist Abnahmekriterium, nicht Nachgedanke

Ein hübsches Pergament, auf dem man Zahlen schlecht liest, hat das Ziel verfehlt.
Deshalb: **jede** Text-/Hintergrundkombination erreicht mindestens WCAG AA (4.5:1),
geprüft von `scripts/check-contrast.mjs` über die Theme-Werte — gemessen, nicht geschätzt.
Das Skript läuft in `pnpm lint` und kennt wie die anderen Prüfskripte einen Selbsttest.

Fokusringe bleiben deutlich sichtbar (`seal` auf hellem Grund); die Tastaturbedienung
wird dem Look nicht geopfert.

## Verifikation

- `scripts/check-contrast.mjs` meldet 0 Verstöße; Selbsttest bestanden.
- Browser-Screenshots von Lobby, Dorf, Karte, Berichte und Profilseite — alle Ansichten
  wirken aus einem Guss.
- Die Karte bleibt lesbar: dunkler Kartengrund gegen helles Panel, Dörfer klar
  unterscheidbar.
- Fokus mit der Tabulatortaste sichtbar durchlaufen.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
