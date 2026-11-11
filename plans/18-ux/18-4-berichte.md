# Ticket 18-4: Berichte als eigene Seiten

**Status:** ✅ erledigt (2026-11-11) · **Voraussetzung:** [18-1](18-1-rahmen-und-kopfzeile.md) ·
**Vorlage:** `ideas/assets/bericht_beispiel.png` ·
**Ergebnis:** `ideas/assets/Bericht-umsetzung.png`, `ideas/assets/Berichtsliste-umsetzung.png`

> **Ergebnis:** Die Berichte sind eine geblätterte Tabelle mit Filterreitern, jeder
> Bericht hat eine eigene Adresse, und gelesen ist ein Bericht erst, wenn seine Seite
> geöffnet wurde.
>
> **Abweichungen vom Ticket** (es stammt aus der Zeit vor Plan 19):
> - **Fünfter Filter „Späher".** Seit 19-10 gibt es Spähberichte und abgewehrte
>   Spähversuche; ohne eigenen Reiter stünden sie nur unter „Alle".
> - **Der Ungelesen-Zähler kommt vom Server** (`unread` in der Antwort). Seit
>   geblättert wird, kennt der Client nicht mehr alle Berichte.
> - **Neue Berichte erkennt der Client an `newestId`**, nicht mehr an der Menge der
>   IDs in der Liste. Die wechselt beim Umblättern, ohne dass etwas eingetroffen ist;
>   der Klang hätte bei jedem Seitenwechsel gespielt.
> - **`GET /reports/:id` liefert die Nachbarn mit** (`newerId`, `olderId`) für das
>   Blättern am Kopf der Seite.
> - **Zusätzlich `POST /reports/delete`** mit einer ID-Liste für „Ausgewählte
>   löschen", neben dem `DELETE` für einen einzelnen Bericht.
> - **Ein fremder Bericht ist 404**, nicht 403. So verrät die Antwort nicht, welche
>   IDs es gibt.
> - **Glücksbalken von −15 % bis +15 %** statt ±25 %: Das ist `LUCK_RANGE`.
> - **Die Aktionslinks führen über die Adresse der Karte:** `?x=…&y=…` wählt das Dorf
>   und öffnet die Karte dort, `troops=spear:10,…` belegt das Versandformular vor.
>   Die Vorbelegung ist auf die Truppen gedeckelt, die zu Hause stehen.
>   `SendUnitsForm` liest sie aus dem `MapStore`, nicht aus einer Prop.
> - **Im Verteidigungsbericht** zeigt „Dieses Dorf angreifen" auf den Angreifer. Die
>   beiden „erneut angreifen"-Links gibt es nur im eigenen Angriffsbericht.
> - **Routen:** `reports.tsx` wurde zu `reports.index.tsx`, dazu
>   `reports.$reportId.tsx`.
> - `UnitLossTable` ist umgebaut statt ersetzt (Einheiten nebeneinander) und dient
>   auch dem Spähbericht.
>
> **Tests:** `server/test/integration/reports.test.ts` (8 Tests: Blättern über 120
> Berichte ohne Überlappung, Filter, fremder Bericht abgewiesen, `read` trifft nur
> einen, Löschen idempotent, Sammel-Löschen nur eigene). `client/test/stores.test.ts`:
> 8 Tests für den `ReportsStore`, 3 für die Meldung neuer Berichte.
>
> **Im Browser geprüft** (Testwelt mit 59 gesetzten Berichten):
>
> | # | Punkt | Ergebnis |
> |---|---|---|
> | 1 | Eigene Adresse, neu ladbar | ✅ `/worlds/1/reports/58`. Im zweiten Tab nicht eigens geprüft |
> | 2 | Filterreiter wirken und stehen in der Adresse | ✅ `?filter=scout&page=1` |
> | 3 | Ungelesen erkennbar, Zähler sinkt um genau eins | ✅ 59 → 58, nach Neuladen weiter 58 |
> | 4 | Der Reiter allein markiert nichts | ✅ |
> | 5 | Löschen entfernt, bleibt nach Reload fort | ✅ einzeln, ausgewählt und von der Detailseite |
> | 6 | Erneut angreifen belegt das Formular vor | ✅ „gleiche Truppen": 94 Speere im Bericht, 3 zu Hause, Feld zeigt 3. „Überlebende" nur über `survivors()` im Code, nicht eigens geklickt |
> | 7 | Glücksbalken mit Vorzeichen | ✅ +12 % im Bild. Ein negativer Wert wurde nicht eigens angesehen |
> | 8 | Der 51. Bericht über die Blätterleiste | ✅ Seite 2 mit 9 Zeilen |
>
> Die Berichte der Testwelt wurden in die Datenbank gesetzt, nicht erkämpft. Wall-
> und Zustimmungszeile sowie die Eroberungsmarke sind deshalb nur über den Code
> belegt.

