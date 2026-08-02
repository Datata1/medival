# Ticket 18-6: Nachrichten — Postfach mit Bot-Absendern

**Status:** 📋 offen · **Voraussetzung:** [18-1](18-1-rahmen-und-kopfzeile.md),
[18-5](18-5-rangliste-profil-einstellungen.md)

## Kontext

Das einzige Ticket dieses Plans ohne jede Grundlage: Es gibt keine Tabelle, keine
Route, kein Schema, keinen Store. Die einzigen Treffer für „Nachricht" im Code
sind Kommentare zum WebSocket.

Die naheliegende Frage ist, wozu ein Einzelspieler ein Postfach braucht. Die
Antwort: Die Bots aus den Plänen 15–17 haben Persönlichkeit, Ansehen, Stämme und
Kriege — aber keine Stimme. Man merkt, dass ein Bot einen mag, indem man eine Zahl
in der Diplomatieansicht liest. Ein Postfach macht aus dieser Zahl ein Verhalten:
Wer angegriffen wird, beschwert sich; wer einen mag, bietet ein Bündnis an; wer
einen fürchtet, droht.

**Entschieden:** vollwertiges Postfach mit Bot-Absendern, nicht nur ein
Ereignis-Briefkasten. Man kann antworten und selbst schreiben.

## Datenmodell

Neue Tabelle `messages` in `packages/server/src/db/schema.ts` und `ddl.ts`:

| Spalte | Bedeutung |
|---|---|
| `id` | Primärschlüssel |
| `thread_id` | Gesprächsfaden; die erste Nachricht eröffnet ihn |
| `sender_player_id` | `null` = System |
| `recipient_player_id` | Empfänger |
| `template_id` | Kennung der Vorlage bei Bot- und Systemnachrichten, sonst `null` |
| `params_json` | Platzhalterwerte der Vorlage |
| `body_text` | nur bei selbst verfassten Nachrichten |
| `subject` | Betreff (bei Vorlagen aus der Vorlage abgeleitet) |
| `created_game_time` | Spielzeit |
| `read` | Lesezustand |

**Warum Vorlage statt Fließtext:** Eine Bot-Nachricht speichert `template_id` und
`params_json`, keinen fertigen Satz. Den deutschen Wortlaut liefert
`packages/client/src/i18n/de.ts`. Damit steht kein Fließtext in der Datenbank,
alles bleibt übersetzbar, und eine bessere Formulierung wirkt rückwirkend auf alte
Nachrichten. Selbst verfasste Nachrichten gehen den anderen Weg über `body_text`.

Migration über das bestehende Muster in
`packages/server/src/engine/worldManager.ts:24-77`: ein `CREATE TABLE IF NOT
EXISTS` im `migrateWorldDb`, wie es Plan 16 für `relations` und Plan 17 für
`tribes` getan haben. Bestandswelten bekommen ein leeres Postfach, was der
richtige Ausgangszustand ist.

## Endpunkte

```
GET    /api/worlds/:id/messages                 Posteingang, mit Paging
GET    /api/worlds/:id/messages/:threadId       ganzer Gesprächsfaden
POST   /api/worlds/:id/messages                 neue Nachricht oder Antwort
POST   /api/worlds/:id/messages/:messageId/read
DELETE /api/worlds/:id/messages/:messageId
```

Schemata in `packages/shared/src/schema/api.ts`. `params_json` wird beim Lesen mit
zod geparst, nicht gecastet — `scripts/check-no-casts.mjs` lässt nichts anderes zu.
Die Vorlagenkennung ist ein zod-Enum, damit eine unbekannte Vorlage am Rand
auffällt und nicht als leerer Text im Postfach landet.

Neue Variante `message{ playerId }` im `WorldMessageSchema`
(`packages/shared/src/schema/api.ts:266-287`) plus ein Zweig im Verteiler
`RootStore.handleSocketMessage` (`packages/client/src/stores/RootStore.ts:143-175`).

## Bot-Nachrichten

Die Entscheidung, **ob** und **welche** Nachricht ein Bot schreibt, gehört nach
`packages/server/src/ai/decide/messages.ts` — neben `diplomacy.ts`, `military.ts`
und `trade.ts`. Dieses Verzeichnis muss frei von Seiteneffekten bleiben;
`scripts/check-ai-purity.mjs` prüft das. Die Funktion nimmt Wahrnehmung entgegen
und liefert `{ templateId, params } | null`. Das Schreiben in die Datenbank macht
`packages/server/src/ai/execute.ts`, wie bei allen anderen Absichten auch.

Anlässe, aus dem vorhandenen Ansehenssystem (Plan 16) und der Stammeslogik
(Plan 17) abgeleitet:

