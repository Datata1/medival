# Ticket 18-2: Dorfübersicht, Gebäudeseiten & Dorfgrafik

**Status:** 📋 offen · **Voraussetzung:** [18-1](18-1-rahmen-und-kopfzeile.md) ·
**Vorlage:** `ideas/assets/Dorfübersicht.png`

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
/worlds/$worldId/village/$villageId/$building    → BuildingView
```

`$building` wird mit dem vorhandenen zod-Enum `BuildingType` aus `@medival/shared`
geparst. Ein unbekannter Wert führt in den `errorComponent` der Route, nicht in
einen Cast — `scripts/check-no-casts.mjs` würde ihn ohnehin ablehnen.

Innerhalb des Dorfes eine zweite Navileiste (`Button variant="tab"`) mit den
gebauten Gebäuden, in der Reihenfolge von `BUILDING_ORDER`. Gebäude auf Stufe 0
erscheinen dort nicht — sie sind über die Grafik erreichbar, wo der leere Bauplatz
liegt.

## Dashboard

Zweispaltig, ausgelegt auf 1280 px Fensterbreite abzüglich der beiden Leisten aus
18-1. Dorfname, Koordinaten, Kontinent, Ressourcen und Bauernhofplätze stehen
bereits in der Dorfleiste und werden hier **nicht wiederholt**.

```
┌ Dorfnavi: Hauptgebäude · Kaserne · Speicher · Marktplatz ─────────────────┐
├───────────────────────────────────────┬──────────────────────────────────┤
│                                       │ Produktion                        │
│                                       │  Holz 398/h  Lehm 398/h  Eisen …  │
│         Dorfgrafik                    ├──────────────────────────────────┤
│         (klickbare Gebäude)           │ Truppen im Dorf                   │
│                                       │  24 Speer · 20 Schwert · …        │
│                                       ├──────────────────────────────────┤
│                                       │ Angriffe                          │
│                                       │  ⚔ eingehend  aus (360|368) 04:11 │
├───────────────────────────────────────┤ Lieferungen                       │
│ Bauschleife      Rekrutierungsschleife│  🛒 ausgehend nach (355|370) 01:22│
└───────────────────────────────────────┴──────────────────────────────────┘
```

Inhalte der rechten Spalte, in dieser Reihenfolge:

- **Produktion pro Stunde** — aus `view.rates`, mit Weltgeschwindigkeit verrechnet.
- **Truppen im Dorf** — aus `view.units`, nur Einheiten mit Anzahl > 0, mit
  `<Icon name={`unit.${type}`} />`.
- **Angriffe** — ein- und ausgehend, aus dem bestehenden `MovementsStore`, gefiltert
  auf dieses Dorf, `kind ∈ { attack, support }`. Eingehende in `seal`, mit
  `<Countdown until={m.arrivalGameTime} />`. Eingehende Feindbewegungen haben
  `units: null` (bewusst, `server/src/api/routes.ts:496`) und zeigen `???`.
- **Lieferungen** — dieselbe Quelle, `kind === 'trade'`.

Beide Bewegungslisten ersetzen den heutigen `MovementsPanel` an dieser Stelle.
Die Komponente selbst bleibt bestehen und wird von der Karte weiterverwendet;
für das Dashboard entsteht eine kompaktere Variante, die nach `kind` filtert.

Unten links, unter der Grafik: Bau- und Rekrutierungsschleife nebeneinander
(`BuildQueueCard`, `RecruitQueueCard` — beide rendern bereits `null`, wenn leer).

## Dorfgrafik

`features/village/VillageYard.tsx`.

**Bewusst DOM statt Canvas.** Ein Hintergrundbild mit absolut positionierten
`<Link>`-Hotspots. Damit sind Tastaturbedienung, Fokusring, Titel und
Screenreader-Beschriftung gratis; ein Canvas bräuchte Hit-Test-, Fokus- und
ARIA-Code von Hand. Die Karte in 18-3 bleibt Canvas — dort sind es hunderte
Objekte, hier sind es elf.

Aufbau:

- Ein Container mit festem Seitenverhältnis (`aspect-[4/3]`, `relative`), darin das
  Hintergrundbild des Dorfplatzes.
- `BUILDING_SLOTS: Record<BuildingType, { x: number; y: number }>` — feste
  Positionen in Prozent. Ein `Record` über den Gebäudetyp, damit ein neues Gebäude
  im Shared-Paket sofort ein Typfehler ist, solange es keinen Platz hat.
- Pro Gebäude ein `<Link>` auf die Gebäudeseite mit dem 32×32-Sprite und einer
  Stufenplakette (wie in der Vorlage die grünen Zahlen).
- Stufe 0 wird als leerer Bauplatz gedimmt dargestellt, bleibt aber klickbar —
  so kommt man zum erstmaligen Bau.
- Gebäude mit laufendem Bauauftrag bekommen eine Markierung; die Zielstufe steht
  bereits in `effectiveLevels(view)` aus `features/village/derive.ts:34-43`.

**Assets:** neue Sprite-Familie `yard.*` mit elf Gebäuden à 32×32 plus ein
Hintergrundbild. `scripts/check-assets.mjs` kennt heute nur die Namensräume
`icon`/`building`/`unit` (16) und `map` (32) — die Größenkarte im Skript muss
`yard` aufnehmen. Das Hintergrundbild ist kein Sprite und gehört nicht in die
Registry-Bijektion; es wird separat importiert.

## Gebäudeseiten

`features/village/BuildingView.tsx` — für alle Gebäude gleich aufgebaut:

- Kopf: Name, aktuelle Stufe, Beschreibung aus `BUILDINGS`
- Ausbau: Kosten (`buildCost`), Dauer (`buildTime`), Wirkung der nächsten Stufe,
  Bau-Knopf. Die vorhandenen Regeln `canAfford`, `requirementsMet` und die
  Schleifengrenze von fünf Aufträgen (`BuildingsTable.tsx:118`) werden übernommen.
- Darunter ein gebäudespezifischer Teil:

| Gebäude | Zusätzlicher Teil |
|---|---|
| Kaserne, Stall, Adelshof | Rekrutierung (aus `RecruitTable.tsx`, gefiltert auf die Einheiten dieses Gebäudes) |
| Marktplatz | Ressourcenversand (`features/map/SendResourcesForm.tsx`) |
| Versammlungsplatz | Truppenversand (`features/map/SendUnitsForm.tsx`) und die Bewegungsliste in ganzer Länge |
| übrige | nur der Ausbauteil |

`derive.ts` bleibt unverändert und wird weiterverwendet: `liveResources`
(Hochrechnung gegen `world.gameTime`), `effectiveLevels`, `maxRecruitable`.

## Was verschwindet

- `features/village/BuildingsTable.tsx` — geht in Grafik und Gebäudeseiten auf.
- `features/village/RecruitTable.tsx` — zieht auf die Kaserne bzw. den Stall; der
  Aufbau der Tabelle bleibt erhalten, nur der Ort ändert sich.
- `features/village/ResourceBar.tsx` — bereits in 18-1 in die Dorfleiste gewandert.
- `features/village/VillagePanel.tsx` — wird zu `VillageOverview.tsx`.

`UnitsCard.tsx`, `BuildQueueCard.tsx`, `RecruitQueueCard.tsx` und `RecruitRow.tsx`
bleiben, teils mit engerem Aufbau für die schmale rechte Spalte.

## i18n

Neue Gruppe `village.overview` mit den Überschriften der Dashboard-Karten
(Produktion, Truppen, Angriffe, Lieferungen) und `village.building` für die
Gebäudeseiten. Die vorhandenen Spaltenüberschriften mit `col`-Präfix bleiben
erhalten, soweit die Tabellen weiterleben.

## Verifikation

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
  `pnpm check:assets` akzeptiert die neue `yard`-Familie.
- Im Browser bei 1280×800:
  1. Das Dashboard passt **ohne senkrechte Bildlaufleiste** unter die beiden
     Leisten aus 18-1.
  2. Klick auf jedes der elf Gebäude in der Grafik führt auf die richtige Seite.
  3. Ein Gebäude auf Stufe 0 ist als Bauplatz erkennbar und führt trotzdem zur
     Seite, auf der man es erstmals bauen kann.
  4. Bauen und Rekrutieren funktionieren von den Gebäudeseiten aus, die
     Schleifen auf dem Dashboard aktualisieren sich.
  5. Die Ressourcen in der Dorfleiste laufen weiter hoch, während man auf einer
     Gebäudeseite steht (Beleg, dass `liveResources` und `world.gameTime` intakt
     sind).
  6. Ein eingehender Angriff erscheint innerhalb von fünf Sekunden in der
     Angriffskarte (Polling-Intervall des `MovementsStore`) und ist rot.
  7. Tastaturbedienung: Tab läuft durch die Gebäude-Hotspots, Enter öffnet, der
     Fokusring ist auf dem Dorfplatz sichtbar.
  8. Ein Dorfwechsel über die Leiste aus 18-1 tauscht Grafik und alle vier Karten
     aus.
- Bildschirmfoto neben `ideas/assets/Dorfübersicht.png`.
