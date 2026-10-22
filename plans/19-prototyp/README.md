# Plan 19: Vom Singleplayer zum Mehrspieler-Prototyp

**Status:** 📋 offen · **Voraussetzung:** [Plan 17](../17-staemme-und-krieg.md), Abschluss von
[18-3](../18-ux/18-3-karte.md) (die Kartenänderungen liegen uncommittet in `master`)

Die Pläne 01–17 haben ein vollständiges, aber **beschleunigtes Singleplayer-Spiel** gebaut:
ein Mensch (`PLAYER_ID = 1`), 30 Bots, Speed 100–500x, pausierbare Uhr, eine Karte bis
500×500. Das Ziel ändert sich jetzt: Medival soll eine echte Tribal-Wars-Alternative
im Browser werden. Dieser Plan baut den **Prototyp**: Er beweist, dass Engine, Bots, Karte
und Regelwerk mit mehreren hundert Spielern auf einer 1000×1000-Welt tragen. Danach
entsteht daraus ein **Proof of Concept** (PoC), der Grundlage für eine echte Webanwendung ist.

Wie Plan 18 ist dieser Plan ein Ordner mit Tickets. Anders als dort hängen sie stärker
zusammen. Die Reihenfolge unten ist keine Empfehlung, sondern weitgehend erzwungen.

| # | Ticket | Bereich | Status |
|---|---|---|---|
| 19-1 | [Integrationstest-Harness](19-1-integrationstest-harness.md) | server (Tests) | ✅ erledigt |
| 19-2 | [Zeit-Engine: Konsistenz & Millisekunden](19-2-zeit-engine-konsistenz.md) | server + shared | ✅ erledigt |
| 19-3 | [Wanduhr & Welt-Lebenszyklus](19-3-wanduhr-und-lebenszyklus.md) | server + client | ✅ erledigt |
| 19-4 | [Bots reparieren](19-4-bots-reparieren.md) | server | ✅ erledigt |
| 19-5 | [Bot-Wahrnehmung skalierbar](19-5-bot-wahrnehmung-skalierbar.md) | server | ✅ erledigt |
| 19-6 | [Weltkarte 1000×1000, kreisförmige Besiedlung](19-6-weltkarte-kreisfoermige-besiedlung.md) | shared + server | 📋 offen |
| 19-7 | [Karten-API nach Ausschnitt](19-7-karten-api-ausschnitt.md) | server + client | 📋 offen |
| 19-8 | [Accounts & Session](19-8-accounts-und-session.md) | server + shared + client | 📋 offen |
| 19-9 | [Welt beitreten & Mehrspieler-Rechte](19-9-welt-beitreten-und-rechte.md) | server + client | 📋 offen |
| 19-10 | [Späher & Spähberichte](19-10-spaeher.md) | shared + server + client | 📋 offen |
| 19-11 | [Werkstatt, Katapult, Rammbock-Umzug](19-11-werkstatt-katapult.md) | shared + server + client | 📋 offen |
| 19-12 | [Bogenschützen](19-12-bogenschuetzen.md) | shared + server + client | 📋 offen |
| 19-13 | [Schmiede, Versammlungsplatz, Versteck](19-13-schmiede-versammlungsplatz-versteck.md) | shared + server + client | 📋 offen |
| 19-14 | [Paladin & Statue](19-14-paladin-und-statue.md) | shared + server + client | 📋 offen |
| 19-15 | [Lastprobe & Abnahme](19-15-lastprobe.md) | server + scripts | 📋 offen |

## Warum diese Reihenfolge?

- **19-1 zuerst.** Die bestehenden Wochen-Simulationen haben den größten Fehler des
  Projekts übersehen (Bots schlafen 10 Minuten nach jeder vollen Bauschleife, siehe 19-4),
  weil `clock.skip(1h)` + ein `processDue()` höchstens 200 Events je Stunde verarbeitet und
  alle zum Zeitpunkt „Ende der Stunde" laufen. Jedes weitere Ticket braucht einen Harness,
  der die Welt so ablaufen lässt wie der echte Server.
