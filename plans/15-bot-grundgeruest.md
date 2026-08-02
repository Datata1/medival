# Plan 15: Bot-Grundgerüst — Wahrnehmung, Entscheidung, Ausführung

**Status:** ✅ erledigt (2026-08-02) · **Voraussetzung:** keine · **Grundlage für:** [16](16-ansehen-und-handel.md), [17](17-staemme-und-krieg.md)

> **Ergebnis:** Das Gerüst steht — `perceive.ts` liest, `decide/build.ts` entscheidet pur,
> `execute.ts` führt über dieselben Kommandos aus wie der Spieler. Bots bauen nach
> Rangfolge statt Zufall, sparen auf Ziele, die sie sich noch nicht leisten können, und
> merken sich das über Neustarts hinweg in `ai_state_json`.
>
> **Gemessen** (10 Bots gegen 10 Barbaren, gleiche Startlage, simulierte Spielwoche):
> Bots **42 915 Punkte gegen 15 556** — Faktor **2,8**. Bots starten dabei *hinter* den
> Barbaren (190 zu 612 Punkte, weil Barbaren mit Rohstoffgebäuden auf Stufe 2–6 beginnen)
> und überholen sie. Persönlichkeiten unterscheiden sich am Ende der Woche messbar:
>
> | | Wall | Hauptgebäude | Kaserne |
> |---|---|---|---|
> | turtle | **20,0** | 15,0 | 15,0 |
> | raider | 18,0 | 23,0 | **19,0** |
> | expander | 17,0 | **24,0** | 16,0 |
>
> **30 Server-Tests, 6 Verteilungstests für `timeUntilAffordable`, 6 von 6 Prüfungen im
> Browser.** `check-ai-purity.mjs` läuft in `pnpm lint` und wurde durch absichtliches
> Einschmuggeln eines `world.db`-Imports geprüft — er fing alle drei Verstöße
> (DB-Schema, Drizzle, `Date.now`).
>
> **Drei echte Fehler, die erst die Ausführung bzw. der Browser gezeigt hat:**
>
> 1. **`max_level` im laufenden Betrieb.** `World.upgradeBuilding` rechnet die Bauschleife
>    in die Zielstufe ein, die Entscheidung tat es nicht — ein bereits eingereihtes Gebäude
>    wurde ein zweites Mal auf dieselbe Stufe geschickt. Sichtbar wurde es nur, weil
>    `execute.ts` abgewiesene Intents **protokolliert** statt sie zu verschlucken. Der
>    Snapshot trägt jetzt `plannedLevels` neben `levels`.
> 2. **Bots bauten nur Speicher.** Die erste Speicher-Regel verlangte Platz für 1,5 Stunden
>    Produktion. Bei Speed 200 sind das Speicher Stufe 12, *bevor* ein Bot sein erstes
>    Holzfällerlager ausbaut — im Browser hatten nach einer Minute alle Bots Speicher 3,0
>    und sonst alles auf Stufe 1. Ein zweiter Entwurf („Speicher erst, wenn gar nichts mehr
>    passt") war rein reaktiv und kostete ein Drittel des Wachstums. Die jetzige Regel ist
>    vorausschauend: Das beste Wirtschaftsziel wird *ohne* Rücksicht aufs Lager bestimmt;
>    passt es nicht hinein, ist der Speicher dran. Geschwindigkeitsunabhängig.
> 3. **Alle Bots bauten nur Hauptgebäude.** Der Vergleich zwischen Wirtschafts- und
>    Persönlichkeitszweig lautete `weights[category] >= weights.economy` — rohe
>    Kategoriegewichte ohne Kostenbezug. Weil `expansion` bei fast jeder Persönlichkeit
>    mindestens so hoch liegt wie `economy`, gewann immer das Hauptgebäude, und alle vier
>    Persönlichkeiten verhielten sich identisch. Jetzt werden beide Zweige auf derselben
>    Skala bewertet (`gewicht / √kosten`).
>
> **Ein ehrlicher Zielkonflikt:** Fehler 3 zu beheben hat das Wachstum von Faktor 3,6 auf
> 2,8 gesenkt. Das Hauptgebäude senkt Bauzeiten um 4 % je Stufe, es zu spammen war also
> versehentlich stark — aber es machte alle Persönlichkeiten gleich, und genau die sind
> der Zweck dieses Plans. Der niedrigere Faktor ist der bewusst gezahlte Preis.
>
> **Abweichungen von der Planung:** `decide/plan.ts` gibt es nicht — die Sparziel-Logik
> passte in `bot.ts` (`planBot`) und `decide/build.ts`, eine dritte Datei wäre leer
> geblieben. Der `BotSnapshot` enthält noch keine Nachbarn und keine eingehenden Angriffe;
> beides braucht erst Plan 16 bzw. 17 und wäre jetzt unbenutzter Ballast.
>
> **Nebenbefund:** Der Test „Warteschlange bleibt nicht blockiert" musste Bots *und*
> Barbaren abschalten (`botCount: 0`). Mit lebenden Ketten ist die Event-Warteschlange nie
> leer — der Test prüfte zu Recht genau das.

## Kontext

`engine/mapgen.ts` legt 30 Bot-Spieler an, jeder mit einer Persönlichkeit aus
`turtle` / `raider` / `expander` / `balanced` und einem eigenen Dorf. Diese Persönlichkeit
wird bislang genau einmal gelesen — um sie im Spielerprofil **anzuzeigen**
(`api/routes.ts:171`). Auf das Verhalten wirkt sie nicht. `players.difficulty` und
`players.ai_state_json` werden seit Meilenstein 1 geschrieben und **nie** gelesen. Ein
Bot-Dorf verhält sich heute exakt wie ein Barbarendorf vor Plan 14: unverändert bis in alle
Ewigkeit.

Dieser Plan bringt noch keine Diplomatie und keinen Krieg — er baut das **Gerüst**, auf dem
16 und 17 aufsetzen, und beweist es an der einfachsten Aufgabe: Bots sollen sichtbar klüger
ausbauen als Barbaren.

---

## Die Kernentscheidung: drei Schichten mit einer harten Grenze in der Mitte

Die Frage war: *„Wie kann man solche komplexen Bots programmieren?"* Die ehrliche Antwort
lautet nicht „mit einem cleveren Algorithmus", sondern: **indem man Datenbeschaffung,
Regelwerk und Ausführung trennt.** Bot-Code wird nicht durch schlaue Heuristiken
unwartbar, sondern dadurch, dass eine Funktion gleichzeitig SQL absetzt, abwägt, würfelt
und schreibt. So etwas lässt sich weder testen noch später erweitern.

| Schicht | Ort | Kennt | Testbar |
|---|---|---|---|
| **Wahrnehmung** | `server/src/ai/perceive.ts` | Datenbank, Uhr | mit Datenbank |
| **Entscheidung** | `server/src/ai/decide/*.ts` | **nur den Snapshot** | ohne alles |
| **Ausführung** | `server/src/ai/execute.ts` | `World`-Kommandos | mit Datenbank |

```
perceive(world, playerId) ─→ BotSnapshot
                                  │
                        decide(snapshot, rng) ─→ Intent[]      ← pure
                                                    │
                                    execute(world, intents)
```

Die mittlere Schicht besteht aus **puren Funktionen** `(snapshot, rng) → Intent[]`. Kein
Datenbankzugriff, keine Uhr, kein Zufall außer dem hereingereichten. Ein Test dafür lautet:
Snapshot als Literal hinschreiben, Intents prüfen — ohne SQLite, ohne Scheduler, ohne
laufende Welt. Das ist derselbe Gewinn, den Plan 09 im Client gebracht hat, wo der gesamte
Datenfluss ohne Rendering prüfbar wurde.

**Ausgeführt wird über dieselben Kommandos, die auch der Spieler benutzt** —
`upgradeBuilding`, `recruitUnits`, `sendUnits`. Bots bekommen keine Sonderrechte, keine
Rabatte und keinen zweiten Regelsatz. Was für sie gilt, gilt für alle; eine
Balancing-Änderung wirkt automatisch auf beiden Seiten. Genau hier gehen Spiele dieser Art
sonst kaputt: Der Bot bekommt „aus Vereinfachung" eine eigene Bauroutine, und ein halbes
Jahr später baut er Gebäude, die es für den Spieler gar nicht mehr gibt.

**Erweiterbarkeit wird damit konkret** statt zur Absichtserklärung:

- ein neues Verhalten = eine neue pure Funktion plus ein Eintrag in der Gewichtstabelle;
- eine neue Persönlichkeit = eine Datenzeile, kein Code;
- ein neuer Test = ein Literal, keine Testwelt.

### Die Grenze wird durchgesetzt, nicht empfohlen

`scripts/check-ai-purity.mjs` verbietet Dateien unter `ai/decide/` jeden Import von `db/`,
`drizzle-orm`, `world.js` und `military.js` — mit Selbsttest, eingehängt in `pnpm lint`,
wie `check-layering.mjs` aus Plan 09 und `check-no-casts.mjs` aus Plan 08.

Ohne diese Prüfung wandert beim ersten Zeitdruck ein `world.db.select()` in eine
Entscheidungsfunktion („nur diese eine Abfrage"), und der gesamte Testgewinn ist weg. Eine
Konvention, die niemand prüft, ist in einem halben Jahr keine Konvention mehr.

---

## Die zweite Kernentscheidung: den Zeitpunkt ausrechnen statt zu warten

Bots sollen ausbauen, **sobald** sie es sich leisten können — anders als Barbaren, die
gewürfelt werden (Plan 14). Naiv hieße das: regelmäßig nachschauen, ob es schon reicht.
Das wäre wieder ein Tick, und damit wieder das eine Prinzip verletzt, auf dem diese Engine
steht.

Weil die Produktion deterministisch ist, muss man auf den Zeitpunkt nicht warten — man kann
ihn **ausrechnen**:

```
t = max über {wood, clay, iron} von   (kosten_r − vorrat_r) / rate_r
```

Der nächste `bot_tick` wird auf genau diesen Zeitpunkt gelegt. Kein Nachschauen, keine
Schleife, ein Event pro Bauentscheidung.

Drei Sonderfälle, die die Entscheidungsfunktion abfangen muss — jeder davon wäre sonst eine
Endlosschleife oder ein Stillstand:

| Fall | Bedeutung | Antwort |
|---|---|---|
| `rate_r == 0` und Kosten > Vorrat | nie erreichbar | erst das Rohstoffgebäude bauen |
| Kosten > Speicherkapazität | nie erreichbar | erst den Speicher ausbauen |
| Ziel bereits bezahlbar | `t = 0` | sofort ausführen |

Zusätzlich eine **Obergrenze** für das Denkintervall: Ein Bot denkt spätestens nach
`maxThinkInterval` erneut nach, auch wenn sein Sparziel noch fern ist. Sonst verschläft er
alles, was die Lage zwischendurch ändert — einen eingehenden Angriff, eine erhaltene
Lieferung, ein zerstörtes Gebäude. Ereignisse, die die Lage ändern, planen den Tick
außerdem sofort neu.

---

## Umsetzung

### `ai/perceive.ts` → `BotSnapshot`

Ein Lesevorgang pro Tick, danach kein Datenbankzugriff mehr:

- eigene Dörfer mit Ressourcen, Raten, Speicherkapazität, Gebäudestufen, Bau- und
  Rekrutierungsschleife, `popInUse` / `farmCapacity`;
- Nachbardörfer nach Entfernung (Punkte, Besitzer, Koordinaten);
- eingehende Angriffe mit Ankunftszeit;
- Persönlichkeit, Schwierigkeit, Spielzeit.

Der Snapshot ist bewusst **flach und ohne Verhalten** — ein Datenobjekt, das sich als
Literal hinschreiben lässt. Sobald er Methoden bekäme, wäre der Testgewinn dahin.

### `ai/intents.ts` → was ein Bot tun will

`Intent` als discriminated union: `build` | `recruit` | `send` | `ship`. Die letzten beiden
werden erst in 16 und 17 erzeugt, gehören aber von Anfang an in den Typ — sonst wird die
Ausführungsschicht später umgebaut statt erweitert.

Mit Zod-Schema, damit ein Intent auch in `ai_state_json` überleben kann (Plan 08: was das
Programm betritt, wird geparst). Ein Bot, der auf ein Sparziel hinarbeitet, muss sich dieses
Ziel über Neustarts hinweg merken können.

### `ai/decide/build.ts` → Prioritäten statt Zufall

Das ist der sichtbare Unterschied zu Plan 14. Keine Gewichtstabelle, sondern eine
Rangfolge, die die Lage liest:

1. **Bauernhof**, wenn die Bevölkerung klemmt — sonst blockiert alles andere.
2. **Speicher**, wenn er zum Engpass wird (Vorrat regelmäßig am Anschlag, oder das nächste
   Ziel passt nicht hinein).
3. **Rohstoffgebäude** mit dem besten Verhältnis Mehrertrag zu Kosten. Die Formeln dafür
   stehen längst in `shared` (`buildCost`, `productionPerHour`) — der Bot rechnet mit
   denselben Zahlen, die dem Spieler in der Oberfläche angezeigt werden.
4. **Persönlichkeit**: Wall für `turtle`, Kaserne für `raider`, Hauptgebäude für
   `expander`, gemischt für `balanced`.

### `ai/personalities.ts` → Persönlichkeit ist eine Tabelle

Gewichte und Prioritäten als **Daten**, nicht als `if`-Kaskade:

```ts
export const PERSONALITIES = {
    turtle:   { wall: 3.0, barracks: 1.0, expansion: 0.3, aggression: 0.1, … },
    raider:   { wall: 0.5, barracks: 3.0, expansion: 1.0, aggression: 2.5, … },
    expander: { wall: 0.8, barracks: 1.2, expansion: 3.0, aggression: 0.8, … },
    balanced: { wall: 1.0, barracks: 1.0, expansion: 1.0, aggression: 1.0, … },
} as const satisfies Record<Personality, PersonalityWeights>;
```

`difficulty` skaliert quer dazu Denkintervall und Risikobereitschaft. Eine fünfte
Persönlichkeit ist damit eine Zeile — und `satisfies` sorgt dafür, dass ein vergessenes
Gewicht ein Compile-Fehler ist, kein stiller Standardwert.

### `ai/execute.ts` → Intents auf Kommandos abbilden

Mit **Obergrenze pro Tick**, sonst leert ein Bot in einem Zug sein ganzes Lager. Ein
`GameError` aus einem Kommando wird protokolliert und übersprungen — er bedeutet, dass die
Entscheidungsschicht etwas Unbezahlbares vorgeschlagen hat, und das ist ein Fehler im Bot,
kein Alltagsfall.

### Verdrahtung

Event `bot_tick { playerId }`, Schema in `shared/src/schema/events.ts`, Zweig in
`world.ts:handleEvent`. Erste Ticks in `mapgen.ts` mit zufälligem Versatz — 30 Bots, die
gleichzeitig denken, wären ein unnötiger Ausschlag in der Event-Loop-Latenz.

---

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/ai/perceive.ts` | **neu** — Snapshot bauen |
| `server/src/ai/intents.ts` | **neu** — Intent-Union + Zod |
| `server/src/ai/personalities.ts` | **neu** — Gewichte als Daten |
| `server/src/ai/decide/build.ts` | **neu** — pure Bauentscheidung |
| `server/src/ai/execute.ts` | **neu** — Intents → Kommandos |
| `server/src/ai/bot.ts` | **neu** — Tick-Handler, klebt die drei Schichten zusammen |
| `shared/src/schema/events.ts` | `bot_tick` in `EVENT_SCHEMAS` |
| `shared/src/logic/formulas.ts` | `timeUntilAffordable(have, cost, rates, capacity)` |
| `shared/src/types.ts` | `RESOURCE_KEYS` |
| `server/src/engine/world.ts` · `mapgen.ts` | Zweig in `handleEvent`, erste Ticks |
| `scripts/check-ai-purity.mjs` | **neu** — Reinheitsprüfung mit Selbsttest |
| `package.json` | `check:ai-purity` in `pnpm lint` |

Keine neuen Tabellen: `players.personality`, `difficulty` und `ai_state_json` existieren
bereits und werden endlich benutzt.

---

## Verifikation

- **Entscheidung, ohne Datenbank:** je Persönlichkeit ein Satz Tests mit Snapshot-Literalen.
  `turtle` baut messbar mehr Wall als `raider`, `raider` mehr Kaserne, `expander` mehr
  Hauptgebäude. Bevölkerung am Anschlag → Bauernhof zuerst. Ziel größer als der Speicher →
  Speicher zuerst, keine Endlosschleife.
- **`timeUntilAffordable`, pur:** bereits bezahlbar → 0; Rate 0 und fehlender Rohstoff →
  „nie"; die zurückgegebene Zeit stimmt mit `projectResources` überein (dieselbe Rechnung,
  einmal vorwärts, einmal rückwärts — der Test hält beide zusammen).
- **`check-ai-purity.mjs`:** Selbsttest beweist, dass ein eingeschmuggelter
  `world.db`-Import erkannt wird und erlaubte Importe durchgehen. Ein Prüfer, der still
  nichts findet, ist schlimmer als keiner.
- **Engine-Test:** Welt mit 10 Bots und 10 Barbaren über eine simulierte Spielwoche. Bots
  liegen deutlich vor Barbaren bei den Punkten — der Nachweis, dass „klüger ausbauen"
  tatsächlich stattfindet und nicht nur behauptet wird.
- **Determinismus:** Derselbe Seed erzeugt dieselbe Weltentwicklung. Ohne das ist kein
  Balancing-Vergleich möglich.
- **Last:** Events pro Sekunde und Event-Loop-Latenz aus `/api/health`, zusammen mit den
  Barbaren aus Plan 14 gemessen.
- **Im Browser:** Ein Bot-Dorf im Spielerprofil (Plan 10) über die Zeit beobachten — Punkte
  und Gebäudestufen steigen.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
