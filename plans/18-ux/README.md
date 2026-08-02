# Plan 18: UX-Überarbeitung

**Status:** 📋 offen · **Voraussetzung:** [Plan 11](../11-mittelalterliches-design.md),
[Plan 12](../12-assets-und-sprites.md)

Die Pläne 01–17 haben das Spiel vollständig gemacht: Es läuft, es rechnet, die Karte
lebt. Was fehlt, ist die Oberfläche. Sie ist über siebzehn Pläne hinweg mitgewachsen,
ohne je entworfen worden zu sein — vier Karteireiter, sechs gestapelte Karten, eine
Kartenansicht mit Mausrad-Zoom. Funktional vollständig, aber niemand hat je entschieden,
wie das Spiel sich anfühlen soll.

Dieser Plan ist deshalb kein einzelner Arbeitsschritt, sondern ein Ordner mit sechs
Tickets. Sie hängen bewusst nur lose zusammen: **18-1 zuerst** (alles andere lebt in
der Schale, die es aufspannt), danach ist die Reihenfolge frei.

| # | Ticket | Bereich | Status |
|---|---|---|---|
| 18-1 | [Rahmen & Kopfzeile](18-1-rahmen-und-kopfzeile.md) | client | ✅ erledigt |
| 18-2 | [Dorfübersicht, Gebäudeseiten & Dorfgrafik](18-2-dorfuebersicht.md) | client | 📋 offen |
| 18-3 | [Karte: Nahansicht, Übersicht & Gelände](18-3-karte.md) | client + shared + server | 📋 offen |
| 18-4 | [Berichte als eigene Seiten](18-4-berichte.md) | client + server | 📋 offen |
| 18-5 | [Rangliste, Profil & Einstellungen](18-5-rangliste-profil-einstellungen.md) | client + server | 📋 offen |
| 18-6 | [Nachrichten: Postfach mit Bot-Absendern](18-6-nachrichten.md) | server + shared + client | 📋 offen |

**Warum diese Reihenfolge?**

- **18-1 ist die Voraussetzung für alles andere.** Es spannt die zwei fixierten
  Leisten auf, hebt die Breitenbegrenzung von 1000 px an und legt Platzhalterrouten
  für Rangliste, Nachrichten, Profil und Einstellungen an. Ohne diese Schale müsste
  jedes andere Ticket sein eigenes Layout erfinden und später zurückbauen.
- **18-2, 18-3 und 18-4 sind danach unabhängig.** Sie berühren drei getrennte
  Feature-Ordner (`village/`, `map/`, `reports/`) und können in beliebiger
  Reihenfolge oder parallel entstehen. Einzige Überschneidung: 18-3 ergänzt
  `departureGameTime` in `MovementInfo`, wovon 18-2 profitiert, aber nicht abhängt.
- **18-5 füllt die Platzhalter aus 18-1** und ist deshalb erst danach sinnvoll.
- **18-6 zuletzt**, weil es als einziges Ticket ein neues Datenmodell mitbringt
  (Tabelle, Routen, WebSocket-Variante, Bot-Entscheidungen). Es ist auch das
  einzige, das ohne die anderen fünf keinen sichtbaren Nutzen hätte — ein
  Postfach ohne Kopfzeile erreicht niemand.

## Entwurfsentscheidungen

Vier Fragen waren offen und wurden mit dem Nutzer entschieden. Sie stehen hier
zentral, weil sie mehrere Tickets betreffen:

| Frage | Entscheidung | Betrifft |
|---|---|---|
| Wohin mit Gebäude- und Rekrutierungstabelle? | Die Übersicht wird ein Dashboard, jedes Gebäude bekommt eine **eigene Unterseite** mit zweiter Navileiste | 18-1, 18-2 |
| Wie weit geht die Dorfgrafik jetzt? | **Klickbare Platzhalter-Grafik sofort** — Mechanik vollständig, Sprites später austauschbar | 18-2 |
| Wie tief geht „Nachrichten"? | **Vollwertiges Postfach**, Bots schreiben abhängig von Ansehen und Diplomatie | 18-6 |
| Hindernisse auf der Karte: Optik oder Mechanik? | **Deterministisch aus `world.seed`**, sperren Bauplätze; Reisezeit bleibt Luftlinie | 18-3 |
| Was trägt die Kopfzeile? | **Nur Reiter** — vier links, Rangliste als Anker, vier rechts. Uhr in die Dorfleiste, Ton und Pause in die Einstellungen | 18-1, 18-5 |
| Neunter Reiter | **Handbuch**: Nachschlagewerk für Einheiten, Gebäude und Stufenwirkungen, gespeist aus `@medival/shared` | 18-1 |

