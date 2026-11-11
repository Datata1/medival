# Ticket 18-5: Rangliste, Profil & Einstellungen

**Status:** ✅ erledigt (2026-11-11) · **Voraussetzung:** [18-1](18-1-rahmen-und-kopfzeile.md) ·
**Ergebnis:** `ideas/assets/Rangliste-umsetzung.png`

> **Ergebnis:** Die Rangliste ist eine eigene Seite mit Spielern und Stämmen, die
> Kopfzeile zeigt den Rang, das eigene Profil ist die Übersicht über alle eigenen
> Dörfer, und die Einstellungen zeigen alle Weltparameter samt „Welt löschen".
>
> **Abweichungen vom Ticket** (es stammt aus der Zeit vor dem Mehrspieler-Umbau):
> - **Die Rangliste wird geblättert** (100 je Seite, `?page=`). Eine Welt hat jetzt
>   hunderte Spieler und mehr Bots. Die eigene Zeile kommt mit jeder Seite mit
>   (`own`), daraus liest die Kopfzeile den Rang.
> - **Rangfolge als eine SQL-Abfrage** (`GROUP BY` in `engine/ranking.ts`), nicht als
>   Schleife über alle Dörfer. Der Profil-Handler benutzt dieselbe Funktion.
> - **Kein eigener Pfad `/profile`.** Der Reiter „Profil" führt wie bisher auf
>   `players/$playerId` mit der eigenen ID. Die Ansicht erkennt das eigene Profil und
>   zeigt dann Links ins Dorf, Bauernhof und Truppen. Ein zweites `AsyncValue` im
>   `PlayerStore` war damit unnötig: Die Kopfzeile lädt kein Profil, sondern liest
>   aus dem `RankingStore`.
> - **Bauernhof und Truppen nur im eigenen Profil.** Der Server liefert sie für
>   Fremde als `null`, sonst ersetzte jedes Profil den Späher.
> - **„Welt löschen" sehen nur Verwalter.** `DELETE /api/worlds/:id` verlangt seit
>   19-8 Admin-Rechte.
> - **Stammeskürzel verlinken auf den Reiter „Stamm".** Eine Seite je fremdem Stamm
>   gibt es nicht.
> - **Zusätzliche Weltparameter** aus Plan 19/20: Besiedlungsdichte, Barbarendörfer je
>   neuem Spieler, Bogenschützen, Paladin.
> - `nav.comingSoon` bleibt, weil der Reiter „Nachrichten" (18-6) ihn noch braucht.
>
> **Tests:** `server/test/integration/ranking.test.ts` (7 Tests über die HTTP-App:
> Barbaren und Spieler ohne Dorf fehlen, Gleichstand 1-2-2 in stabiler Reihenfolge,
> Rang wie im Profil, eigene Zeile außerhalb des Ausschnitts, Blättern
> überlappungsfrei, Stammespunkte als Summe, fremdes Profil ohne Truppen).
> `client/test/stores.test.ts`: drei Tests für den `RankingStore`.
>
> **Im Browser geprüft** (Testwelt mit 30 Bots):
>
> | # | Punkt | Ergebnis |
> |---|---|---|
> | 1 | Kopfzeile und eigene Zeile zeigen dasselbe | ✅ „Rang 31 · 38 P" und Zeile 31 mit 38 Punkten |
> | 2 | Absteigend sortiert, eigene Zeile hervorgehoben und sichtbar | ✅ Spieler und Stämme |
> | 3 | Spielername → Profil, Kürzel → Stammesseite | ✅ |
> | 4 | Eigenes Profil listet Dörfer, Klick wechselt | ✅ mit einem Dorf geprüft |
> | 5 | Lautstärke und Stummschaltung | nicht erneut geprüft, unverändert seit 18-1 |
> | 6 | „Welt löschen" fragt nach, führt in die Lobby | ✅ Abbrechen lässt die Welt stehen |
> | 7 | Nach einer Eroberung ändert sich die Rangliste | nicht im Browser geprüft. Der Store lädt auf `map_changed` neu |
>
> Dass Nicht-Verwalter den Löschknopf nicht sehen, ist nur über den Code belegt.

