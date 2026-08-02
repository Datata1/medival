# Ticket 18-1: Rahmen & Kopfzeile

**Status:** ✅ erledigt (2026-08-02) · **Voraussetzung:** keine ·
**Vorlage:** `ideas/assets/beispiel_kopfzeile.png`, `ideas/assets/resourcen_leiste-beispiel.png`

> **Ergebnis:** Zwei klebende Leisten, neun Reiter, ein Dorfwechsel, der die
> Adresszeile nicht mehr belügt. Geprüft im echten Chrome über das
> DevTools-Protokoll — kein Konsolenfehler auf keiner der neun Seiten.
>
> **Der Entwurf hat drei Anläufe gebraucht, und jeder Fehler war einer, den man
> erst im Bild sieht:**
>
> 1. **Die Knöpfe rechts waren leer.** `icon.pause`, `icon.play` und die beiden
>    Ton-Symbole sind in Tinte auf Holz gezeichnet — auf dem dunklen Band
>    unsichtbar. Alle vier stehen nur noch in der Kopfzeile, also sind sie jetzt
>    hell (Umriss Pergament, Füllung Pergament dunkel). Beim Stumm-Symbol musste
>    zusätzlich das Kreuz von Siegelrot auf Gold wechseln, weil Rot auf Holz
>    ebenfalls untergeht.
> 2. **Die Kopfzeile zappelte.** Erst brach „← Lobby" in eine zweite Zeile, dann
>    schob der Ungelesen-Zähler beim ersten neuen Bericht die halbe Leiste zur
>    Seite. Der Zähler ist jetzt absolut positioniert und ändert die Breite des
>    Reiters nicht mehr.
> 3. **Die Kopfzeile war nicht symmetrisch.** Uhr, Pause, Lautstärke und der
>    Lobby-Knopf hingen rechts an den Reitern und kippten das Bild. Sie sind
>    ganz heraus: die Uhr in die Dorfleiste, Ton und Pause auf eine
>    **vorgezogene Einstellungsseite** (eigentlich 18-5 — ohne sie hätte man
>    weder pausieren noch stummschalten können). Übrig bleiben neun Reiter,
>    **vier links, Rangliste als Anker, vier rechts.**
>
> **Der Kontrastprüfer hat wieder etwas gefangen, das nach Augenmaß durchgegangen
> wäre:** Der geplante Reiterrahmen in Eiche auf Holz erreicht 2.75:1 statt der
> geforderten 3:1. Die Reiter tragen deshalb einen hellen Beschlagrand.
>
> **Belegt im Browser:** Dorfwechsel über ▶ ändert Adresszeile *und* Inhalt
> (`/worlds/2/village/1` → `/village/103`, Gebäudestufen wechseln mit); alle neun
> Reiter setzen `data-status="active"` korrekt, auch nach Reload und
> Zurück-Taste; die Reiter sind echte `<a href>` (Mittelklick funktioniert);
> beide Leisten kleben bei scrollY 577 auf 0 px und 66 px; der Fokusring ist nach
> drei Tab-Anschlägen `#c8973f`, 2 px — der für dunkle Flächen vorgesehene Ton.
>
> **Nachgereicht auf Zuruf:** neunter Reiter **Handbuch** (Nachschlagewerk für
> Einheiten, Gebäude und Stufenwirkungen, gespeist aus `@medival/shared` und
> damit nicht veraltbar), Speicherkapazität **einmal** statt dreimal an jedem
> Rohstoff, und eine ehrliche Händleranzeige.

## Kontext

Die Anwendung hat keine Kopfzeile. Sie hat eine Zeile mit einem Zurück-Knopf, dem
Weltnamen, einer Uhr und einem Pause-Knopf (`features/world/Topbar.tsx`), darunter
vier Karteireiter (`routes/worlds.$worldId.tsx:44-99`). Beides scrollt beim Lesen
einer langen Seite weg. Drei konkrete Mängel:

**Der Aktiv-Zustand der Reiter kommt aus der falschen Quelle.** In
`worlds.$worldId.tsx:58` steht `active={location.pathname.includes('/village/')}` —
das ist das globale `window.location`, nicht der Router. Es funktioniert nur, weil
MobX ohnehin neu rendert. Die Reiter sind außerdem `<Button onClick={navigate}>`
statt `<Link>`: kein Anker, kein Mittelklick, kein Prefetch, keine Ankersemantik
für Screenreader.

