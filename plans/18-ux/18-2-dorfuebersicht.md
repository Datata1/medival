# Ticket 18-2: Dorfübersicht, Gebäudeseiten & Dorfgrafik

**Status:** ✅ erledigt (2026-08-02) · **Voraussetzung:**
[18-1](18-1-rahmen-und-kopfzeile.md) · **Vorlage:** `ideas/assets/Dorfübersicht.png` ·
**Ergebnis:** `ideas/assets/Dorfuebersicht-umsetzung.png`

> **Ergebnis:** Aus 1400 px Karten übereinander wurden 600 px Dashboard: ein
> klickbarer Dorfplatz über die ganze Breite, eine schmale Leiste rechts,
> darunter die laufenden Schleifen. Jedes Gebäude hat eine eigene Seite, dazu
> der Versammlungsplatz. Geprüft im echten Chrome über das DevTools-Protokoll
> bei 1280×800.
>
> **Vier Entwurfsentscheidungen des Tickets haben im Bild nicht gehalten:**
>
> 1. **Der Versammlungsplatz ist kein Gebäude, sondern ein Ort.** Er kostet
>    nichts, wird nie ausgebaut, zählt keine Punkte und ist von der ersten
>    Sekunde an da. In `BUILDINGS` aufgenommen müsste ihn jede Rechnung über
>    Kosten, Bevölkerung und Punkte wieder ausnehmen, und jede bestehende Welt
>    bekäme ihn als fehlende Zeile mit Stufe 0. Er ist deshalb ein zweiter
>    Wert neben den Gebäudetypen (`VillagePageSchema = BUILDING_ORDER + rally`)
>    und trägt alle Bewegungen dieses Dorfes.
> 2. **Gebaut wird ausschließlich im Hauptgebäude.** Die Gebäudetabelle war
>    zwischenzeitlich ganz verschwunden — das hieß, für jeden einzelnen Auftrag
>    erst das Gebäude anzusteuern. Sie steht jetzt dort, wo man Aufträge
>    ohnehin mehrere hintereinander erteilt, **mitsamt den gesperrten Gebäuden
>    und dem, was ihnen fehlt** („Braucht Hauptgebäude 20, Stall 10"). Die
>    Gebäudeseiten haben dafür **keinen** Ausbauteil mehr: eine Handlung, ein
>    Ort.
> 3. **Die Grafik ist 5:2, nicht 4:3.** Bei 1280×800 bleiben unter den beiden
>    Leisten aus 18-1 rund 600 px. Über die volle Breite wäre eine 4:3-Grafik
>    allein 490 px hoch und hätte die Bauschleife unter den Rand geschoben. Der
>    Hintergrund wird in derselben Form erzeugt, es wird also nichts
>    beschnitten; die Gebäude stehen mit 64 px darauf.
> 4. **Die Übersicht zeigt Bewegungen nur noch als Antwort auf „kommt etwas?"**
>    Zwei volle Listen waren dieselbe Tabelle wie auf dem Versammlungsplatz,
>    nur enger. Jetzt stehen dort die nächsten drei eingehenden Bewegungen, die
>    Zahl der ausgehenden und ein Link.
>
> **Die Dorfnavi trägt nur die Gebäude mit eigener Handlung** (Hauptgebäude,
> Kaserne, Stall, Marktplatz) plus den Versammlungsplatz. Speicher, Bauernhof,
> Wall, Adelshof und die drei Rohstoffgebäude zeigen eine Zahl, die auf der
> Übersicht ohnehin schon steht — als Reiter kosteten sie nur die einzeilige
> Leiste. Über den Dorfplatz bleiben sie erreichbar.
>
> **Zwei Sprites waren im Bild nicht zu gebrauchen:** Die Burg trug dieselben
> Steintöne wie ihr Untergrund und war auf ihrem eigenen Dorfplatz nicht zu
> finden; sie hat jetzt einen dunklen Umriss, rote Turmdächer und ein schwarzes
> Tor. Der Adelshof sah aus wie ein zweiter Speicher, obwohl er 15.000 Holz
> kostet — er hat goldene Kuppel, Türmchen und ein rotes Tor bekommen.
>
> **Nebenbefund, behoben:** `/worlds/2/village/103` zeigte nach einem Neuladen
> das *erste* Dorf, während die Adresszeile 103 nannte. Eltern- und Kindroute
> laden gleichzeitig, und `openWorld` wählte am Ende bedingungslos das erste
> eigene Dorf. Es wählt jetzt nur noch, wenn keines gewählt ist; zwei Tests in
> `test/stores.test.ts` halten beide Reihenfolgen fest.
>
> **Belegt im Browser** (Chrome, DevTools-Protokoll, 1280×800 → 713 px
> Sichtfeld): Die Übersicht misst in beiden gewachsenen Welten exakt 713 px,
> also **keine senkrechte Bildlaufleiste**, auch mit laufender Bauschleife;
> alle **zwölf** Hotspots führen auf die richtige Seite (auch der Marktplatz
> auf Stufe 0 und der Versammlungsplatz); Tab läuft durch die Hotspots mit
> sichtbarem Fokusring (`seal`, 2 px) und Enter öffnet; Bauen im Hauptgebäude,
> Rekrutieren in der Kaserne und Liefern im Marktplatz funktionieren und
> erscheinen sofort in den Schleifen der Übersicht; die Rohstoffe der Dorfleiste
> laufen auf einer Gebäudeseite weiter (622 → 630 in vier Sekunden); ein
> Dorfwechsel tauscht Grafik, Navi und Karten aus; `/village/1/schmiede` landet
> im `errorComponent`. Kein Konsolenfehler.

## Kontext

`features/village/VillagePanel.tsx:24-49` stapelt sechs Karten untereinander:
Ressourcen, Bauschleife, Gebäudetabelle, Truppen, Rekrutierungsschleife,
Rekrutierungstabelle. Dazu hängt die Route noch `MovementsPanel` an. Zusammen sind
das rund 1400 px — die wichtigsten Zahlen des Spiels stehen unterhalb der Falz.

Der Hauptgrund ist die Gebäudetabelle: `BuildingsTable.tsx` rendert bedingungslos
alle elf Gebäude aus `BUILDING_ORDER`, jedes mit fünf Spalten, allein rund 500 px.
Sie beantwortet dabei eine Frage, die man selten hat („welche Stufe hat jedes
Gebäude?"), und verstellt die Fragen, die man ständig hat: Wie viel produziere ich?
Wer greift mich an? Was ist im Bau?

**Entschieden:** Die Übersicht wird ein Dashboard, das ohne Scrollen auskommt.
Jedes Gebäude bekommt eine eigene Unterseite, erreichbar über eine zweite
Navileiste und über die Dorfgrafik. Die Grafik entsteht sofort als klickbarer
Platzhalter — die Mechanik ist vollständig, die Bilder werden später ersetzt.

## Routen

```
/worlds/$worldId/village/$villageId              → VillageOverview  (Dashboard)
/worlds/$worldId/village/$villageId/$building    → BuildingView | RallyView
```

Der Pfadanteil wird mit `VillagePageSchema` aus `@medival/shared` geparst —
`BUILDING_ORDER` plus `rally`. Ein unbekannter Wert führt in den
`errorComponent` der Route, nicht in einen Cast; `scripts/check-no-casts.mjs`
würde ihn ohnehin ablehnen.

**Der Versammlungsplatz steht neben den Gebäudetypen, nicht unter ihnen.** Er
ist immer da und immer Stufe 1: keine Kosten, keine Bauzeit, keine Punkte,
keine Bauernhofplätze. Als Eintrag in `BUILDINGS` müsste ihn jede Rechnung
über Kosten, Bevölkerung und Punkte wieder ausnehmen — und jede bereits
gespeicherte Welt hätte für ihn keine Zeile und damit Stufe 0.

Innerhalb des Dorfes eine zweite Navileiste (`TAB_LINK_CLASS`, weil es `<Link>`
sind und keine Knöpfe). **Sie trägt nur die Gebäude mit eigener Handlung:**
Hauptgebäude, Kaserne, Stall, Marktplatz — und auch die nur, wenn sie gebaut
sind — dazu den Versammlungsplatz, der immer dabei ist. Rohstoffgebäude,
Speicher, Bauernhof, Wall und Adelshof zeigen eine Zahl, die auf der Übersicht
ohnehin steht; sie sind über die Grafik erreichbar, wo auch der leere Bauplatz
liegt.

## Dashboard

Die Grafik nimmt die Breite, rechts steht **eine** schmale Leiste. Sie
beantwortet drei Fragen — was produziere ich, was steht hier, kommt etwas? —,
alles Weitere hat eine eigene Seite. Dorfname, Koordinaten, Kontinent,
Ressourcen und Bauernhofplätze stehen bereits in der Dorfleiste und werden hier
**nicht wiederholt**.

```
┌ Dorfnavi: Übersicht · Hauptgebäude · Kaserne · Stall · Versammlungsplatz ─┐
├──────────────────────────────────────────────────┬───────────────────────┤
│                                                  │ Produktion            │
│                    Dorfplatz                     │  Holz  398/h          │
│               (klickbare Gebäude)                ├───────────────────────┤
│                                                  │ Truppen im Dorf       │
├──────────────────────────────────────────────────┤  Speerträger      24  │
│ Rekrutierungsschleife        Bauschleife         ├───────────────────────┤
│                                                  │ Bewegungen            │
│                                                  │  ⚔ Angriff (360|368)  │
│                                                  │  Zum Versammlungsp. → │
└──────────────────────────────────────────────────┴───────────────────────┘
```

Inhalte der Leiste, in dieser Reihenfolge:

- **Produktion pro Stunde** — aus `view.rates`, mit Weltgeschwindigkeit verrechnet.
- **Truppen im Dorf** — aus `view.units`, nur Einheiten mit Anzahl > 0, mit
  `<Icon name={`unit.${type}`} />`.
- **Bewegungen** — die Antwort auf „kommt etwas?": die nächsten **drei**
  eingehenden Bewegungen aus dem `MovementsStore`, gefiltert auf dieses Dorf,
  eingehende Angriffe in `seal`, dazu die Zahl der ausgehenden und ein Link auf
  den Versammlungsplatz. Eingehende Feindbewegungen haben `units: null`
  (bewusst, `server/src/api/routes.ts`) und zeigen `???`.

Die vollständige Liste steht auf dem Versammlungsplatz; der `MovementsPanel`
der Karte bleibt unangetastet. Der eingehende Angriff steht immer oben, egal
wann er ankommt: Die eine Zeile, die zum Handeln zwingt, darf nicht unter
Handelszügen verschwinden. Die Auswahl steht als reine Funktion `movementRows`
in `derive.ts` und hat Tests in `test/movement-rows.test.ts` — im Browser lässt
sich ein feindlicher Angriff nicht auf Zuruf herbeiführen.

Unter der Grafik: Rekrutierungs- und Bauschleife nebeneinander
(`RecruitQueueCard`, `BuildQueueCard` — beide rendern bereits `null`, wenn
leer, und eine allein nimmt die ganze Breite).

## Dorfgrafik

`features/village/VillageYard.tsx`.

**Bewusst DOM statt Canvas.** Ein Hintergrundbild mit absolut positionierten
`<Link>`-Hotspots. Damit sind Tastaturbedienung, Fokusring, Titel und
Screenreader-Beschriftung gratis; ein Canvas bräuchte Hit-Test-, Fokus- und
ARIA-Code von Hand. Die Karte in 18-3 bleibt Canvas — dort sind es hunderte
Objekte, hier sind es elf.

Aufbau:

- Ein Container über die volle Rahmenbreite mit festem Seitenverhältnis
  (`aspect-[5/2]`, `relative`), darin das Hintergrundbild des Dorfplatzes.
  **5:2 statt 4:3**, weil unter den Leisten aus 18-1 nur rund 600 px bleiben —
  über die volle Breite wäre eine 4:3-Grafik allein 490 px hoch. Der Hintergrund
  wird in derselben Form erzeugt, es wird also nichts beschnitten.
- `BUILDING_SLOTS: Record<BuildingType, { x: number; y: number }>` — feste
  Positionen in Prozent. Ein `Record` über den Gebäudetyp, damit ein neues Gebäude
  im Shared-Paket sofort ein Typfehler ist, solange es keinen Platz hat.
- Pro Gebäude ein `<Link>` auf die Gebäudeseite mit dem 32×32-Sprite (auf 64 px
  gezeichnet — ganze Vielfache bleiben bei Pixelgrafik scharf) und einer
  Stufenplakette in `moss` (wie in der Vorlage die grünen Zahlen). Läuft ein
  Bauauftrag, wird sie rot und zeigt `20→21`.
- Dazu der Versammlungsplatz in der Dorfmitte — ohne Plakette, denn er hat
  keine Stufe, die sich ändern könnte.
- Stufe 0 wird als leerer Bauplatz gedimmt dargestellt, bleibt aber klickbar —
  so kommt man zum erstmaligen Bau.
- Die Zielstufe eines laufenden Auftrags steht bereits in `effectiveLevels(view)`
  aus `features/village/derive.ts`.

**Assets:** neue Sprite-Familie `yard.*` mit elf Gebäuden à 32×32 plus ein
Hintergrundbild. `scripts/check-assets.mjs` kannte nur die Namensräume
`icon`/`building`/`unit` (16) und `map` (32) und hat `yard` (32) dazubekommen.
Das Hintergrundbild ist kein Sprite und steht nicht in der Registry-Bijektion;
es liegt unter `assets/backgrounds/` und wird separat importiert. Es wird
**gerechnet statt gemalt** (Palisadenring, Platz, Wiese) — ein handgeschriebenes
Pixelbild wären hunderte Zeilen, die beim ersten eigenen Bild wieder
verschwinden.

**Zwei Sprites hielten der eigenen Grafik nicht stand:** Das Hauptgebäude trug
dieselben Steintöne wie der Untergrund und war auf seinem eigenen Dorfplatz
nicht zu finden — es hat jetzt einen dunklen Umriss, rote Turmdächer und ein
schwarzes Tor. Der Adelshof sah aus wie ein zweiter Speicher, obwohl er 15.000
Holz kostet; er hat goldene Kuppel, Türmchen, Goldband und ein rotes Tor
bekommen. Beide bleiben in der Palette aus Plan 12, sie haben nur mehr Kanten.

## Gebäudeseiten

`features/village/BuildingView.tsx` — für alle Gebäude gleich aufgebaut:

- Kopf: Name, aktuelle Stufe, Beschreibung und die Wirkung **dieser** Stufe.
- **Kein Ausbauteil.** Kosten, Bauzeit und Bau-Knopf stehen ausschließlich im
  Hauptgebäude. Zwei Orte für dieselbe Handlung wären zwei Stellen, an denen
  Schleifengrenze, Voraussetzungen und Fehlerfall stimmen müssten.
- Darunter ein gebäudespezifischer Teil:

| Gebäude | Zusätzlicher Teil |
|---|---|
| Hauptgebäude | Die **Gebäudetabelle** für alle elf Gebäude — der einzige Ort, an dem gebaut wird |
| Kaserne, Stall, Adelshof | Rekrutierung (aus `RecruitTable.tsx`, gefiltert auf die Einheiten dieses Gebäudes) |
| Marktplatz | Ressourcenversand (`features/map/SendResourcesForm.tsx`) mit Zielwahl über Koordinaten |
| Versammlungsplatz | Alle Bewegungen dieses Dorfes, ein- und ausgehend, mit Art, Herkunft/Ziel, Truppen und Ankunft |
| übrige | nur der Kopf |

**Die Gebäudetabelle steht im Hauptgebäude** und nicht mehr auf der Übersicht.
Ganz zu verschwinden ging nicht: Für jeden einzelnen Bauauftrag erst das
Gebäude anzusteuern ist ein Klick mehr für die häufigste Handlung im Spiel. Die
Gebäudenamen der Tabelle sind Links auf die jeweilige Seite.

**Gesperrte Gebäude stehen mit in der Tabelle** — sonst weiß niemand, dass es
sie gibt. Dann muss aber auch dastehen, *was* fehlt: „Braucht Hauptgebäude 20,
Stall 10" statt eines allgemeinen „Voraussetzungen fehlen".

**Truppen verschickt man weiter über die Karte**, wo ohnehin das Ziel
angeklickt wird; der Versammlungsplatz zeigt, was daraus geworden ist.

`derive.ts` wird weiterverwendet — `liveResources` (Hochrechnung gegen
`world.gameTime`), `effectiveLevels`, `maxRecruitable` — und bekommt
`movementRows` dazu.

## Was verschwindet

- `features/village/BuildingsTable.tsx` — verlässt die Übersicht und zieht ins
  Hauptgebäude (siehe oben); der Aufbau bleibt, die Namen werden Links.
- `features/village/RecruitTable.tsx` — zieht auf die Kaserne bzw. den Stall; der
  Aufbau der Tabelle bleibt erhalten, nur der Ort ändert sich.
- `features/village/ResourceBar.tsx` — bereits in 18-1 in die Dorfleiste gewandert.
- `features/village/VillagePanel.tsx` — wird zu `VillageOverview.tsx`.

`UnitsCard.tsx`, `BuildQueueCard.tsx`, `RecruitQueueCard.tsx` und `RecruitRow.tsx`
bleiben, teils mit engerem Aufbau für die schmale rechte Spalte.

## i18n

Neue Gruppen `village.overview` (Überschriften der Dashboard-Karten und
Beschriftung der Hotspots), `village.rally` (der Versammlungsplatz samt
`kind.*` für die vier Bewegungsarten) und `village.building` (Gebäudeseiten,
samt `effect.*` mit der Wirkung je Stufe). `buildings.rally` steht bei den
Gebäudenamen — im Kopf des Spielers *ist* der Versammlungsplatz ein Gebäude,
auch wenn ihn keine Rechnung so behandelt. Die vorhandenen Spaltenüberschriften mit
`col`-Präfix bleiben erhalten; `village.needBarracks` entfällt, weil die
Rekrutierung jetzt in der Kaserne steht und dort nicht mehr erklärt werden muss,
dass es eine Kaserne braucht.

Die Wirkungstexte nennen ihren Schlüssel **ausdrücklich je Gebäude** statt
`t(`…effect.${type}`, params)`: Sie haben unterschiedliche Platzhalter, und nur
so prüft der Compiler, dass jeder bedient wird.

## Verifikation

Durchgeführt am 2026-08-02, alles bestanden bis auf Punkt 6 (siehe unten).

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (271), `pnpm build` grün.
  `pnpm check:assets` akzeptiert die `yard`-Familie (59 Sprites), der
  Kontrastprüfer die Stufenplakette (`parchment` auf `moss`, 6.58:1).
- Im Browser (Chrome über das DevTools-Protokoll, Fenster 1280×800 → 713 px
  Sichtfeld, zwei gewachsene Welten):
  1. **Ohne senkrechte Bildlaufleiste:** Die Seite misst in beiden Welten
     exakt 713 px — auch mit laufender Bauschleife, elf gebauten Gebäuden und
     vier Einheitenarten.
  2. Alle **zwölf** Hotspots führen auf die richtige Seite (geprüft per Klick
     auf die Mittelpunkte, 12 von 12), einschließlich Versammlungsplatz.
  3. Der Marktplatz auf Stufe 0 ist gedimmt, trägt keine Plakette und führt auf
     seine Seite. Der erstmalige Bau wurde an einer Wegwerf-Welt durchgeführt:
     Wall Stufe 0 → Auftrag in der Bauschleife der Übersicht.
  4. Bauen (Hauptgebäude), Rekrutieren (Kaserne) und Liefern (Marktplatz)
     funktionieren; Bau- und Rekrutierungsschleife der Übersicht zeigen den
     Auftrag sofort. Die Gebäudeseiten tragen **keinen** Bau-Knopf mehr.
  5. Die Rohstoffe der Dorfleiste laufen auf einer Gebäudeseite weiter
     (Holz 622 → 630 in vier Sekunden).
  6. **Nicht belegt:** Ein eingehender *feindlicher* Angriff ließ sich in zehn
     Minuten Beobachtung nicht herbeiführen — kein Bot hat angegriffen, und
     eigene Bewegungen zählen serverseitig nicht als eingehend
     (`server/src/api/routes.ts`). Belegt ist stattdessen die eingehende Zeile
     als solche (sechs Bot-Lieferungen auf dem Versammlungsplatz,
     Zusammensetzung verborgen als `???`) und die Auswahl-/Sortierlogik über
     Tests (`movementRows`).
  7. Tastatur: Tab läuft aus der Dorfnavi in die Hotspots, jeder trägt seine
     Beschriftung („Holzfäller, Stufe 27, im Bau → Stufe 28"), der Fokusring
     ist `rgb(139,47,34)` = `seal`, 2 px; Enter öffnet die Seite.
  8. Ein Dorfwechsel über die Leiste aus 18-1 tauscht Adresszeile, Grafik,
     Dorfnavi und alle Karten aus — **und ein direkter Aufruf von
     `/village/103` zeigt jetzt auch Dorf 103** (siehe Nebenbefund oben).
  9. Das Hauptgebäude listet gesperrte Gebäude mit ihrer Voraussetzung
     („Braucht Hauptgebäude 10, Kaserne 5").
  10. `/worlds/2/village/1/schmiede` landet im `errorComponent`
      („Unbekanntes Gebäude"), nicht in einem Cast.
  11. Kein Konsolenfehler — außer der Fehlergrenze von React beim absichtlich
      falschen Gebäudenamen, die genau den erwarteten `ZodError` protokolliert.
- Bildschirmfoto: `ideas/assets/Dorfuebersicht-umsetzung.png`.

## Offener Befund (unverändert aus 18-1)

`POST /api/worlds/2/villages/1/build` mit `{"building":"market"}` antwortet in
der gewachsenen Welt 2 weiterhin mit `{"error":"internal"}` — auf der neuen
Marktplatz-Seite also ein Knopf, der nicht baut. Neuer Datenpunkt: In derselben
Welt geht `{"building":"wall"}` einwandfrei durch, und in einer frisch
angelegten Welt geht auch der Marktplatz. Es liegt also an den Daten dieser
Welt, nicht am Gebäudetyp und nicht an der Oberfläche.