## Kontext

Berichte sind das Gedächtnis des Spiels — was ist passiert, wie viel hat es
gekostet, lohnt sich ein zweiter Angriff. Heute sind sie ein Einfach-Akkordeon:
`ReportsView.tsx` rendert eine Liste, und wer eine Zeile anklickt, klappt sie auf,
während die vorher offene zubricht (`ReportsStore.toggleOpen`). Daraus folgt:

- Zwei Berichte lassen sich nicht vergleichen, ohne hin und her zu klicken.
- Ein Bericht hat keine eigene Adresse, ist also nicht verlinkbar und überlebt
  keinen Reload.
- Es gibt keinen Filter, keine Suche und kein Löschen. Der Server liefert
  `.limit(50)` (`packages/server/src/api/routes.ts:501`), danach ist ein Bericht
  einfach fort.
- Der Lesezustand ist eine Attrappe: `ReportRow.tsx` zeigt ihn gar nicht an.
  18-1 hat den schlimmsten Teil bereits behoben — das pauschale `markAllRead()`
  im `onClick` des Reiters ist weg, der Loader der Berichtsroute markiert
  stattdessen beim *Öffnen der Seite*. Das bleibt aber grob: Wer die Liste nur
  streift, verliert alle Marken.

## Liste

Neue Route bleibt `/worlds/$worldId/reports`, der Inhalt wird eine Tabelle:

| Spalte | Inhalt |
|---|---|
| — | Ausgangssymbol (`icon.victory` / `icon.defeat`), bei Eroberung `icon.conquered` |
| Betreff | „*Angreifer* greift *Verteidiger* (x\|y) an" wie in der Vorlage |
| Kampfzeit | `formatGameTime(createdGameTime)` |
| — | Löschen |

Ungelesene Zeilen stehen halbfett mit einer Marke am linken Rand. Darüber
Filterreiter (`Button variant="tab"`): Alle · Angriffe · Verteidigung · Ungelesen.
Der Filter ist Suchparameter der Route, nicht Store-Zustand — dann ist ein
gefilterter Stand verlinkbar und überlebt den Zurück-Knopf.

Massenaktionen über der Tabelle: „Alle als gelesen markieren" (der bestehende
Sammel-Endpunkt, jetzt als bewusste Handlung statt als Nebenwirkung) und
„Ausgewählte löschen".

## Detailseite

Neue Route `/worlds/$worldId/reports/$reportId`. Aufbau nach der Vorlage:

1. **Betreffkopf** — Angreifer, Ziel, Koordinaten; darunter die Kampfzeit.
2. **Ergebnisüberschrift** — „*Name* hat gewonnen" / „hat verloren", groß.
3. **Glücksbalken** — der Wert `luck` aus `BattleReportPayload` als Balken von
   −25 % bis +25 % mit Nullmarke in der Mitte. Neue kleine Komponente
   `components/Gauge.tsx`; es gibt bislang nichts Vergleichbares.
4. **Angreiferblock** — Herkunftsdorf (verlinkt auf die Karte), eine Einheitenzeile
   mit Symbolen und darunter zwei Zahlenreihen: Anzahl und Verluste. Das ist die
   Darstellung aus der Vorlage und ersetzt die heutige dreispaltige
   `UnitLossTable.tsx` — die Einheiten stehen nebeneinander, nicht untereinander,
   sonst passen Angreifer und Verteidiger nicht auf einen Bildschirm.
5. **Verteidigerblock** — gleicher Aufbau. Zusätzlich Wallschaden
   (`wallBefore` → `wallAfter`) und Zustimmung (`loyaltyBefore` → `loyaltyAfter`),
   jeweils nur wenn verändert.