**Der Dorfwechsel bricht die Adresszeile.** `Topbar.tsx:40-56` ruft
`village.select(...)` direkt auf, ohne zu navigieren. Die URL zeigt weiter auf das
alte Dorf. Ein Reload, ein Zurück-Klick oder der Dorf-Reiter (der `village.villageId`
liest) landen danach woanders als erwartet. Zusätzlich versteckt sich der Wechsler
bei genau einem Dorf komplett — man sieht also nie, dass es ihn gibt.

**Der Rahmen ist zu eng.** `styles.css:83` deckelt `#root` auf `max-w-[1000px]`.
Die Vorlagen arbeiten mit rund 1240 px, und die zweispaltigen Layouts aus 18-2 und
18-3 brauchen den Platz.

## Aufbau

Zwei fixierte Leisten, darunter der Outlet. Beide kleben oben (`position: sticky`),
damit Ressourcen und Navigation beim Scrollen einer Gebäudeseite sichtbar bleiben.

```
┌ Hauptnavigation (dunkles Band) ───────────────────────────────────────────┐
│ ⌂ Übersicht ⚑ Karte ✉ Berichte⁶ ✉ Nachrichten ┃ Rangliste ┃              │
│                                    ┃  7 211 P  ┃ ⚔ Stamm ☗ Profil ⚙ 📖   │
├ Dorfleiste ───────────────────────────────────────────────────────────────┤
│ ◀ Heimatdorf ▶ (357|368) K33   🪵 659 🧱 388 ⛏ 888 🏚 8 000 👤 316/530    │
│                                              🛒 4/4      14:47            │
└───────────────────────────────────────────────────────────────────────────┘
```

**Reihe 1 — Hauptnavigation, ausschließlich Reiter.** Dunkles Holzband in
`timber`, Schrift in `parchment`, aktiver Reiter in `seal`. Neun Einträge:
**vier links** (Übersicht · Karte · Berichte · Nachrichten), die **Rangliste als
breiterer Anker in der Mitte** mit der eigenen Punktzahl in der zweiten Zeile,
**vier rechts** (Stamm · Profil · Einstellungen · Handbuch). Berichte und
Nachrichten tragen den Zähler ungelesener Einträge — absolut positioniert, damit
er den Reiter beim Auftauchen nicht breiter macht.

Uhr, Pause, Lautstärke und der Weg zurück in die Lobby standen hier zunächst
rechts mit. Das brach die Symmetrie und ließ die Leiste bei jedem neuen Bericht
zappeln; sie stehen jetzt in der Dorfleiste bzw. auf der Einstellungsseite.

**Reihe 2 — Dorfleiste.** Helles Pergamentband: Dorfwechsler (◀ Name ▶),
Koordinaten und Kontinent; rechts die Zahlen — Holz, Lehm, Eisen, **Speicher**,
Bauernhofplätze, freie Händler, Spieluhr. Diese Leiste ersetzt
`features/village/ResourceBar.tsx` an seinem bisherigen Ort — die Werte gehören
in den Rahmen, nicht in den Seiteninhalt, weil sie auf jeder Seite relevant sind.

Zwei Feinheiten, die erst im Bild auffielen:

- **Der Speicher steht einmal**, nicht als `ist/kapa` an jedem Rohstoff. Er fasst
  von jeder Sorte gleich viel; dreimal dieselbe Zahl ist Rauschen
  (`ideas/assets/resourcen_leiste-beispiel.png`).
- **`merchantsFree`/`merchantCapacity` zählen Rohstoffe, nicht Händler.** Ein
  Händler trägt `MERCHANT_CAPACITY` = 1000. Die Leiste zeigt deshalb die Anzahl
  Händler (`2/2`) und nennt die Tragkraft in der Beschriftung — vorher stand dort
  `2000/2000` neben einem Handelssymbol, als gäbe es zweitausend Händler.

Beim Betreten der Karte, der Berichte oder der Rangliste bleibt die Dorfleiste
stehen; sie bezieht sich immer auf das aktive Dorf.

## Änderungen

