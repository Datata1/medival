# Plan 13: Klang — Benachrichtigungen und Rückmeldung

**Status:** ✅ erledigt (2026-08-01) · **Voraussetzung:** [Plan 11](11-mittelalterliches-design.md)

> **Ergebnis:** Sechs synthetisierte Klänge (169 kB zusammen), ein `SoundStore` mit
> Lautstärke, Stummschaltung und `localStorage`, ein Lautsprecher mit Schieberegler
> in der Topbar. Ausgelöst wird ausschließlich aus Store-Reaktionen — keine
> Komponente kennt die Audioausgabe.
>
> **19 Store-Tests ohne Browser** (`packages/client/test/sound.test.ts`) und
> **10 von 10 Prüfungen im echten Browser:** ohne Interaktion entsteht kein
> `AudioContext`; nach dem ersten Klick läuft er und alle sechs Klänge sind
> dekodiert; das Öffnen einer Welt mit bestehenden Berichten bleibt still;
> Stummschaltung und Lautstärke (25 %) überleben einen Reload und der Kontext ist
> danach wieder gesperrt; Truppen abschicken klingt genau einmal; ein eintreffender
> Bericht meldet sich einmal und danach 20 Sekunden Polling ohne weiteren Alarm.
>
> **Zwei Befunde, die erst die Verifikation gezeigt hat:**
> - `village_updated` und `build_complete` teilten sich einen `case`-Zweig, sodass
>   der Amboss bei **jeder** Dorfänderung schlug — bei laufender Ressourcenzufuhr
>   ein Dauerhämmern. Der Browser-Test fing es als „1 Klang beim Betreten" ab.
> - Der `AudioContext` hatte eine `preload()`-Methode, die **niemand aufrief**.
>   `play()` stößt beim ersten Mal nur das Laden an und bleibt stumm — ausgerechnet
>   der erste Alarm wäre also verschluckt worden. `unlock()` lädt jetzt alles vorab.
>
> **Abweichungen von der Planung:**
> - Der Kontext wird nicht erst beim Klick auf ein Bedienelement entsperrt, sondern
>   beim allerersten `pointerdown` oder `keydown` irgendwo in der Anwendung
>   (`main.tsx`, `{ once: true }`). Sonst käme der erste Alarm nur, wenn der Spieler
>   zufällig vorher am Regler gezogen hätte.
> - Zusätzlich zur geplanten Klangliste: `denied` auch bei fehlgeschlagenem Bauen
>   und Rekrutieren, nicht nur beim Truppenversand.
> - Der Schieberegler brauchte eigene CSS-Regeln; das Standardelement des Browsers
>   ist hellblau und fällt neben Pergament und Siegellack sofort auf.
>
> **Nebenbefund:** Der Cast-Prüfer aus Plan 08 fing den Zugriff auf die
> `localStorage`-Einstellungen ab. Das war berechtigt — gespeicherte Werte stammen
> aus einer früheren Version oder aus der Entwicklerkonsole. Dort steht jetzt ein
> Zod-Schema statt eines Casts, geprüft gegen fünf Sorten kaputter Einträge.

## Kontext

Das Spiel läuft in Echtzeit weiter, während man eine andere Ansicht betrachtet: Gebäude
werden fertig, Berichte treffen ein, feindliche Truppen sind unterwegs. Heute erfährt man
davon nur, wenn man zufällig hinsieht — der Ungelesen-Zähler ist der einzige Hinweis, und
den sieht man auch nur auf dem richtigen Tab.

Klang löst genau dieses Problem: Er meldet Ereignisse, ohne dass man hinschaut. Bei einem
eingehenden Angriff ist das nicht Beiwerk, sondern der Unterschied zwischen reagieren und
verlieren.

Entschieden (mit Nutzer): **Benachrichtigungen plus dezentes UI-Feedback**, keine
Hintergrundmusik. Lautstärkeregler und Stummschaltung gehören von Anfang an dazu.

## Architektur

`packages/client/src/audio/` plus ein `SoundStore` unter `src/stores/`:

| Datei | Verantwortung |
|---|---|
| `stores/SoundStore.ts` | Lautstärke, Stummschaltung, „was klingt wann" |
| `audio/AudioEngine.ts` | Web Audio API: dekodieren, abspielen, entsperren |
| `audio/sounds.ts` | typisierter Katalog `SoundId → Datei` (Muster wie Plan 12) |
| `assets/sounds/*.wav` | die Klänge |