6. **Beute** — über die vorhandene `components/ResourceCost.tsx`, nur bei
   gewonnenem Angriff.
7. **Aktionslinks** unten, wie in der Vorlage:
   - „Dieses Dorf angreifen" → Karte mit ausgewähltem Ziel
   - „Mit gleichen Truppen erneut angreifen" → `features/map/SendUnitsForm.tsx`
     mit den Werten aus `payload.attacker` vorbelegt
   - „Mit überlebenden Truppen erneut angreifen" → `attacker − attackerLosses`

Die vorhandene `SendUnitsForm` hält ihre Eingaben in lokalem `useState`; sie
braucht dafür eine optionale Startbelegung als Prop. Das ist die einzige
Änderung an ihr.

Vor- und Zurück-Blättern zwischen benachbarten Berichten am Kopf der Seite, damit
man eine Angriffswelle durchsehen kann, ohne jedes Mal in die Liste zurück.

## Lesezustand

Ein Bericht gilt als gelesen, sobald **seine** Detailseite geöffnet wurde — nicht
mehr, sobald die Liste sichtbar war. Der Loader-Aufruf aus 18-1
(`routes/worlds.$worldId.reports.tsx`) entfällt dabei. Dafür braucht es einen
Endpunkt für den Einzelfall neben dem bestehenden Sammel-Aufruf:

```
POST /api/worlds/:id/reports/:reportId/read
```

Der Zähler in der Kopfzeile (18-1) speist sich weiterhin aus
`ReportsStore.unreadCount`.

## Server

`packages/server/src/api/routes.ts:501-537`:

- `GET /reports` — Paging statt des harten `.limit(50)`: `offset` und `limit` als
  Suchparameter, dazu die Gesamtzahl in der Antwort, damit die Liste eine
  Blätterleiste zeigen kann. Optionaler Filter nach `type`.
- `GET /reports/:reportId` — Einzelabruf, damit ein direkt aufgerufener Link
  funktioniert, ohne vorher die Liste zu laden.
- `POST /reports/:reportId/read` — siehe oben.
- `DELETE /reports/:reportId` — Löschen.

Schemata in `packages/shared/src/schema/api.ts` entsprechend erweitern
(`ReportListSchema` bekommt `{ reports, total }`).

## Client-Zustand

`ReportsStore` verliert `openReportId` und `toggleOpen` und bekommt stattdessen:
Paging-Zustand, aktiven Filter, `markRead(id)`, `remove(id)`. Das
Polling-Intervall von zehn Sekunden und `unreadCount` bleiben unverändert.

Neu ist ein `AsyncValue` für den einzelnen Bericht, damit ein Direktaufruf der
Detailseite nicht auf die Liste warten muss.

**Nicht vergessen:** die neuen API-Methoden in den handgepflegten Mock in
`packages/client/test/stores.test.ts` eintragen.

## Verifikation

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
- Server-Tests für die vier Endpunkte, in der Art von
  `packages/server/test/playerProfile.test.ts`: Paging liefert überlappungsfrei,
  Einzelabruf eines fremden Berichts wird abgewiesen, Löschen ist idempotent,
  `read` verändert nur den einen Bericht.
- Im Browser:
  1. Ein Bericht hat eine eigene Adresse; sie lässt sich kopieren, neu laden und
     im neuen Tab öffnen.
  2. Filterreiter wirken und stehen in der Adresszeile.
  3. Ein ungelesener Bericht ist in der Liste erkennbar; nach dem Öffnen ist er
     gelesen und der Zähler in der Kopfzeile sinkt um genau eins.
  4. Der Reiter „Berichte" allein markiert **nichts** als gelesen.
  5. Löschen entfernt die Zeile und der Bericht kommt nach einem Reload nicht
     zurück.
  6. „Mit gleichen Truppen erneut angreifen" öffnet das Versandformular mit den
     richtigen Zahlen; „mit überlebenden Truppen" mit Anzahl minus Verlusten.
  7. Der Glücksbalken zeigt Vorzeichen und Betrag richtig, geprüft an einem
     Bericht mit negativem und einem mit positivem Glück.
  8. Bei mehr als 50 Berichten ist der 51. über die Blätterleiste erreichbar.
- Bildschirmfoto der Detailseite neben `ideas/assets/bericht_beispiel.png`.