### Schale und Breite

- `packages/client/src/styles.css:82-84` — `#root` von `max-w-[1000px] p-4` auf
  `max-w-[1280px]` ohne Innenabstand; das Polster wandert in den Seiteninhalt,
  damit die beiden Leisten randlos anliegen können.
- Neue Farbkombinationen (Pergamentschrift auf `timber`, aktiver Reiter) in
  `scripts/check-contrast.mjs` eintragen. `--color-focus-dark` existiert bereits
  genau für diesen Fall (`styles.css:47-49`) und wird für Fokusringe auf dem
  dunklen Band verwendet.

### Neue Komponenten

- `packages/client/src/features/world/MainNav.tsx` — Reihe 1. `observer`, liest
  `world`, `reports` und später `messages`.
- `packages/client/src/features/world/VillageBar.tsx` — Reihe 2. `observer`, liest
  `world` und `village`.
- `packages/client/src/features/world/VillageSwitcher.tsx` — ◀ Auswahl ▶ als
  eigenständige Komponente, weil 18-2 und 18-3 sie ebenfalls brauchen.
- `packages/client/src/features/world/SettingsView.tsx` — vorgezogen aus 18-5,
  weil Ton und Pause die Kopfzeile verlassen und sonst unerreichbar wären.
- `packages/client/src/features/handbook/HandbookView.tsx` — der neunte Reiter.
- `packages/client/src/components/Button.tsx` — neue Variante `nav` plus die
  exportierte Klassenliste `NAV_LINK_CLASS` für die Reiter, die `<a>` sind und
  keine Knöpfe. Die bestehenden Varianten (`primary`, `danger`, `tab`, `link`)
  bleiben unangetastet; `tab` dient künftig nur noch der Unternavigation
  innerhalb einer Seite (18-2, 18-4, 18-5).

`features/world/Topbar.tsx` löst sich auf. `SoundControl.tsx` ebenfalls — sein
Inhalt steckt jetzt in `SettingsView`.

### Reiter werden Links

`routes/worlds.$worldId.tsx:44-99` wird ersetzt. Jeder Eintrag ist ein
TanStack-`<Link>`; den aktiven Zustand markiert der Router von sich aus mit
`data-status="active"`, sodass eine einzige Klassenliste genügt:

```tsx
<Link to="/worlds/$worldId/map" params={{ worldId }} className={NAV_LINK_CLASS}>
```

```
nav: '… bg-timber … data-[status=active]:bg-seal'
```

**Nicht `activeProps`.** Dessen `className` wird an die Grundklasse *angehängt*;
`bg-timber` und `bg-seal` stünden dann beide am Element und es entschiede die
Reihenfolge im erzeugten Stylesheet, nicht die im Klassenattribut. Der
`data-`Selektor hat eine höhere Spezifität und gewinnt verlässlich.

Damit verschwindet der Griff nach `window.location` an vier Stellen (Zeilen 58, 67,
79, 95), und der Aktiv-Zustand ist eine Router-Eigenschaft statt eines Zufalls.
Für den Dorf-Reiter, dessen Ziel-ID vom Store kommt, gilt zusätzlich: solange
`village.villageId === null` ist, wird der Eintrag deaktiviert dargestellt statt
auf einen Klick nicht zu reagieren.

### Lesezustand der Berichte

Der Seiteneffekt in Zeile 74 — `reports.markAllRead()` im `onClick` des
Berichtsreiters — verschwindet. Er lief, **bevor** die Seite überhaupt da war,
und auch dann, wenn die Navigation danach scheiterte.

Ersatz ist der Loader der Berichtsroute: gelesen wird beim *Öffnen der Seite*.
Ticket 18-4 verfeinert das auf „gelesen, wenn *dieser* Bericht geöffnet wurde";
bis es einen Endpunkt für den Einzelfall gibt, ist „du hast die Liste gesehen"
die ehrlichste Regel, die zu haben ist. Den Zähler ganz stehen zu lassen, wie
zuerst geplant, war keine — dann geht er nie wieder aus.

### Dorfwechsel

`VillageSwitcher` **navigiert**, statt den Store zu ändern:

```tsx
navigate({
    to: '/worlds/$worldId/village/$villageId',
    params: { worldId, villageId: String(next.id) },
});
```

