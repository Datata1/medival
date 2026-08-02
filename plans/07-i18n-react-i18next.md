# Plan 07: i18n mit react-i18next (deutsch als einzige Sprache, vorbereitet für mehr)

**Status:** ✅ erledigt (2026-08-01) · **Nutzer-Punkt:** 4

> Umsetzungsnotizen: react-i18next mit typisiertem de.ts-Katalog (i18next.d.ts →
> CustomTypeOptions); Tippfehler in t()-Keys sind Compile-Fehler (gegengetestet).
> BUILDING_NAMES/UNIT_NAMES aus format.ts entfernt, stattdessen buildings.*/units.*.
> Server-GameErrors sind jetzt Codes (z. B. not_enough_resources); der Client
> übersetzt sie über lib/errors.ts (apiErrorMessage), unbekannte Codes werden roh
> gezeigt. Neue Client-Test-Suite (4 Tests) prüft Übersetzung und Katalog-
> Vollständigkeit gegen die Server-Codeliste. Keine deutschen Literale mehr
> außerhalb von i18n/de.ts (Grep-Kontrolle).

## Kontext

Alle UI-Strings sind hart kodiert (deutsch), verstreut über Komponenten plus die Lookup-Maps
`BUILDING_NAMES`/`UNIT_NAMES` in `packages/client/src/format.ts`. Ziel: **react-i18next**
von Anfang an, aber nur mit deutschem Katalog — Internationalisierung wird später zum reinen
Übersetzungsjob statt zum Refactoring. Zusätzlich: Server-Fehlermeldungen (`GameError`)
sind deutsch und wandern als Klartext durch die API — sie werden auf Fehler-Codes umgestellt.

## Schritte

1. **Setup:** `pnpm --filter @medival/client add i18next react-i18next`.
   `src/i18n/index.ts`: `i18next.use(initReactI18next).init({ lng: 'de', fallbackLng: 'de',
   resources: { de: { translation: de } }, interpolation: { escapeValue: false } })`;
   Import in `main.tsx` vor dem Rendern.
2. **Katalog `src/i18n/de.ts`** (TS statt JSON → `as const` für Typableitung), strukturiert:
   ```
   common:    (ok, cancel, delete, max, points, loading, …)
   lobby:     (title, subtitle, newWorld, worldName, create, saves, open, confirmDelete, …)
   world:     (pause, resume, backToLobby, tabs.village/map/reports, noVillageLeft, …)
   village:   (resources.wood/clay/iron, storage, population, buildQueue, buildings.headers.*,
               upgrade, maxLevel, requirementsMissing, recruit.*, unitsHome, …)
   map:       (legend.*, clickHint, travelTime, attack, support, ownVillage, barbarianVillage, …)
   reports:   (title, empty, attackOn, defenseOf, attacker, defender, losses, loot, wall,
               loyalty, conquered, luck, …)
   buildings: (headquarters, timber_camp, … — ersetzt BUILDING_NAMES)
   units:     (spear, sword, … — ersetzt UNIT_NAMES)
   errors:    (Codes aus Schritt 5)
   ```
3. **Typsicherheit:** `src/i18n/i18next.d.ts`:
   ```ts
   import type de from './de';
   declare module 'i18next' {
     interface CustomTypeOptions { resources: { translation: typeof de } }
   }
   ```
   → `t('village.upgrade')` ist compile-time-geprüft; eine spätere `en.ts` bekommt den Typ
   `typeof de` und meldet fehlende Keys als Typfehler.
4. **Migration:** Komponente für Komponente (nach Plan 05 sind sie klein):
   `useTranslation()` + `t('…')`; Interpolation für dynamische Teile
   (`t('map.travelTime', { duration })`, `t('village.populationOf', { used, max })`).
   `BUILDING_NAMES`/`UNIT_NAMES` löschen; Aufrufer nutzen `t(\`buildings.${type}\`)`.
   Zahlen-/Zeitformatierung bleibt in `lib/format.ts`, bekommt aber die aktive Locale
   aus `i18next.language` statt hartem `'de-DE'`.
5. **Server-Fehler als Codes:** `GameError` bekommt einen `code: string`
   (z. B. `not_enough_resources`, `queue_full`, `farm_too_small`, `barracks_missing`,
   `requirements_missing`, `not_enough_units`, `own_village_attack`, `support_own_only`,
   `max_level`, `village_not_found`, `world_not_found`, `invalid_input`).
   Fastify-Error-Handler liefert `{ error: code }`; deutsche Texte ziehen in den Client-Katalog
   (`errors.not_enough_resources: 'Nicht genug Rohstoffe'`). Server-Tests von Message- auf
   Code-Assertions umstellen. Unbekannte Codes rendert der Client als `errors.unknown`.
6. **Restkontrolle:** grep nach verbliebenen deutschen Literalen in `src/**/*.tsx`
   (Umlaute/ß als Heuristik) — erlaubt nur noch in `i18n/de.ts`.

## Verifikation

- `pnpm typecheck`: Key-Typisierung aktiv (bewusster Tippfehler in einem `t()`-Key muss
  einen Compile-Fehler geben — einmal manuell gegentesten).
- Browser-Smoke-Test: UI textlich unverändert deutsch; ein provozierter API-Fehler
  (z. B. Bauen ohne Rohstoffe) zeigt weiterhin die deutsche Meldung.
- `pnpm test` grün (Server-Tests auf Codes umgestellt); grep-Restkontrolle aus Schritt 6.