## Kontext

18-1 legt für drei Reiter der Kopfzeile Platzhalterseiten an. Dieses Ticket füllt
sie. Alle drei sind klein — sie stehen zusammen in einem Ticket, weil keiner für
sich einen eigenen Arbeitsschritt trägt und sie sich dieselben Bausteine teilen.

Ausgangslage:

- **Rangliste** existiert nicht als Endpunkt. Die Berechnung gibt es aber schon,
  eingebettet im Profil-Handler (`packages/server/src/api/routes.ts:308-326`): sie
  summiert Punkte je Spieler über alle Dörfer, lässt Barbaren (`playerId === null`)
  weg und liefert `ahead + 1`. Für jedes Profil wird die Summe über *alle* Dörfer
  der Welt neu gebildet — für eine Rangliste über alle Spieler wäre das ein
  Aufruf je Spieler.
- **Profil** gibt es nur für fremde Spieler (`/worlds/$worldId/players/$playerId`).
  Ein Weg zum eigenen fehlt.
- **Einstellungen** gibt es überhaupt nicht. Die einzige gespeicherte Vorliebe ist
  der Ton (`SoundStore`, `localStorage`-Schlüssel `medival.sound`), bedient über
  einen Schieberegler in der Kopfzeile.

## Rangliste

**Server.** Die Punktsummierung aus `routes.ts:308-326` wandert nach
`packages/server/src/engine/ranking.ts` und wird dort einmal für alle Spieler
gebildet:

```ts
export function ranking(world: World): {
    players: RankedPlayer[];
    tribes: RankedTribe[];
};
```

Der Profil-Handler benutzt danach dieselbe Funktion, statt die Rechnung ein
zweites Mal zu führen — das ist der eigentliche Gewinn der Auslagerung.

Neuer Endpunkt `GET /api/worlds/:id/ranking` mit zwei Listen:

| Spielerliste | Stammesliste |
|---|---|
| Rang, Name, Stammeskürzel, Punkte, Dörfer | Rang, Kürzel, Name, Mitglieder, Punkte, Punkte je Mitglied |

Barbaren zählen nicht mit — dieselbe Regel wie bisher. Gleichstand bekommt
denselben Rang; die Reihenfolge innerhalb eines Gleichstands wird über die
Spieler-ID stabilisiert, damit zwei Aufrufe nicht unterschiedlich sortieren.
Die Stammesdaten liefert `tribeInfo`/`tribeTags` aus
`packages/server/src/engine/tribes.ts`.

**Client.** `stores/RankingStore.ts` nach dem Muster der übrigen Stores
(`AsyncValue`, `load(worldId)`), Seite mit zwei Reitern (Spieler · Stämme), eigene
Zeile hervorgehoben und beim Öffnen ins Bild gescrollt. Spielernamen verlinken auf
das Profil, Stammeskürzel auf die Stammesseite.

Die Kopfzeile aus 18-1 zeigt Rang und Punkte aus demselben Store — geladen wird
also einmal, nicht je Ansicht.

## Profil

Route `/worlds/$worldId/profile` zeigt das eigene Profil. In 18-1 ist sie nur eine
Weiterleitung auf `players/$playerId`; hier wird sie eine eigene Ansicht.

`features/player/PlayerProfileView.tsx` wird wiederverwendet und bekommt einen
Modus „eigenes Profil":

- Die Dorfliste verlinkt auf die jeweilige Dorfansicht statt nur Koordinaten zu
  zeigen — damit ist sie der vierte Weg zum Dorfwechsel und zugleich die
  vermisste Gesamtübersicht über alle eigenen Dörfer (Punkt 4 der Anforderung).
  Zusätzliche Spalten: Punkte, Bauernhofplätze, Truppenanzahl.
