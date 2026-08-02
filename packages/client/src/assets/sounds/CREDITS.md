# Klänge — Herkunft und Lizenzen

Diese Datei ist die **Lizenzbuchhaltung**. Jeder übernommene Klang wird hier
eingetragen, bevor er im Spiel landet. Bei einem quelloffenen Projekt ist ein
nicht nachgewiesener Klang genauso ein Problem wie ein nicht nachgewiesenes Bild
— nur fällt es später auf und ist dann mühsam zurückzuverfolgen.

## Aktueller Bestand

Alle sechs Dateien sind **selbst synthetisierte Platzhalter** aus
`scripts/generate-placeholder-sounds.mjs` — kein fremdes Material, keine
Lizenzpflicht. Sie gehören zum Projekt und stehen unter dessen Lizenz.

| Datei | Klang | Anlass |
|---|---|---|
| `attack-incoming.wav` | Zwei Hornstöße, aufsteigend (g→c) | Ein Angriff ist unterwegs |
| `build-complete.wav` | Amboss-Schlag mit Nachklang | Ein Bau ist fertig |
| `report-arrived.wav` | Papierrascheln | Ein neuer Bericht liegt vor |
| `troops-sent.wav` | Drei gedämpfte Marschtritte | Truppen sind abgeschickt |
| `click.wav` | Kurzer, leiser Klick | Bestätigung |
| `denied.wav` | Zwei absteigende Töne | Eine Aktion ist fehlgeschlagen |

Neu erzeugen mit `pnpm sounds:generate` — die Synthese ist deterministisch,
dieselben Dateien entstehen Bit für Bit erneut.

## Eigene oder fremde Klänge übernehmen

Eine Datei wird ersetzt, indem sie **unter demselben Namen** hier abgelegt wird.
Das Format muss nicht exakt übereinstimmen (der Browser dekodiert auch OGG und
MP3), aber der Dateiname im Katalog `src/audio/sounds.ts` muss passen.

**Worauf es beim Format ankommt:** WAV ist unkomprimiert und wächst schnell —
die sechs Platzhalter belegen bei 22 050 Hz zusammen rund 169 kB. Längere oder
hochwertigere Klänge gehören deshalb als **OGG Vorbis** hierher; dann ist auch
44 100 Hz unproblematisch.

**Worauf es beim Klang ankommt:** kurz (unter zwei Sekunden), ohne Stille am
Anfang, und im Pegel zu den anderen passend. Ein Effekt, der beim fünfzigsten Mal
nervt, ist der falsche Effekt — deshalb sind Klick und Fehlerlaut bewusst leise.

## Brauchbare Quellen

| Quelle | Lizenz | Hinweis |
|---|---|---|
| [freesound.org](https://freesound.org) | gemischt — **auf CC0 filtern** | Größte Sammlung; die Lizenz steht pro Datei, nicht pro Sammlung |
| [OpenGameArt.org](https://opengameart.org) | gemischt, viel CC0 | Auf Spiele zugeschnitten, oft ganze Klangsätze aus einer Hand |
| [Kenney.nl](https://kenney.nl/assets) | CC0 | Sehr einheitliche Sätze, eher moderner UI-Klang |
| [sonniss.com/gameaudiogdc](https://sonniss.com/gameaudiogdc) | frei, auch kommerziell | Jährliche Sammlung in Studioqualität, sehr umfangreich |

**CC0** ist der einfachste Fall: keine Namensnennung nötig, keine Bedingungen.
Bei **CC-BY** ist die Namensnennung Pflicht — dann gehören Urheber, Titel und
Quell-URL zwingend in die Tabelle unten. **Nicht** übernehmen: Material mit
`NC` (nicht kommerziell) oder `ND` (keine Bearbeitung); beides verträgt sich
schlecht mit einem quelloffenen Projekt, das jeder weiterverwenden darf.

## Übernommene Klänge

_(bislang keine — alles selbst erzeugt)_

Aufbau eines Eintrags, sobald der erste hinzukommt:

```
### attack-incoming.wav
- **Titel:** Kriegshorn
- **Urheber:** …
- **Quelle:** https://freesound.org/s/…
- **Lizenz:** CC0 1.0
- **Bearbeitet:** auf 1,4 s gekürzt, Pegel angepasst
```
