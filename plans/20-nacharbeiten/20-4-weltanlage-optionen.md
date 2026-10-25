# Ticket 20-4: Weltanlage: Besiedlung & Optionen

**Status:** 📋 offen · **Voraussetzung:** [19-6](../19-prototyp/19-6-weltkarte-kreisfoermige-besiedlung.md), [19-12](../19-prototyp/19-12-bogenschuetzen.md), [19-14](../19-prototyp/19-14-paladin-und-statue.md)

## Kontext

Das Formular „Welt anlegen" (`CreateWorldForm.tsx`) kennt Tempo und Barbaren-Aktivität
und seit 19-12 den Schalter für Bogenschützen. Es fehlen alle Einstellungen, die seit 19-6
und 19-14 dazugekommen sind: Kartengröße, Bots, Barbarendörfer, Besiedlungsdichte,
Barbaren je neuem Siedler und der Paladin. Wer eine Welt anlegt, bekommt sie heute
immer mit den Standardwerten.

## Kernentscheidung: Voreinstellung plus „Erweitert"

Das Formular bleibt kurz: Name, Tempo, Barbaren-Aktivität. Darunter liegt ein
aufklappbarer Bereich „Erweitert" mit Kartengröße, Bots, Barbarendörfern, Dichte,
Barbaren je Siedler, Bogenschützen und Paladin. Grenzen und Standardwerte kommen aus
`WorldSettingsPatchSchema` bzw. `DEFAULT_WORLD_SETTINGS`, nicht als Kopie im Client. Die
Gesamtprüfung („zu viele Dörfer für diese Kartengröße") macht der Server; ihr Fehler
erscheint im Formular.

## Verifikation

- Client-Test (`LobbyStore`): Die Einstellungen aus „Erweitert" gehen unverändert an
  `POST /api/worlds`.
- Server lehnt eine zu dichte Welt ab → verständlicher Fehler im Formular.
- Im Browser: Welt mit 2 Bots, Paladin aus, Dichte 0,05 anlegen und sehen, dass sie so
  entsteht.