- Haltung und Standing entfallen (`standing` ist für den eigenen Spieler
  ohnehin `null`, `routes.ts:330-333`).
- Stattdessen: Stamm mit Kürzel, Rang, Gesamtpunkte, Dorfanzahl.

Für die zusätzlichen Spalten braucht `PlayerProfile.villages` mehr als
`{ id, name, x, y, points }`. Entweder das Schema erweitern oder die Liste aus
`world.playerVillages` speisen — Ersteres ist sauberer, weil die Ansicht dann für
fremde Profile dieselbe Quelle hat.

`PlayerStore` hält heute genau ein Profil; ein zweiter Aufruf überschreibt das
erste. Das reicht, solange Kopfzeile und Profilseite nicht gleichzeitig laden —
mit dem eigenen Profil im Rahmen ist das nicht mehr sicher. Deshalb: das eigene
Profil bekommt einen eigenen `AsyncValue` neben dem betrachteten.

## Einstellungen

**Das Gerüst steht bereits** — `features/world/SettingsView.tsx` entstand in
18-1, weil Ton und Pause die Kopfzeile verlassen mussten und sonst gar nicht mehr
erreichbar gewesen wären. Vorhanden sind:

1. **Klang** — Stummschaltung, Lautstärkeregler und eine Probetaste.
2. **Welt** — Pausieren/Fortsetzen, Laufzustand, „Zurück zur Lobby".
3. **Weltparameter, nur lesbar** — Geschwindigkeit, Einheitentempo, Kartengröße,
   Bot- und Barbarenzahl, Startwert.

Reine Client-Seite, kein Server-Anteil. `WorldSettings` sind nach dem Anlegen
bewusst unveränderlich; es gibt keinen PATCH-Endpunkt und dieses Ticket schafft
auch keinen.

**Hier zu ergänzen:**

- **Gefahrenzone** — „Welt löschen" (`DELETE /api/worlds/:id` besteht bereits)
  mit Rückfrage.
- Die fehlenden Parameter: Siegbedingung (`victoryVillageShare`) und die
  Barbaren-Angriffsrate.
- Der Startwert steht schon da; er gehört sichtbar hierher, weil 18-3 das
  Gelände daraus ableitet und man eine Welt so nachbauen kann.

## Sprites und Texte

Die Symbole `icon.ranking`, `icon.profile` und `icon.settings` entstehen bereits
in 18-1. Neu hier: `nav.comingSoon` fällt weg, dafür kommen die Gruppen
`ranking`, `profile` und `settings` in `i18n/de.ts`.

## Verifikation

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
- Server-Test für `ranking()` in der Art von
  `packages/server/test/playerProfile.test.ts`: Barbaren tauchen nicht auf,
  Gleichstand bekommt denselben Rang und eine stabile Reihenfolge, der Rang eines
  Spielers stimmt mit dem überein, den der Profil-Endpunkt liefert (das ist der
  Test, der die doppelte Rechnung ausschließt), und die Stammespunkte sind die
  Summe der Mitgliederpunkte.
- Im Browser:
  1. Der Ranglistenreiter in der Kopfzeile zeigt denselben Rang und dieselbe
     Punktzahl wie die eigene Zeile in der Rangliste.
  2. Beide Ranglistenreiter (Spieler, Stämme) sortieren absteigend, die eigene
     Zeile ist hervorgehoben und sichtbar.
  3. Ein Klick auf einen Spielernamen führt ins richtige Profil, ein Klick auf
     ein Stammeskürzel auf die Stammesseite.
  4. Das eigene Profil listet alle eigenen Dörfer; ein Klick auf ein Dorf wechselt
     dorthin und ändert Adresszeile und Dorfleiste.
  5. Lautstärke und Stummschaltung auf der Einstellungsseite wirken sofort und
     überleben einen Reload.
  6. „Welt löschen" fragt nach und führt anschließend in die Lobby; die Welt ist
     dort verschwunden.
  7. Nach einer Eroberung ändert sich die Rangliste beim nächsten Öffnen.
