# Pläne

Sequenziell abzuarbeitende Vorhaben. **01–10** räumen technische Schuld auf, **11–13**
stellen die Weichen für Aussehen, Assets und Klang, **14–17** erwecken die Karte zum Leben
(Meilenstein 3), **18** macht die Oberfläche bedienbar, **19** macht aus dem Singleplayer einen Mehrspieler-Prototyp. Die Nummerierung ist die
empfohlene Reihenfolge:

| # | Plan | Bereich | Status |
|---|------|---------|--------|
| 01 | [Linter & Formatter (Biome)](01-linter-biome.md) | Repo-weit | ✅ erledigt |
| 02 | [Zeitsystem: GameTime & Duration](02-zeitsystem-shared.md) | shared + alle | ✅ erledigt |
| 03 | [Zeit-Stabilität in Node](03-zeit-stabilitaet-node.md) | server | ✅ erledigt |
| 04 | [Tailwind statt Hand-CSS](04-tailwind.md) | client | ✅ erledigt |
| 05 | [Feingranulare Komponenten](05-komponenten-granularitaet.md) | client | ✅ erledigt |
| 06 | [useEffect-Audit](06-useeffect-audit.md) | client | ✅ erledigt |
| 07 | [i18n mit react-i18next](07-i18n-react-i18next.md) | client (+API-Fehler) | ✅ erledigt |
| 08 | [Kein Typecasting („Parse, don't cast")](08-no-typecasting.md) | Repo-weit | ✅ erledigt |
| 09 | [State-Management mit MobX](09-mobx-state-management.md) | client | ✅ erledigt |
| 10 | [TanStack Router + Spielerprofile](10-tanstack-router.md) | client (+API) | ✅ erledigt |
| 11 | [Mittelalterliches Design (Pergament & Tinte)](11-mittelalterliches-design.md) | client | ✅ erledigt |
| 12 | [Assets: Pixel-Art-Sprites](12-assets-und-sprites.md) | client | ✅ erledigt |
| 13 | [Klang: Benachrichtigungen & Rückmeldung](13-sounds.md) | client | ✅ erledigt |
| 14 | [Barbarendörfer: zufälliges Wachstum](14-barbarendoerfer.md) | server + shared | ✅ erledigt |
| 15 | [Bot-Grundgerüst: Wahrnehmung → Entscheidung → Ausführung](15-bot-grundgeruest.md) | server + shared | ✅ erledigt |
| 16 | [Ansehen & Handel](16-ansehen-und-handel.md) | server + shared + client | ✅ erledigt |
| 17 | [Stämme & Krieg](17-staemme-und-krieg.md) | server + shared + client | ✅ erledigt |
| 18 | [UX-Überarbeitung (6 Tickets)](18-ux/README.md) | client (+shared, +server) | 📋 offen |
| 19 | [Vom Singleplayer zum Mehrspieler-Prototyp (15 Tickets)](19-prototyp/README.md) | server + shared + client | ✅ erledigt |
| 20 | [Nacharbeiten aus dem Prototyp (5 Tickets)](20-nacharbeiten/README.md) | server + client | ✅ erledigt |

**Warum diese Reihenfolge?**

- **01 zuerst:** Alle folgenden Refactorings entstehen dann bereits einheitlich formatiert und gelintet.
- **02/03 (Backend/shared) vor den Frontend-Umbauten:** unabhängig, und das Zeitmodul aus 02 wird vom Client mitgenutzt.
- **Frontend-Kette 04 → 05 → 06 → 07:** Tailwind ändert jede JSX-Datei (Klassen), der Komponenten-Split verschiebt das JSX in neue Dateien, das Effect-Audit ist nach dem Split pro Kleinkomponente trivial, und i18n fasst zum Schluss jeden sichtbaren String an. Diese Reihenfolge minimiert doppelten Churn.
- **09 vor 10:** Nach dem MobX-Umbau sind die Komponenten datenfrei, sodass der Router nur noch Sichtbarkeit und aktive IDs steuert. Andersherum müsste der Datenfluss zweimal angefasst werden — die Router-Loader würden zunächst gegen Query-Hooks verdrahtet, die unmittelbar danach wegfallen.
- **11 → 12 → 13:** Das Design legt Farbpalette und Raster fest, an denen sich die Sprites orientieren müssen — Assets vorher zu zeichnen hieße, sie zweimal zu zeichnen. Der Klang ist technisch unabhängig, seine Bedienelemente (Regler, Symbol) brauchen aber Design und Icons, die bis dahin stehen.
- **14 steht für sich:** Barbarendörfer teilen mit den Bots nur die Erkenntnis, dass die nächste Entscheidung *ausgerechnet* und nicht *abgefragt* wird (kein Tick). Sonst brauchen sie nichts von 15–17 und lassen sich jederzeit dazwischenschieben.
- **18 nach 17:** Die Oberfläche ist über siebzehn Pläne mitgewachsen, ohne je entworfen worden zu sein. Sie jetzt zu überarbeiten heißt, alle Bildschirme zu kennen, die es geben soll — vorher hätte jeder neue Plan die frische Schale wieder aufgebrochen. Plan 18 ist deshalb ein Ordner mit sechs weitgehend unabhängigen Tickets statt eines einzelnen Arbeitsschritts.
- **15 → 16 → 17:** Erst das Gerüst (Wahrnehmung → Entscheidung → Ausführung), dann Ansehen und Handel als Hebel, dann die Folgen in Stämmen und Krieg. Andersherum ginge es nicht: Ohne Ansehen gibt es keine Bedingung dafür, wen ein Bot angreift oder in seinen Stamm lässt. Jeder der drei Schritte endet mit etwas Spielbarem — Bots wachsen, Bots mögen dich, Bots handeln danach.

- **19 nach 17, vor 18-2…18-6:** Das Ziel hat sich geändert, von beschleunigtem Singleplayer zur Tribal-Wars-Alternative mit mehreren hundert Spielern. Plan 19 baut den Prototyp dafür: Testbasis, Zeit-Konsistenz, funktionierende Bots, eine 1000×1000-Karte mit kreisförmiger Besiedlung, Accounts und alle Basiseinheiten und -gebäude. 18-3 (Karte) wird vorher abgeschlossen und committet, weil 19-6/19-7 direkt darauf aufbauen. 18-2, 18-4, 18-5 und 18-6 werden zurückgestellt, denn 19-9 entfernt `PLAYER_ID` und würde jedes dieser Tickets noch einmal anfassen.

**Arbeitsweise:** Pro Plan ein zusammenhängender Arbeitsschritt. Nach Abschluss: Status-Spalte hier und die Status-Zeile im Plandokument aktualisieren. Nach jedem Plan müssen `pnpm lint` (ab 01), `pnpm typecheck`, `pnpm test` und `pnpm build` grün sein.
