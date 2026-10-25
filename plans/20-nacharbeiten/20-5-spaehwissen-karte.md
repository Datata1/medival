# Ticket 20-5: „Zuletzt erkundet" im Kartenpanel

**Status:** ✅ erledigt (2026-10-25) · **Voraussetzung:** [19-10](../19-prototyp/19-10-spaeher.md)

> **Ergebnis:** `GET /api/worlds/:id/villages/:vid/intel` liefert das Spähwissen **des
> anfragenden Spielers** über ein Dorf (`ScoutIntelSchema`: Zeitpunkt, Truppen, Wall,
> Punkte), sonst `null`. Ohne Spieler in der Welt gibt es 403 `not_joined`. Der
> `MapStore` lädt es bei der Auswahl eines Dorfes (`map.intel`). Das Kartenpanel zeigt
> bei fremden Dörfern und Barbaren:
> - „Zuletzt erkundet vor …: Wall …, Speerträger … · …" mit einem Link zu den Berichten
>   oder
> - „Noch nicht erkundet."
>
> **Tests:** `test/integration/intel.test.ts`:
> - A sieht nach dem Spähen B's Speere und Wall.
> - C, der nicht gespäht hat, bekommt `null`.
> - Ein Zuschauer bekommt 403.
>
> `client/test/stores.test.ts` prüft, dass die Auswahl das Wissen lädt und eine neue
> Auswahl es leert.
>
> **Im Browser:** Nach einem Spähangriff zeigt das Panel für das erkundete Barbarendorf
> „Zuletzt erkundet vor 0:06: Wall 0, Speerträger 5 · Schwertkämpfer 8", für ein anderes
> „Noch nicht erkundet." (Screenshot geprüft).
>
> **Abweichung:** Der Link führt zur Berichtsliste, nicht zu einem einzelnen Bericht.
> Eine Route je Bericht gibt es noch nicht; das gehört zur UX-Arbeit.

## Kontext

19-10 speichert das letzte Spähwissen je Spieler und Dorf in `scout_intel`. Die Bots
nutzen es, für Menschen ist es unsichtbar: Wer ein Dorf auf der Karte anklickt, sieht
nicht, ob und wann er es erkundet hat und was dort stand. Das Ergebnis von 19-10 nennt das
als nicht gebaut.

## Kernentscheidung: Wissen des Anfragenden, nur lesend

- `GET /api/worlds/:id/villages/:vid/intel` liefert das Spähwissen **des anfragenden
  Spielers** über dieses Dorf, sonst `null`. Fremdes Wissen gibt es nie (19-9).
- Das Kartenpanel (`TargetPanel.tsx`) zeigt „Zuletzt erkundet vor …" mit Wall und
  Truppen aus dem Bericht und einen Link zum Spähbericht. Ohne Wissen steht dort „Noch
  nicht erkundet".

## Verifikation

- Integrationstest: A späht B aus → A bekommt das Wissen, C bekommt `null`.
- Client-Test für die Anzeige im Panel. Im Browser nach einem Spähangriff geprüft.