Lautstärke und Stummschaltung sind **Zustand**, kein Komponenten-Detail — sie gehören
damit in einen Store (Plan 09). Abgespielt wird über die Web Audio API statt über
`new Audio()`: geringere Latenz, saubere Lautstärkeregelung, und jeder Klang wird einmal
dekodiert und danach wiederverwendet.

Ausgelöst wird über die vorhandenen Store-Reaktionen — `RootStore.handleSocketMessage`
und die Polling-Stores —, **nicht** über neue Effekte in Komponenten. Ein Ton ist die
Folge eines Ereignisses, nicht des Renderns (Plan 06).

## Die drei Fallen, die sonst später schmerzen

1. **Autoplay-Sperre.** Browser verweigern Ton, bis der Nutzer die Seite angefasst hat.
   Ein `AudioContext`, der beim Laden erzeugt wird, startet im Zustand `suspended` und
   bleibt still — ohne Fehlermeldung. Deshalb: Kontext beim **ersten Klick** entsperren
   (`resume()`), einmalig, danach nie wieder.
2. **Einstellungen persistieren.** Lautstärke und Stummschaltung landen in `localStorage`.
   Sonst muss man nach jedem Neuladen wieder stumm schalten — und schaltet den Ton
   irgendwann dauerhaft ab.
3. **Keine Salve beim Nachladen.** Beim Öffnen einer Welt lädt der `ReportsStore` alle
   bestehenden Berichte, und das Polling liefert regelmäßig die volle Liste. Würde der
   Store „neuer Bericht" an der Listenlänge festmachen, gäbe es beim Betreten einer Welt
   zwanzig Hörner auf einmal. Regel: **Ton nur bei Zuwachs nach der ersten Ladung** — die
   erste Antwort setzt nur den Ausgangsstand.

## Ereignisse

| Ereignis | Klang | Auslöser |
|---|---|---|
| Eingehender Angriff | Alarmhorn (deutlich, länger) | neue Bewegung in `MovementsStore.incoming` |
| Kampfbericht eingetroffen | Papierrascheln | Zuwachs in `ReportsStore` |
| Gebäude fertig | Amboss | `build_complete` in `handleSocketMessage` |
| Truppen abgeschickt | Marschtritt (kurz) | erfolgreicher `sendUnits` |
| Klick / Fehler | dezent, leise | `Button`, Fehleranzeige |

Der Angriffs-Alarm ist bewusst der auffälligste Klang — er ist der einzige, bei dem
Nichtreagieren etwas kostet.

## Bedienung

Lautsprechersymbol mit Schieberegler in der Topbar (`features/world/Topbar.tsx`),
gestaltet nach Plan 11. Beschriftungen kommen in den Sprachkatalog (Plan 07); das Symbol
ist ein Sprite aus Plan 12.

## Platzhalter

`scripts/generate-placeholder-sounds.mjs` synthetisiert kurze WAV-Dateien — Hornstoß
(Sägezahn mit Hüllkurve), Amboss (gefiltertes Rauschen mit schnellem Abfall),
Papierrascheln, Klick. WAV-Header und PCM-Daten lassen sich ohne Fremdbibliothek
schreiben, genau wie die PNGs in Plan 12.

Für eigene Klänge: **freesound.org** und **OpenGameArt** (jeweils auf CC0 filtern).
Die Lizenz jedes übernommenen Klangs gehört in `src/assets/sounds/CREDITS.md` — auch bei
CC0, weil man sonst in einem Jahr nicht mehr weiß, was woher stammt.

## Verifikation

- **Store-Tests ohne Browser** (der Gewinn aus Plan 09): Ton nur bei Zuwachs, nicht bei
  der ersten Ladung; Stummschaltung unterdrückt zuverlässig; Lautstärke überlebt einen
  Neustart; ein unbekannter `SoundId` wirft nicht, sondern wird stillschweigend ignoriert.
  Die `AudioEngine` wird dafür als Schnittstelle injiziert — wie `WorldSocket` in Plan 09.
- **Browser-Test:** Ohne Interaktion startet kein Ton (Autoplay-Regel eingehalten); nach
  dem ersten Klick läuft der `AudioContext`; die Stummschaltung bleibt nach einem Reload
  erhalten.
- Ein Angriff im laufenden Spiel löst genau einen Alarm aus, kein Dauerfeuer beim Polling.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün; Größe der Klangdateien
  hier festgehalten.
