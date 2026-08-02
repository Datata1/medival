# Ticket 18-5: Rangliste, Profil & Einstellungen

**Status:** 📋 offen · **Voraussetzung:** [18-1](18-1-rahmen-und-kopfzeile.md)

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
