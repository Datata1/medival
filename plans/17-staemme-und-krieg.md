# Plan 17: Stämme und Krieg — wenn Haltung Folgen hat

**Status:** ⬜ offen · **Voraussetzung:** [Plan 16](16-ansehen-und-handel.md)

## Kontext

Nach Plan 16 haben Bots eine Haltung zum Spieler und zueinander — aber sie **tun** nichts
damit. Ein feindlicher Bot verhält sich genauso wie ein verbündeter: Er baut aus und
liefert an Freunde, mehr nicht. Das Ansehenssystem ist damit eine Anzeige ohne Wirkung.

Ebenso fehlt jede Form von Bündnis. Die Tabelle `players` hat kein Stammesfeld, und die
Oberfläche kennt nur einzelne Spieler.

Dieser Plan schließt den Kreis: Haltung führt zu Angriff oder Unterstützung, und aus
gegenseitiger Freundschaft werden Stämme — der Spieler gründet einen mit befreundeten Bots,
gegnerische Bots gründen eigene.

Damit ist Meilenstein 3 abgeschlossen: Die Karte lebt.

---

## Stämme

### Datenmodell, bewusst schlank

| Tabelle / Spalte | Zweck |
|---|---|
| `tribes` (`id`, `name`, `tag`, `founder_id`, `created_game_time`) | der Stamm |
| `players.tribe_id` | Mitgliedschaft — ein Spieler, ein Stamm |
| `tribe_invitations` (`tribe_id`, `player_id`, `created_game_time`, `expires_game_time`) | offene Einladungen |

Mitgliedschaft als Spalte statt als eigene Tabelle: Ein Spieler kann in genau einem Stamm
sein, und diese Regel gehört ins Datenmodell statt in die Anwendungslogik. Eine
Mitgliedschaftstabelle würde Mehrfachmitgliedschaft erlauben und dann überall geprüft
werden müssen.

Einladungen laufen ab. Ohne Ablaufzeit sammelt sich in einer schnellen Welt binnen Minuten
eine Liste toter Angebote an, und ein Bot, der vor drei Spielwochen freundlich war, tritt
plötzlich einem Stamm bei, den er inzwischen bekämpft.

### Beitritt

Ein Bot nimmt eine Einladung an, wenn seine Haltung zum Einladenden mindestens
**freundlich** ist (Plan 16) und er in keinem Stamm ist. Das ist die direkte Verbindung
zwischen den beiden Plänen: Handel ist der Weg, Bots in den eigenen Stamm zu holen.

Bots gründen auch **untereinander** Stämme — wenn zwei sich **gegenseitig** hoch bewerten,
beide ungebunden sind und in Reichweite liegen. Gegenseitig ist die entscheidende
Bedingung: Ansehen ist asymmetrisch (Plan 16), und einseitige Zuneigung soll kein Bündnis
begründen. Die Regel bleibt bewusst selten und regelbasiert; eine Welt, in der sich sofort
alle 30 Bots zusammenschließen, hat keine Fronten.

Mitgliedschaft wirkt auf das Ansehen zurück: gleicher Stamm `+`, fremder Stamm `−`
(klein und dauerhaft, die Auslösertabelle aus Plan 16). Damit verfestigen sich Fronten von
selbst, ohne dass es dafür eine eigene Mechanik braucht.

---

## Militärische Entscheidung

`server/src/ai/decide/military.ts` — pure Funktion, wie alles unter `ai/decide/`
(Plan 15, durchgesetzt von `check-ai-purity.mjs`).

### Angriff

Drei Bedingungen, alle drei müssen erfüllt sein:

1. **Haltung ist `feindlich`** (< −40). Ein neutraler Nachbar wird nie angegriffen. Das
   macht das Verhalten für den Spieler vorhersehbar: Wer nicht provoziert und handelt, wird
   in Ruhe gelassen.
2. **Übermacht ist wahrscheinlich.** Der Ausgang wird vorab mit `resolveBattle` aus
   `shared/src/logic/combat.ts` geschätzt — derselben Funktion, die den echten Kampf
   entscheidet. Kein zweites, vereinfachtes Kampfmodell für Bots; ein solches wäre nach der
   nächsten Balancing-Änderung falsch.
3. **Das Ziel lohnt sich** — Punkte und Beute gegen Entfernung und erwartete Verluste.

Die Persönlichkeit skaliert die geforderte Übermacht: `raider` greift knapper an,
`turtle` nur bei klarer Überlegenheit. `difficulty` skaliert quer dazu.