| Anlass | Ton |
|---|---|
| Erstkontakt, wenn ein Bot in Reichweite wächst | Vorstellung |
| Nach einem erlittenen Angriff | Beschwerde, bei feindlicher Haltung Drohung |
| Ansehen überschreitet die Schwelle zu „freundlich" | Bündnisangebot |
| Ansehen fällt unter „misstrauisch" | Verwarnung, danach Fehdeansage |
| Nach einer Lieferung | Dank |
| Stammeseinladung | ergänzt die bestehende Einladung um einen Text |

**Sparsam bleiben.** Ein Bot, der bei jedem Tick schreibt, ist schlimmer als
Schweigen. Je Bot und Anlass eine Sperrfrist, und die Anzahl offener
Gesprächsfäden begrenzt. Systemnachrichten (`sender_player_id = null`) für
Ereignisse ohne Absender: eigenes Dorf erobert, Stamm aufgelöst.

Antworten des Spielers werden nicht verstanden — Bots bewerten nur, **dass**
geantwortet wurde, und geben einen kleinen Ansehensbonus. Das ist ehrlicher als
eine vorgetäuschte Sprachverarbeitung und passt zu einem System, das seine
Entscheidungen aus Zahlen ableitet.

## Client

- `stores/MessagesStore.ts` — nach dem Muster von `ReportsStore`: Polling
  (zehn Sekunden), zusätzlich getrieben von der neuen WebSocket-Variante,
  `unreadCount` für den Zähler in der Kopfzeile.
- `features/messages/InboxView.tsx` — Liste mit Absender, Betreff, Zeit,
  Lesezustand; Filter Alle · Ungelesen · System. Aufbau wie die Berichtsliste aus
  18-4, damit beide Postfächer sich gleich bedienen lassen.
- `features/messages/ThreadView.tsx` — Route
  `/worlds/$worldId/messages/$threadId`, Nachrichten von alt nach neu, unten das
  Antwortfeld.
- `features/messages/ComposeForm.tsx` — Empfänger aus der bekannten Spielerliste
  (dieselbe Quelle wie die Diplomatieansicht), Betreff, Text.
- Neuer Klang `message.arrived`, ausgelöst aus einer Store-Reaktion in
  `RootStore` über einen `ArrivalWatcher` — genau wie `report.arrived`. Der
  Wächter unterdrückt beim Betreten der Welt die Salve für bereits vorhandene
  Nachrichten.

Vorlagentexte in `i18n/de.ts` unter `messages.templates.*`, mit
`{{name}}`-Platzhaltern aus `params_json`.

**Nicht vergessen:** Die fünf neuen API-Methoden in den handgepflegten Mock in
`packages/client/test/stores.test.ts` eintragen, sonst scheitern die Store-Tests
mit einem irreführenden Fehler.

## Verifikation

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` grün.
  `pnpm check:ai-purity` akzeptiert `decide/messages.ts`.
- Server-Tests:
  - Die Entscheidungsfunktion ist rein: gleiche Wahrnehmung, gleiches Ergebnis,
    keine Datenbankzugriffe.
  - Die Sperrfrist greift — derselbe Anlass zweimal hintereinander erzeugt eine
    Nachricht, nicht zwei.
  - Endpunkte: fremde Nachrichten sind nicht abrufbar, Löschen ist idempotent,
    `read` betrifft nur eine Nachricht.
  - Eine Bestandswelt (ohne `messages`-Tabelle) lässt sich öffnen und legt die
    Tabelle beim Start an.
- Simulierte Spielwoche, wie in den Plänen 15–17 etabliert: Nach sieben Spieltagen
  hat mindestens ein Bot geschrieben, kein Bot hat mehr als eine Handvoll
  Nachrichten geschickt, und die Anlässe passen zu dem, was tatsächlich passiert
  ist (nach einem Angriff eine Beschwerde, nach einer Lieferung ein Dank).
- Im Browser:
  1. Der Zähler in der Kopfzeile stimmt mit der Zahl ungelesener Nachrichten
     überein und sinkt beim Öffnen um eins.
  2. Eine eintreffende Nachricht meldet sich genau einmal akustisch; das Betreten
     einer Welt mit vorhandenen Nachrichten bleibt still.
  3. Antworten erscheint im richtigen Gesprächsfaden und in der richtigen
     Reihenfolge.
  4. Eine selbst verfasste Nachricht an einen Bot erhöht dessen Ansehen sichtbar
     in der Diplomatieansicht.
  5. Der Wortlaut einer Bot-Nachricht liest sich wie ein Satz, nicht wie ein
     Datenbankeintrag — Namen, Dörfer und Zahlen stehen an der richtigen Stelle.
