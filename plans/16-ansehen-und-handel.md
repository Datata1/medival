# Plan 16: Ansehen und Handel — Bots, die dich mögen oder nicht

**Status:** ✅ erledigt (2026-08-02) · **Voraussetzung:** [Plan 15](15-bot-grundgeruest.md)

> **Ergebnis:** Bots haben eine Meinung über einen, und Handel ist der Hebel dafür. Neue
> Tabelle `relations` (asymmetrisch), neues Gebäude `market`, neue Bewegungsart `trade`.
> Das Ansehen klingt **faul** ab — `settleStanding` steht jetzt als drittes Glied neben
> `settleResources` und `settleLoyalty`, ohne einen einzigen Tick.
>
> **Die Entfernungsanforderung ist eine Multiplikation geworden.** Die Vorgabe lautete
> *„je weiter weg desto weniger hat der effekt und geht ins neutrale über"*. Der zweite
> Halbsatz ist der anspruchsvollere: Ein ferner Spieler soll nicht nur langsamer
> freundlich werden, sondern **neutral bleiben**. Beides fällt aus
> `einfluss(d) = 1/(1+(d/15)²)` heraus, weil jeder Anstoß mit der Entfernung schrumpft,
> der Zerfall aber nicht. Das Gleichgewicht ist damit entfernungsabhängig — ein Ausdruck,
> keine Fallunterscheidung.
>
> **Gemessen** (Gleichgewicht bei 3000 Rohstoffen alle 4 Stunden):
>
> | Entfernung | Einfluss | Gleichgewicht | Haltung |
> |---|---|---|---|
> | 3 Felder | 0,96 | 55,9 | freundlich |
> | 15 Felder (`RELATION_RANGE`) | 0,50 | 29,1 | freundlich |
> | 45 Felder | 0,10 | 5,8 | **neutral** |
> | 150 Felder | 0,01 | 0,6 | **neutral** |
>
> Bemerkenswert daran ist die dritte Zeile: Ab dem Dreifachen der Reichweite bleibt ein
> Partner **neutral, egal wie lange man liefert**. Nicht „langsamer freundlich" — er kommt
> dort nie an. Ein Test hält die geschlossene Formel gegen 400 tatsächlich ausgeführte
> Lieferungen, damit Balancing und Anzeige nicht auseinanderdriften.
>
> **19 reine Beziehungstests, 19 Handelstests in der Engine, 6 von 6 im Browser.** Der
> Abnahmetest lief über die Oberfläche: 8000 Rohstoffe an einen Bot bei 9,0 Feldern und
> dieselbe Menge an einen bei 48,3 Feldern. Ergebnis **2,9 gegen 0,4** — Faktor 7 allein
> durch die Entfernung, ablesbar im Spielerprofil.
>
> **Eine Eigenschaft, die erst im Browser sichtbar wurde:** Die Zahlen sind klein, weil
> das Ansehen nur zählt, was **tatsächlich im Lager ankommt**. Ein frischer Bot hat einen
> Speicher der Stufe 1 (Kapazität 1000), von 8000 verschickten Rohstoffen verpuffen also
> 7000 am vollen Lager — und dafür gibt es zu Recht keine Dankbarkeit. Das ist kein
> Fehler, sondern das gewollte Verhalten des Deckels; es bedeutet aber, dass Großzügigkeit
> gegenüber unterentwickelten Nachbarn früh im Spiel wenig bringt. Wer sich Freunde kaufen
> will, sollte häufiger und kleiner liefern.
>
> **Der geplante Stolperstein hat sich bestätigt.** `travelTime` leitet die Geschwindigkeit
> vom langsamsten Mitglied der Gruppe ab — und eine Lieferung hat keine Einheiten dabei.
> Ohne `merchantTravelTime` wäre jede Lieferung quer über die Karte **sofort** angekommen.
> Ein Test hält das ausdrücklich fest (*„kommt NICHT sofort an"*).
>
> **Was der Compiler erzwungen hat:** Die vollständigen Literale aus früheren Plänen
> (`EMPTY_BUILDING_LEVELS`, `BUILD_WEIGHTS` in `decide/barbarian.ts`, `BUILDING_CATEGORY`
> in `personalities.ts`, `KIND_ICONS` in `MovementsPanel.tsx`) haben beim Hinzufügen von
> `market` und `trade` allesamt einen Fehler geworfen und eine Entscheidung verlangt —
> genau wofür sie gedacht waren. Barbaren bekommen Gewicht 0 (sie handeln nicht), der
> Marktplatz zählt zur Kategorie `economy`.
>
> **Abweichung von der Planung:** Kein `settleStanding`-Aufruf beim Spielerprofil eines
> Barbaren — herrenlose Dörfer haben keinen Besitzer und damit keine Meinung. Lieferungen
> an sie werden mit `target_is_barbarian` abgelehnt, statt Rohstoffe ins Nichts zu
> schicken.

## Kontext

Nach Plan 15 wachsen Bots, aber sie nehmen einander nicht wahr. Es gibt keine Beziehung
zwischen zwei Spielern — weder eine Tabelle noch ein Feld. Ebenso gibt es keinen Handel:
`BUILDING_ORDER` hat zehn Einträge, ein Marktplatz ist keiner davon, und `MOVEMENT_KINDS`
kennt nur `attack`, `support` und `return`. Rohstoffe wechseln heute ausschließlich durch
Plünderung den Besitzer.

Entschieden (mit Nutzer): **Handel ist der Hebel für Freundschaft.** Wer viel liefert, wird
freundlicher gesehen. Der Effekt ist **entfernungsabhängig** — nahe Nachbarn reagieren
stark, ferne Spieler bleiben neutral. Spieler aus fremden Stämmen sind grundsätzlich etwas
negativer eingestellt (die Stämme selbst kommen in Plan 17).

Umsetzung als **einseitige Lieferungen mit Marktplatz**, nicht als Angebot-und-Annahme-
Markt: ein vollständiger Kreislauf mit deutlich weniger Oberfläche. Das Ansehenssystem
interessiert sich ohnehin nicht dafür, wodurch der Warenwert entstanden ist — ein echter
Tauschmarkt lässt sich später darüberlegen, ohne die Beziehungslogik anzufassen.

---

## Die Kernentscheidung: Ansehen zerfällt faul, Entfernung dämpft das Gleichgewicht

### Asymmetrisch, weil Beziehungen es sind

Neue Tabelle `relations` mit einer Zeile je **geordnetem** Paar:

| Spalte | Bedeutung |
|---|---|
| `player_id` | wer bewertet |
| `other_player_id` | wen |
| `standing` | −100 … +100 |
| `updated_at` | Spielzeit der letzten Abrechnung |

Was A von B hält, ist ausdrücklich **nicht**, was B von A hält. Ein Bot, den man beschenkt
und danach überfällt, mag einen weniger, als man ihn mag — und das ist die interessantere
Modellierung.

### Zerfall ohne Tick — dasselbe Muster wie Ressourcen und Loyalität

Beziehungen sollen abkühlen. Der naive Weg wäre ein Tick, der alle Paare regelmäßig gegen
null zieht — bei 31 Spielern sind das bis zu 930 Zeilen. Das ist nicht nötig: Die Engine
rechnet Ressourcen (`settleResources`) und Loyalität (`settleLoyalty`) längst **erst beim
Zugriff** hoch. Ansehen wird das dritte Glied dieser Reihe:

```
standing *= 0.5 ^ (verstrichene Spielzeit / halbwertszeit)
```

`settleStanding(playerId, otherId)` liest, rechnet, schreibt zurück — genau wie seine
beiden Geschwister. Kein Tick, keine Hintergrundlast, und eine Beziehung, die niemand
abfragt, kostet nichts.

### Entfernung dämpft den Gleichgewichtspunkt, nicht nur das Tempo

Die Vorgabe war: *„Wenn diese näher sind soll der effekt stärker sein, je weiter weg desto
weniger hat der effekt und geht ins neutrale über."* Der zweite Halbsatz ist der
anspruchsvollere: Ferne Spieler sollen nicht nur *langsamer* freundlich werden, sondern
**neutral bleiben**, egal wie viel man liefert.

Beides ergibt sich aus einer einzigen Multiplikation:

```
einfluss(d) = 1 / (1 + (d / RELATION_RANGE)²)     # 1,0 nah · 0,5 bei RANGE · →0 fern
delta       = grundwert × einfluss(d)
```

Weil jeder Anstoß mit der Entfernung schrumpft, der Zerfall aber **nicht**, stellt sich von
selbst ein entfernungsabhängiges Gleichgewicht ein:

| Entfernung | Einfluss | Gleichgewicht bei Dauerlieferung |
|---|---|---|
| 0 Felder | 1,00 | stark freundlich |
| `RANGE` | 0,50 | mäßig freundlich |
| 3 × `RANGE` | 0,10 | knapp über neutral |
| 10 × `RANGE` | 0,01 | praktisch neutral |

Das ist ein Ausdruck, kein Sonderfall und keine Fallunterscheidung — und es ist genau das
beschriebene Verhalten. Der quadratische Nenner sorgt dabei für einen weichen Übergang;
ein linearer Abfall hätte eine sichtbare Kante an der Reichweitengrenze.

### Auslöser

| Ereignis | Richtung | Skaliert mit |
|---|---|---|
| Lieferung erhalten | + | Warenwert × Einfluss |
| Unterstützung erhalten | + + | Verteidigungswert × Einfluss |
| Angriff erlitten | − − | eigene Verluste × Einfluss |
| Dorf verloren | − − − | fest, unabhängig von Entfernung |
| Fremder Stamm | − | klein, dauerhaft (Plan 17) |

Angriffe wiegen bewusst schwerer als Lieferungen: Freundschaft soll man sich erarbeiten
müssen, Feindschaft geht schnell. Ein Dorfverlust ignoriert die Entfernungsdämpfung — wer
einem ein Dorf nimmt, ist per Definition nah genug gewesen.

### Haltungen als diskrete Schwellen

Das Spiel rechnet mit Zahlen, entscheidet und zeigt aber **Haltungen**:

| Ansehen | Haltung |
|---|---|
| < −40 | feindlich |
| −40 … −10 | misstrauisch |
| −10 … +25 | neutral |
| +25 … +60 | freundlich |
| > +60 | verbündet |

Diskrete Stufen sind testbar („ab wann greift ein Bot an?" hat eine Antwort), in der
Oberfläche erklärbar und geben Plan 17 klare Anknüpfungspunkte.

---

## Handel: Marktplatz und Lieferungen

### Neues Gebäude `market`

In `BUILDINGS` und `BUILDING_ORDER` (`shared/src/data/buildings.ts`). Stufe → Händler →
Transportlast. Der Marktplatz ist die Obergrenze für gekaufte Freundschaft: Ohne ihn wäre
Ansehen beliebig käuflich, weil man dieselbe Menge tausendmal in kleinen Portionen
verschicken könnte.

Berührt außerdem: Sprite-Registry und ein Gebäude-Sprite (Plan 12), Sprachkatalog
(Plan 07), Bauansicht. `EMPTY_BUILDING_LEVELS` ist bewusst ein vollständiges Literal —
der Compiler erzwingt den neuen Eintrag dort, statt ihn still auf 0 zu lassen.

### Neue Bewegungsart `trade`

In `MOVEMENT_KINDS` (`shared/src/types.ts`). Die Spalte `carriesJson` existiert bereits
(sie trägt heute die Beute), die Tabelle `movements` braucht keine Änderung.

> **Falle, die beim Planen aufgefallen ist:** `travelTime` gibt `Duration.zero` zurück,
> wenn keine Einheiten mitreisen (`shared/src/logic/travel.ts:36` — die Laufzeit kommt vom
> langsamsten Mitglied der Gruppe, und ohne Mitglieder gibt es kein langsamstes). Eine
> Lieferung ohne eigene Laufzeitfunktion käme also **sofort** an, über die ganze Karte
> hinweg. Es braucht `merchantTravelTime` mit festem Händlertempo.

Ablauf einer Lieferung:

1. Rohstoffe beim Absender abbuchen, Händler binden.
2. `trade`-Bewegung mit `merchantTravelTime`.
3. Ankunft: gutschreiben, **auf die Speicherkapazität des Empfängers gedeckelt**; Ansehen
   des Empfängers gegenüber dem Absender erhöhen.
4. Händler kehren zurück (`return`-Bewegung ohne Einheiten und ohne Fracht).

Der Deckel in Schritt 3 ist wichtig: Sonst ließe sich der Speicher eines Verbündeten über
seine Kapazität hinaus füllen, und der Wert wäre beim nächsten `settleResources` weg —
oder schlimmer, er bliebe.

### Bots handeln von sich aus

Der Intent `ship` existiert seit Plan 15 im Typ und bekommt hier seine
Entscheidungsfunktion (`ai/decide/trade.ts`, pure): Ein Bot liefert Überschuss an
Freundliche in Reichweite und bevorzugt dabei, wer knapp am fehlenden Rohstoff ist. Damit
ist der Kreislauf beidseitig — Freundschaft ist nichts, was man nur kauft.

---

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/data/buildings.ts` | `market` in `BUILDINGS`, `BUILDING_ORDER`, `EMPTY_BUILDING_LEVELS`; `merchantCapacity(level)` |
| `shared/src/types.ts` | `'market'` in `BuildingType`, `'trade'` in `MovementKind`/`MOVEMENT_KINDS` |
| `shared/src/logic/travel.ts` | `merchantTravelTime` |
| `shared/src/logic/relations.ts` | **neu** — pur: `decayStanding`, `distanceInfluence`, `attitudeOf`, `relationDelta`, `applyRelationEvent`, `standingEquilibrium` |
| `shared/src/schema/api.ts` | Lieferungs-Anfrage, Haltung im Profil |
| `server/src/db/schema.ts` · `ddl.ts` · `worldManager.migrateWorldDb` | Tabelle `relations` — **alle drei**, sonst brechen bestehende Spielstände |
| `server/src/engine/world.ts` | `settleStanding` neben `settleResources`/`settleLoyalty` |
| `server/src/engine/trade.ts` | **neu** — Lieferung senden, Ankunft, Händlerkapazität |
| `server/src/engine/military.ts` | `trade`-Zweig in `handleArrival`, Ansehen bei Angriff und Unterstützung |
| `server/src/ai/decide/trade.ts` | **neu** — pure Lieferentscheidung |
| `server/src/api/routes.ts` | Lieferungs-Endpunkt, Haltung im Spielerprofil |
| `client/src/features/map/*` · `village/*` · `player/*` · `i18n/de.ts` | Lieferformular, Marktplatz, Haltung im Profil |
| `client/src/assets/sprites/buildings/market.png` | Platzhalter über `pnpm assets:generate` |

`relations` muss in `schema.ts` (Drizzle), `ddl.ts` (frische Welt) **und**
`migrateWorldDb` (bestehende Welten) stehen. Vorhandene Spielstände sind Dateien in
`data/`, die niemand neu erzeugt.

---

## Verifikation

- **Rein, ohne Datenbank** (`shared/src/logic/relations.ts`):
  - Zerfall: nach einer Halbwertszeit ist genau die Hälfte übrig; nach zehn praktisch
    nichts; ein Wert von 0 bleibt 0.
  - Entfernung: `einfluss(0) = 1`, `einfluss(RANGE) = 0,5`, monoton fallend, nie negativ.
  - **Gleichgewicht** — der eigentliche Nachweis für die Vorgabe: Ein naher Partner erreicht
    bei Dauerlieferung „freundlich"; ein zehnfach entfernter bleibt mit **derselben**
    Liefermenge unter der Neutralschwelle.
  - Ein Angriff senkt das Ansehen dauerhaft stärker, als eine gleichwertige Lieferung es
    hebt.
  - Haltungsschwellen an den Grenzwerten, inklusive der Ränder −100 und +100.
- **Engine:** Lieferung kommt **nicht** sofort an (die `travelTime`-Falle als Test
  festgehalten); über die Speicherkapazität hinaus wird gedeckelt; Händler kehren zurück
  und stehen danach wieder zur Verfügung; ein Marktplatz der Stufe 0 kann nichts
  verschicken.
- **Bot-Entscheidung, pur:** liefert nur an Freundliche in Reichweite, nie über den eigenen
  Bedarf hinaus, nie an Feinde.
- **Im Browser:** Rohstoffe an einen nahen Bot liefern → Haltung im Spielerprofil steigt
  sichtbar. Denselben Betrag an einen fernen Bot liefern → die Haltung bewegt sich kaum.
  Das ist der Abnahmetest für die Entfernungsdämpfung, und er muss von Hand einmal gesehen
  worden sein.
- **Bestehender Spielstand** aus `data/` öffnet sich nach der Migration ohne Fehler.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün; `pnpm check:assets` kennt
  das Marktplatz-Sprite.