Den Rest erledigt der bestehende Route-Loader in
`routes/worlds.$worldId.village.$villageId.tsx:8-13`, der `village.select(...)`
aufruft. Das ist dasselbe Muster wie überall sonst und behebt die
Desynchronisation aus `Topbar.tsx:40-56`.

Drei Bedienwege zum Dorfwechsel, wie gewünscht:

1. ◀ ▶ zyklisch durch `world.playerVillages` — auch bei nur einem Dorf sichtbar,
   dann als deaktivierte Pfeile.
2. Aufklappliste mit allen Dörfern. **Nur die Namen** — Koordinaten und
   Kontinent stehen direkt daneben in der Leiste, und zweimal dieselbe Angabe
   nebeneinander liest niemand.
3. Klick auf ein eigenes Dorf in der Karte — kommt in 18-3.

### Kontinent

Neue reine Funktion in `packages/shared/src/logic/continent.ts`:

```ts
export function continentOf(x: number, y: number): number {
    return Math.floor(y / 100) * 10 + Math.floor(x / 100);
}
```

Angezeigt als `K33`. Mit Test in `packages/shared/test/`. Auf kleinen Karten
(`mapSize` beginnt bei 20) ergibt das immer `K0` — das ist richtig so und kein
Sonderfall.

### Neue Routen

Kein Reiter führt ins Leere:

| Datei | Reiter | Zustand |
|---|---|---|
| `routes/worlds.$worldId.settings.tsx` | Einstellungen | **echt** — Ton, Pause, Weltparameter; 18-5 ergänzt das Löschen der Welt |
| `routes/worlds.$worldId.handbook.tsx` | Handbuch | **echt** — siehe unten |
| `routes/worlds.$worldId.ranking.tsx` | Rangliste | Platzhalter (`ComingSoon`), gefüllt von 18-5 |
| `routes/worlds.$worldId.messages.tsx` | Nachrichten | Platzhalter, gefüllt von 18-6 |

Für das eigene Profil entsteht **keine** eigene Route: Der Reiter zeigt direkt
auf `/worlds/$worldId/players/$playerId` mit `PLAYER_ID`. Eine Weiterleitung
wäre ein Sprung ohne Zweck; 18-5 baut die Seite dann zur eigenen Ansicht aus.

Der Stamm-Reiter zeigt auf die bestehende `diplomacy`-Route. Die Beschriftung
wird zu „Stamm"; die Route selbst bleibt, damit gespeicherte Links weiter
funktionieren.

### Handbuch (neunter Reiter)

Ein Nachschlagewerk: Einheitenwerte (Angriff, Verteidigung, Tempo, Tragkraft,
Kosten, Ausbildungsdauer), Gebäude (Maximalstufe, Grundkosten, Voraussetzungen,
Wirkung) und eine Stufentabelle für Produktion, Speicher, Bauernhof, Markt und
Wall.

Es entstand, weil links vier Reiter standen und rechts drei — und weil die Zahlen
sonst nirgends stehen. **Es liest ausschließlich aus `@medival/shared`**, also aus
denselben Tabellen, nach denen Server und Kampfrechner arbeiten, und kann deshalb
nicht veralten. Eine handgeschriebene Hilfeseite wäre nach der ersten
Balance-Änderung falsch.

Alle Zeiten und Produktionswerte sind mit der Weltgeschwindigkeit verrechnet —
eine Bauzeit von „15 Minuten" hilft in einer 200×-Welt niemandem.

### Eigene Spieler-ID

`PLAYER_ID = 1` steht dreimal im Code: `features/map/MapCanvas.tsx:6`,
`features/map/TargetPanel.tsx:9` und `packages/server/src/engine/mapgen.ts:16`.
Die Kopfzeile braucht sie für Profil und Rangliste, also wandert sie als
benannte Konstante nach `@medival/shared` und die drei Stellen importieren sie.

### Sprites

Fünf neue Symbole, 16×16, über `scripts/lib/sprite-definitions.mjs` +
`pnpm assets:generate` + Eintrag in `assets/registry.ts`:

`icon.message` · `icon.ranking` · `icon.profile` · `icon.settings` ·
`icon.handbook`

