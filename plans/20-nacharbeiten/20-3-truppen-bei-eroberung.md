# Ticket 20-3: Truppen unterwegs bei Eroberung

**Status:** ✅ erledigt (2026-10-25) · **Voraussetzung:** [19-14](../19-prototyp/19-14-paladin-und-statue.md)

> **Ergebnis:** Bei einer Eroberung löscht `abandonMarches` (`engine/military.ts`) alle
> Bewegungen, die vom eroberten Dorf ausgehen (`attack`, `support`, `return`), samt ihren
> `arrival`-Events. War der Paladin dabei, wird sein Tod für den alten Besitzer vermerkt.
> Lieferungen laufen weiter.
>
> **Dazu eine zweite Lücke derselben Art:** Unterstützung, die aus einem anderen Dorf des
> alten Besitzers **zum** eroberten Dorf unterwegs war, wäre dort angekommen und hätte
> den Eroberer verstärkt. Seitdem kehrt Unterstützung um, wenn das Ziel bei der Ankunft
> einem anderen Spieler gehört als der Ursprung.
>
> **Tests:** `test/integration/conquest.test.ts`:
> - Truppen samt Paladin sind von X unterwegs, als B X erobert. Danach gibt es keine
>   Bewegung von X mehr und kein verwaistes Ankunfts-Event. A's Paladin ist `dead`, B hat
>   keinen.
> - Unterstützung von Y nach X kommt nach der Eroberung an, bleibt nicht in X und landet
>   wieder in Y.
> - Eine Lieferung von X läuft weiter.
>
> Ohne die Änderung scheitern die ersten beiden Fälle (gegengeprüft).
>
> **Abweichung:** Der Eroberungsbericht nennt die verlorenen Truppen nicht (wie geplant,
> das gehört in die UX-Arbeit).

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