- **19-2 vor allem anderen in der Engine.** Konsistenz bei Gleichstand, ganzzahlige
  Millisekunden und „Nachholen vor jedem Befehl" sind die Grundlage dafür, dass mehrere
  Menschen gleichzeitig in derselben Welt handeln können. Dazu kommt die Rekrutierung
  ohne Event je Einheit. Ohne sie misst die Lastprobe ein Problem, das es nicht geben müsste.
- **19-4 direkt danach.** Der Bot-Fehler ist klein und sofort sichtbar. Mit 19-1 und 19-2
  bekommt er einen Regressionstest, der ihn ohne die beiden nicht hätte.
  *Umgesetzt wurde 19-4 vor 19-2:* Korrekte Event-Zeit (19-2) entlarvte die alten
  Wochentests, die sich erst ohne die Lieferschleife aus 19-4 ehrlich einmessen ließen.
  Der Harness aus 19-1 reicht 19-4 als Grundlage.
- **19-3 nach 19-4**, weil die Bots erst funktionieren müssen, bevor die Zeit nicht mehr
  angehalten werden kann.
- **19-5 vor 19-6.** Eine 1000×1000-Karte mit tausenden Dörfern macht die Wahrnehmung,
  die heute jedes Dorf der Welt liest, sofort zum Engpass.
- **19-6 → 19-7.** Erst gibt es die große Karte, dann muss der Client sie in Teilen laden.
- **19-8 → 19-9.** Erst wissen, wer jemand ist, dann prüfen, was er darf.
- **19-10 bis 19-14 sind Inhalt** in einer festen Kette:
  19-10 (Späher) führt `attackClass` ein, auf dem 19-12 (Bogenschützen) aufbaut.
  19-11 (Werkstatt) muss vor 19-13 kommen, weil die Schmiede die Forschung für
  Werkstatt-Einheiten freischaltet. 19-13 braucht außerdem die Bogenschützen aus 19-12
  für die Forschungstabelle. 19-14 (Paladin) baut auf `unitsEnabled` aus 19-12 auf.
  Damit ergibt sich: 19-10 → 19-11 → 19-12 → 19-13 → 19-14. Nur 19-10 und 19-11 sind
  untereinander frei.
- **19-15 zuletzt.** Die Lastprobe ist die Abnahme des Prototyps und entscheidet die
  in Plan 03 offengelassene Frage „Worker pro Welt".

**Verhältnis zu Plan 18.** 18-3 (Karte) wird abgeschlossen und committet, bevor 19-6
beginnt: Die uncommitteten Änderungen an `mapgen.ts`, `MapCanvas.tsx` und `useMapCamera.ts`
überschneiden sich direkt mit 19-6/19-7. 18-2, 18-4, 18-5 und 18-6 werden zurückgestellt.
Sie bleiben gültig, aber jedes davon würde durch 19-9 (kein `PLAYER_ID` mehr) noch einmal
angefasst.

## Entwurfsentscheidungen

Mit dem Nutzer entschieden:

| Frage | Entscheidung | Betrifft |
|---|---|---|
| Wer spielt im Prototyp? | **Mehrspieler minimal**: Login, Welt beitreten, Rechteprüfung pro Kommando. Bots als normale Spieler daneben | 19-8, 19-9 |
| Worker-Threads für die Zeitgenauigkeit? | **Nein.** Genauigkeit entsteht durch Zeitstempel und Nachholen vor jedem Befehl, nicht durch den Timer. Worker pro Welt bleibt der vorbereitete Pfad aus Plan 03, entschieden durch die Lastprobe | 19-2, 19-15 |
| Kartengröße | **1000×1000**, Kontinente à 100×100 → **100 Kontinente K00–K99** | 19-6, 19-7 |
| Besiedlung | **Kreisförmig von der Mitte aus**, keine Platzierung nahe Freunden (PoC) | 19-6, 19-9 |
| Einheiten | **Alle Tribal-Wars-Basiseinheiten** inkl. Späher. Paladin und Bogenschützen als **Welt-Einstellung** (Standard: an) | 19-10 … 19-14 |
| Gebäude | **Alle Basisgebäude**, keine Spezialgebäude (Kirche, Wachturm) | 19-11, 19-13, 19-14 |

