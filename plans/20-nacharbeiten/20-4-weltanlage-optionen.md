# Ticket 20-4: Weltanlage: Besiedlung & Optionen

**Status:** ✅ erledigt (2026-10-25) · **Voraussetzung:** [19-6](../19-prototyp/19-6-weltkarte-kreisfoermige-besiedlung.md), [19-12](../19-prototyp/19-12-bogenschuetzen.md), [19-14](../19-prototyp/19-14-paladin-und-statue.md)

> **Ergebnis:** Das Formular hat unter „Erweitert" (`<details>`) Kartengröße, Bots,
> Barbarendörfer, Besiedlungsdichte, Barbaren je neuem Spieler, Bogenschützen und Paladin.
> Die Grenzen stehen in den Beschriftungen und kommen aus `WORLD_LIMITS`
> (`shared/src/schema/world.ts`), das auch das Schema benutzt. Die Standardwerte kommen
> aus `DEFAULT_WORLD_SETTINGS`. Die Umrechnung (`features/lobby/worldForm.ts`) ist pur: Ein
> leeres Feld fällt weg, ein Komma gilt als Dezimalzeichen.
>
> **Dabei gefunden:** Eine zu dichte Welt beantwortete der Server mit **500 `internal`**,
> weil die Gesamtprüfung eine ungefangene `ZodError` warf. Jetzt gibt es 400
> `world_too_dense` mit einer verständlichen Meldung im Formular und `invalid_settings`
> für ungültige Felder im Manager.
>
> **Tests:** `client/test/world-form.test.ts` (Standardwerte unverändert, Eingaben mit
> Komma, leere Felder) und `test/integration/world-create.test.ts`:
> - Alle sieben Werte gehen über `POST /api/worlds` durch.
> - Eine zu dichte Welt ergibt 400 `world_too_dense`.
> - Ein Wert außerhalb der Grenzen ergibt 400 `invalid_input`.
>
> **Im Browser** als Admin: Die Welt mit Karte 200, 2 Bots, 5 Barbaren, Dichte 0,05 und
> Paladin aus entsteht genau so (geprüft über `GET /api/worlds/1`). Eine Welt mit Karte 20
> und 500 Bots zeigt „Zu viele Dörfer für diese Karte …" (Screenshot geprüft).
>
> **Abweichung:** Der Test liegt nicht im `LobbyStore`, der die Einstellungen nur
> durchreicht, sondern in der reinen Umrechnung, wo die Logik sitzt.

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
