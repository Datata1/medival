# Ticket 20-5: „Zuletzt erkundet" im Kartenpanel

**Status:** 📋 offen · **Voraussetzung:** [19-10](../19-prototyp/19-10-spaeher.md)

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
