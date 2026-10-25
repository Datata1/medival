# Ticket 20-3: Truppen unterwegs bei Eroberung

**Status:** 📋 offen · **Voraussetzung:** [19-14](../19-prototyp/19-14-paladin-und-statue.md)

## Kontext

19-14 hat eine Lücke dokumentiert: Wird ein Dorf erobert, während Truppen von dort
unterwegs sind (Angriff, Unterstützung, Rückweg), gehören diese Bewegungen über
`origin_village_id` plötzlich dem **neuen** Besitzer. Kehren sie zurück, landen sie in
seinem Dorf. Für den Paladin heißt das: Der alte Besitzer hat keinen mehr und darf einen
neuen ernennen, der neue Besitzer hat womöglich zwei.

## Kernentscheidung: Wie in Tribal Wars gehen sie verloren

Truppen, die zu einem eroberten Dorf gehören und unterwegs sind, gehen verloren:

- Bei der Eroberung werden alle Bewegungen gelöscht, die von diesem Dorf ausgehen
  (`attack`, `support`, `return`), samt ihren Ankunfts-Events. Lieferungen (`trade`)
  bleiben, weil sie nur Rohstoffe tragen.
- War der Paladin dabei, wird sein Tod für den alten Besitzer vermerkt
  (`paladin_deaths`). Danach darf dieser ihn kostenlos wiederbeleben, wie nach einem
  Kampf.
- Der Eroberungsbericht nennt die verlorenen Truppen nicht. Das ist eine eigene
  Berichtsart und gehört in die UX-Arbeit.

## Verifikation

- Integrationstest: A schickt von Dorf X Truppen samt Paladin los, B erobert X →
  Bewegung und Ankunfts-Event sind weg, A's Paladin ist `dead`, B hat keinen Paladin
  dazubekommen. Die Invariante „ein Paladin je Spieler" hält.
- Eine Lieferung von X läuft weiter und kommt an.
