# Plan 01: Linter & Formatter mit Biome

**Status:** ✅ erledigt (2026-08-01) · **Nutzer-Punkt:** 6

> Umsetzungsnotizen: Biome 2.5.6; `rules.preset` statt deprecated `recommended: true`.
> Zusätzlich behoben: fehlende `type="button"`-Attribute (a11y/useButtonType), ein
> Label-ohne-Control in MapView (htmlFor/id), unbenutzte Importe. Der bekannte
> useEffect-Verstoß in ReportsView trägt eine dokumentierte `biome-ignore`-Suppression
> mit Verweis auf Plan 06. 21 akzeptierte noNonNullAssertion-Warnungen (siehe oben).

## Kontext

Die Codebase ist bisher ungelintet und uneinheitlich formatiert (gewachsene Handformatierung).
Ein Tool soll Formatierung und Linting vereinheitlichen, bevor die großen Refactorings
(Pläne 02–07) beginnen — so entstehen alle Folgeänderungen direkt im einheitlichen Stil.
Entscheidung: **Biome** (ein Tool für Format + Lint, sehr schnell, eine Config fürs Monorepo).

## Schritte

1. **Installation:** `pnpm add -D -w @biomejs/biome` (Root-Dev-Dependency).
2. **`biome.json` im Root** anlegen:
   - Formatter: `lineWidth: 100`, `quoteStyle: 'single'`, `indentStyle: 'space'`, `indentWidth: 2`,
     `trailingCommas: 'all'` — entspricht dem bereits dominanten Stil, minimiert das Diff.
   - Linter: `recommended: true` plus explizit:
     - `correctness/useExhaustiveDependencies: 'error'` (Grundlage für Plan 06),
     - `correctness/noUnusedImports: 'error'`, `correctness/noUnusedVariables: 'warn'`.
   - Abschwächungen (dokumentierte Ausnahmen):
     - `style/noNonNullAssertion: 'warn'` — das Drizzle-Pattern `.returning(...).all()[0]!`
       ist bewusst; später ggf. durch einen `firstRow()`-Helper ersetzen.
     - `suspicious/noExplicitAny: 'error'` bleibt an (es gibt aktuell kein `any`).
   - `files.ignore`: `dist/`, `node_modules/`, `data/`, `*.sqlite*`.
   - VCS-Integration aus (kein Git-Repo bisher): `vcs.enabled: false`.
3. **Scripts** in Root-`package.json`:
   - `"lint": "biome check ."`
   - `"lint:fix": "biome check --write ."`
   - `"format": "biome format --write ."`
4. **Einmaliger Normalisierungslauf:** `pnpm lint:fix`, danach verbleibende Meldungen
   manuell beheben (erwartbar: Import-Sortierung, unbenutzte Importe wie `UnitType` in
   `packages/client/src/MapView.tsx`, kleinere Stilfragen).
5. **Editor-Hinweis** in README ergänzen (Biome-VSCode-Extension, `biome.json` wird erkannt).

## Verifikation

- `pnpm lint` läuft fehlerfrei (Warnungen dokumentiert/akzeptiert).
- `pnpm test` (43 Tests) und `pnpm build` unverändert grün — der Lauf ist rein kosmetisch.