## Ausdrücklich nicht im Prototyp (sondern PoC)

Damit der Umfang beherrschbar bleibt, steht hier, was bewusst fehlt:

- Anmeldezeitraum, Weltstart zu einem festen Termin, Weltende nach Regelwerk
- Platzierung nahe Freunden, Stämme-Premades vor Weltstart zusammensetzen
- E-Mail-Bestätigung, Passwort-Reset, OAuth, Mehrfach-Account-Erkennung
- Worker-Thread pro Welt (nur wenn 19-15 die Schwellen reißt), Postgres statt SQLite
- Kirche, Wachturm, Paladin-Waffen, Münzen/Pakete für Adelsgeschlechter
- Premium, Urlaubsvertretung, Account-Sitting

## Für alle Tickets verbindlich

Diese Regeln stehen einmal hier statt fünfzehnmal in den Tickets.

**Prüfungen.** Nach jedem Ticket sind `pnpm lint`, `pnpm typecheck`, `pnpm test` und
`pnpm build` grün. Ab 19-1 zusätzlich `pnpm test:integration`. `pnpm lint` schließt die
eigenen Prüfskripte ein: keine Casts, Schichten, Kontrast, Assets, KI-Reinheit.

**Jedes Ticket bringt Szenario-Tests mit.** Ein Feature gilt erst als fertig, wenn ein
Integrationstest über den Harness aus 19-1 es von außen beweist (z. B. „A späht B aus →
A erhält einen Bericht mit B's Truppen, B nicht"). Reine Unit-Tests der Formeln in
`shared/` bleiben zusätzlich Pflicht.

**Neue Einheiten und Gebäude** (19-10 bis 19-14) ändern jedes Mal dieselben Stellen.
Die Liste steht einmal hier:

- `shared/src/types.ts` (`UnitType` / `BuildingType`), `shared/src/data/units.ts` bzw.
  `buildings.ts` (Spezifikation, `UNIT_ORDER` / `BUILDING_ORDER`, `EMPTY_BUILDING_LEVELS`)
- `server/src/db/ddl.ts`: Die `CHECK`-Listen werden aus `UNIT_ORDER`/`BUILDING_ORDER`
  erzeugt. Bestehende Welt-DBs brauchen deshalb eine Migration in `migrateWorldDb`,
  denn SQLite kann `CHECK` nicht ändern. Weg: Tabelle neu anlegen und Daten umkopieren.
  Für den Prototyp ist alternativ „alte Welten werden nicht migriert" zulässig, muss
  aber im Ticket entschieden und dokumentiert werden.
- `server/src/engine/mapgen.ts`: Startstufen, Barbaren-Garnisonen
- `server/src/ai/personalities.ts` (`BUILDING_CATEGORY`), `ai/decide/recruit.ts`
- Client: `i18n/de.ts`, Sprites über `scripts/lib/sprite-definitions.mjs` +
  `pnpm assets:generate` + `assets/registry.ts`, Handbuch (`HandbookView.tsx` liest aus
  `@medival/shared`)

**Welt-Einstellungen** (`archers`, `paladin`, Dichte usw.) kommen als Feld **mit
`.default()`** in `shared/src/schema/world.ts`. So bleiben ältere `settings_json` lesbar,
nach demselben Muster wie `barbarianAttemptsPerHour`.

**Zeit.** Kein Handler und kein Kommando ruft `world.now()` für die Fachlogik auf, wenn es
einen Zeitpunkt gereicht bekommt (ab 19-2). Rohe Millisekunden-Rechnung bleibt
außerhalb von `shared/src/time.ts` verboten (Plan 02).

**Formatierung.** Biome: vier Leerzeichen, Zeilenbreite 72, einfache Anführungszeichen.
Texte nur über `i18n/de.ts`, Symbole nur als Sprites.