Geplant waren zusätzlich `icon.overview` und `icon.merchant`. Beide entfallen:
`icon.village` und `icon.trade` gibt es bereits und sie bedeuten dasselbe —
Doppelgänger kosten Pflege und bringen nichts.

**Alle Symbole der Kopfzeile müssen hell sein.** Die vorhandenen `icon.pause`,
`icon.play`, `icon.sound.on` und `icon.sound.off` waren in Tinte auf Holz
gezeichnet und auf dem dunklen Band schlicht unsichtbar; sie wurden auf Umriss in
Pergament und Füllung in Pergament dunkel umgestellt. Beim Stumm-Symbol musste
zusätzlich das Kreuz von Siegelrot auf Gold wechseln.

### Klang

Ein leiser Klick beim Reiterwechsel. Der bestehende `click`-Klang reicht; der
`SoundStore` bekommt dafür eine `click()`-Methode, die `MainNav` aufruft. Das ist
schichtenkonform: Komponenten dürfen den `SoundStore` ansprechen, verboten ist
nur der Zugriff auf die `AudioEngine`.

### i18n

Neue Gruppen in `i18n/de.ts`: `nav` (neun Reiterbeschriftungen, Punkte, Zähler,
Platzhaltertext), `villageBar`, `settings` und `handbook`. Die bestehende Gruppe
`world` verliert `tabVillage`, `tabMap`, `tabReports`, `tabDiplomacy`.

## Verifikation

Alle Punkte durchgeführt und bestanden (2026-08-02).

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (265), `pnpm build` grün. Das
  Kontrastskript prüft 16 Kombinationen ohne Verstoß.
- `continentOf` hat drei Tests in `packages/shared/test/continent.test.ts`.
- Im Browser (Chrome über das DevTools-Protokoll, 1400×900, Welt mit drei
  eigenen Dörfern und sechs ungelesenen Berichten):
  1. Alle neun Reiter führen auf eine Seite, keiner ins Leere.
  2. Der aktive Reiter trägt `data-status="active"` — auf jeder der neun Seiten
     genau einer, auch nach Reload und Zurück-Taste.
  3. Die Reiter sind `<a href="…">`; Mittelklick öffnet einen neuen Tab.
  4. Dorfwechsel über ▶ ändert Adresszeile **und** Inhalt
     (`/worlds/2/village/1` → `/village/103`, Gebäudestufen wechseln mit).
  5. Bei scrollY 577 steht die Kopfzeile auf 0 px und die Dorfleiste auf 66 px.
  6. Nach drei Tab-Anschlägen liegt der Fokus auf „Berichte", Ring
     `rgb(200, 151, 63)` = `focus-dark`, 2 px — der für dunkle Flächen
     vorgesehene Ton.
  7. Der Zähler „6" verschwindet beim Öffnen der Berichtsseite und taucht beim
     Zurückkehren nicht wieder auf.
  8. Die Kopfzeile bleibt einzeilig, mit und ohne Zähler.
  9. Kein Konsolenfehler auf keiner Seite.
- Händlerkapazität an einer Wegwerf-Welt belegt: Marktplatz Stufe 2 →
  `merchantCapacity` 2000 → Anzeige „2/2" mit „2.000 Rohstoffe Tragkraft" in der
  Beschriftung. Die 1:1000-Regel steckt bereits in
  `MERCHANT_CAPACITY` (`packages/shared/src/data/buildings.ts:174`) — falsch war
  nur die Beschriftung.

## Offener Befund (nicht Teil dieses Tickets)

`POST /api/worlds/2/villages/1/build` mit `{"building":"market"}` antwortete in
einer gewachsenen Welt mit `{"error":"internal"}`, obwohl Voraussetzungen und
Rohstoffe stimmten und der Knopf „Ausbauen (1)" aktiv war. In einer frisch
angelegten Welt funktioniert derselbe Aufruf.

`world.upgradeBuilding` wirft für die bekannten Fälle saubere Codes
(`queue_full`, `max_level`, `invalid_building`, Voraussetzungen) — `internal`
heißt also, dass eine echte Ausnahme durchschlägt. Reproduzieren ließ es sich
ohne Zugriff auf die Serverausgabe nicht; die Stelle ist
`packages/server/src/engine/world.ts:506-530`.