> Was der Bot **nicht** darf: in die Datenbank schauen, um die Verteidigung des Ziels
> abzulesen. Er kennt nur, was im `BotSnapshot` steht (Plan 15) — Punkte, Entfernung,
> Besitzer und was er aus eigenen Kämpfen weiß. Ein Bot mit Röntgenblick trifft perfekte
> Entscheidungen und ist als Gegner uninteressant; außerdem wäre der Schnitt aus Plan 15
> damit gebrochen.

### Unterstützung

Ein Bot schickt Verteidiger an ein Stammesmitglied mit eingehendem Angriff, **wenn die
Truppen rechtzeitig ankommen**. Die Prüfung ist eine Ungleichung mit `travelTime` gegen die
Ankunftszeit des Angriffs; beides steht im Snapshot. Unterstützung, die zu spät kommt, ist
verschenkte Verteidigung — und für den Spieler ein Ärgernis, weil sie wie Hilfe aussah.

Verbündete unterstützen auch den Spieler. Das ist der spürbare Ertrag eines Stammes.

---

## Oberfläche

Neue Route `/worlds/:id/diplomacy` (Plan 10 — eine neue Feature-Seite ist eine neue Datei):

- eigener Stamm mit Mitgliedern und deren Punkten;
- alle bekannten Spieler mit Haltung, sortierbar;
- offene Einladungen, gesendet und empfangen;
- Stamm gründen, einladen, austreten.

Dazu: Stammeskürzel neben Spielernamen auf der Karte und im Profil. Ohne dieses Kürzel ist
auf einen Blick nicht erkennbar, wer zu wem gehört — und genau das ist die Information, die
den Stamm im Spiel sichtbar macht.

---

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/db/schema.ts` · `ddl.ts` · `worldManager.migrateWorldDb` | `tribes`, `tribe_invitations`, `players.tribe_id` — **alle drei** |
| `shared/src/logic/relations.ts` | Stammes-Bonus/-Malus in `applyEvent` |
| `shared/src/schema/api.ts` | Stamm gründen, einladen, annehmen, austreten |
| `server/src/ai/decide/military.ts` | **neu** — pur: Angriff und Unterstützung |
| `server/src/ai/decide/diplomacy.ts` | **neu** — pur: Einladung annehmen, Stamm gründen |
| `server/src/engine/tribes.ts` | **neu** — Kommandos, für Spieler und Bots dieselben |
| `server/src/api/routes.ts` | Stammes-Endpunkte |
| `client/src/routes/worlds.$worldId.diplomacy.tsx` | **neu** |
| `client/src/stores/TribeStore.ts` | **neu** (Plan 09: Stores holen Daten, React zeigt sie an) |
| `client/src/features/map/*` · `player/*` · `i18n/de.ts` | Kürzel, Haltung, Übersetzungen |

---

## Verifikation

- **Militärische Entscheidung, pur, ohne Datenbank:**
  - greift `neutral` und `misstrauisch` **nie** an, auch bei erdrückender Übermacht;
  - greift `feindlich` nur mit Übermacht an — bei gleichwertiger Verteidigung nicht;
  - `raider` greift bei knapperem Verhältnis an als `turtle` (messbar, nicht behauptet);
  - unterstützt ein bedrängtes Stammesmitglied nur, wenn die Laufzeit vor der Ankunft des
    Angriffs liegt — der Test setzt einen Fall knapp darüber und einen knapp darunter.
- **Diplomatie, pur:** nimmt unter `freundlich` nicht an; nimmt nicht an, wenn bereits in
  einem Stamm; gründet nur bei **gegenseitig** hoher Bewertung.
- **Engine über eine simulierte Spielwoche:** Es entstehen mehrere Stämme; zwischen
  verfeindeten Stämmen fließen Angriffe; innerhalb eines Stammes fließt Unterstützung; kein
  Bot greift ein Mitglied des eigenen Stammes an.
- **Im Browser, der Abnahmetest für den ganzen Meilenstein:** Rohstoffe an einen nahen Bot
  liefern, bis er freundlich ist → Stamm gründen → einladen → er nimmt an → bei einem
  Angriff auf das eigene Dorf trifft seine Unterstützung ein. Diese Kette muss einmal von
  Hand durchgespielt worden sein; sie ist der eigentliche Beleg, dass 15, 16 und 17
  zusammenpassen.
- **Bestehender Spielstand** aus `data/` öffnet sich nach der Migration ohne Fehler.
- `pnpm lint` (inkl. `check:ai-purity`), `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