## Vorlagen

Die Bildschirmfotos in `ideas/assets/` sind das gestalterische Ziel, nicht die
Farbvorlage — die Palette bleibt Pergament & Tinte aus [Plan 11](../11-mittelalterliches-design.md).

| Datei | Ticket |
|---|---|
| `beispiel_kopfzeile.png` | 18-1 |
| `Dorfübersicht.png` | 18-2 |
| `Karte_beispiel.png` | 18-3 |
| `bericht_beispiel.png` | 18-4 |

## Für alle sechs Tickets verbindlich

Diese Regeln stehen einmal hier statt sechsmal in den Tickets.

**Prüfungen.** Nach jedem Ticket sind `pnpm lint`, `pnpm typecheck`, `pnpm test` und
`pnpm build` grün. `pnpm lint` schließt fünf eigene Prüfskripte ein:

- **Keine Casts** (`scripts/check-no-casts.mjs`) — kein `as`, kein `!`. Routenparameter
  und Serverantworten werden mit zod geparst, nicht gecastet.
- **Schichten** (`scripts/check-layering.mjs`) — `api/client` nur aus `src/stores/`,
  `fetch(` nur in `src/api/`, `src/components/` importiert keine Stores.
- **Kontrast** (`scripts/check-contrast.mjs`) — jede neue Text-/Hintergrundkombination
  wird in `COMBINATIONS` eingetragen und erreicht WCAG AA. Das gilt ausdrücklich auch
  für die dunkle Kopfzeile aus 18-1 und den helleren Kartengrund aus 18-3.
- **Assets** (`scripts/check-assets.mjs`) — Registry und Sprite-Dateien müssen sich
  eins zu eins entsprechen, die Kantenlänge passt zum Namensraum. Neue Namensräume
  (`yard.*`, `terrain.*`) brauchen einen Eintrag in der Größenkarte des Skripts.
- **KI-Reinheit** (`scripts/check-ai-purity.mjs`) — `server/src/ai/decide/` bleibt frei
  von Seiteneffekten. Betrifft 18-6.

**Sprites.** Neue Symbole entstehen über `scripts/lib/sprite-definitions.mjs` +
`pnpm assets:generate` und werden in `packages/client/src/assets/registry.ts`
eingetragen. Handgezeichnete Ersetzungen kommen später; die Tickets bauen gegen die
Registry, nicht gegen Dateinamen.

**Texte.** Ausschließlich über `packages/client/src/i18n/de.ts`, gruppiert nach
Bildschirm, eine Verschachtelungsebene. Keine Emojis — Symbole sind Sprites.

**Töne.** Neue Klänge brauchen einen Eintrag in `SOUNDS` **und** in `SOUND_GAIN`
(`packages/client/src/audio/sounds.ts` — ein fehlender Gain ist ein Typfehler),
eine Lizenzzeile in `packages/client/src/assets/sounds/CREDITS.md` und einen
Auslöser in einer Store-Reaktion. Komponenten dürfen den `SoundStore` ansprechen
(Präzedenzfall: `MainNav` löst den Klick beim Reiterwechsel aus), nie die
`AudioEngine`.

**Tests.** Der API-Mock in `packages/client/test/stores.test.ts` wird von Hand
gepflegt — jede neue Methode auf dem API-Client muss dort ergänzt werden, sonst
scheitern die Store-Tests mit einem irreführenden Fehler.

**Formatierung.** Biome: vier Leerzeichen, Zeilenbreite 72, einfache Anführungszeichen.

## Nebenbefund

`scripts/generate-placeholder-sounds.mjs:9` und
`packages/client/src/assets/sounds/CREDITS.md:23` verweisen beide auf
`pnpm sounds:generate`. Dieses Skript steht nicht in der `package.json`; der
Generator lässt sich derzeit nur als `node scripts/generate-placeholder-sounds.mjs`
aufrufen. Wer als Erstes einen Klang ergänzt (18-1 oder 18-6), räumt das mit auf.
