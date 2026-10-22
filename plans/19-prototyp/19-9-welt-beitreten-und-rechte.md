# Ticket 19-9: Welt beitreten & Mehrspieler-Rechte

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** [19-6](19-6-weltkarte-kreisfoermige-besiedlung.md), [19-8](19-8-accounts-und-session.md)

> **Ergebnis:** Menschen kommen nur noch über ihren Account in eine Welt. Mit
> `POST /api/worlds/:id/join` entstehen ein Spieler (`players.account_id`, eindeutig)
> und ein Dorf am Rand des Siedlungskreises. `PLAYER_ID` ist aus dem ganzen Code
> entfernt. Jede Weltroute verlangt eine Anmeldung, Spielrouten verlangen einen
> beigetretenen Spieler (`not_joined`, 403). Dorfansicht und alle Dorfkommandos (bauen,
> rekrutieren, schicken, liefern) prüfen den Besitz (`village_not_owned`, 403).
> Berichte, Bewegungen, Diplomatie und Stammesaktionen gelten für den Spieler der Anfrage.
> Nachrichten haben Empfänger: `World.broadcast` bestimmt sie zentral. Dorfnachrichten
> gehen an den Besitzer, Bewegungen an beide Seiten, Berichte an den Empfänger, Stammes-
> nachrichten an die Mitglieder, Weltstatus und `map_changed` an alle. Der Client nutzt
> überall `world.playerId`. In der Lobby steht „Beitreten" für fremde Welten, und wer über
> einen Link kommt, sieht eine Beitreten-Karte.
>
> **Tests:** `test/integration/multiplayer.test.ts`, drei Accounts in einer Welt:
> Beitreten (einmal je Welt, 409), Zuschauer ohne Spieler (403), A kann B's Dorf weder
> ansehen noch bauen, rekrutieren, schicken oder liefern (je 403, B unverändert),
> Berichte nur bei A und B, B sieht den Angriff ohne Truppenliste, C sieht nichts. Live:
> Baut A, erfährt es nur A. Greift A B an, erfährt es B, C nicht. Im Client gibt es Tests
> für `LobbyStore.join` und `WorldStore.playerId`.
>
> **Im Browser** (Chrome über das DevTools-Protokoll mit echtem Session-Cookie): Die
> Spielerin sieht in der Lobby „Beitreten" und kein Anlegeformular. Nach dem Klick steht
> sie in ihrem Dorf (481|515, K54) am Rand des Kreises, mit zwei Barbaren daneben.
>
> **Abweichungen von der Planung:**
>
> - **Gründer statt festem Spieler 1:** `createWorld(…, { founder })` legt auf Wunsch vor
>   den Bots einen Menschen mit dem Dorf in der Mitte an, wahlweise mit Account. Die
>   bestehenden Tests setzen genau diese Lage voraus und bekommen sie jetzt
>   ausdrücklich. Der Harness legt ihn standardmäßig an. Ohne Gründer erzeugt die
>   Generierung nur Bots und Barbaren.
> - **Besitzprüfung in den Routen** (`ownVillage`) statt in `world.command`. Bots
>   handeln innerhalb von Events und planen nur eigene Dörfer. Eine Prüfung in
>   `execute.ts` ist nicht gebaut.
> - **Mitgliedschaften zusätzlich in der Meta-DB** (`memberships`), damit die Lobby nicht
>   jede Welt laden muss. Maßgeblich bleibt `players.account_id` in der Welt.
> - **Alte Spielstände:** Spieler 1 („Spieler") aus Welten vor 19-9 hat keinen Account
>   und bleibt als passiver Spieler stehen. Wer beitritt, bekommt ein neues Dorf.
> - **Karten-Invalidierung:** Neben dem gedrosselten Nachladen auf eigene
>   `village_updated`/`movement` gibt es jetzt `map_changed` für alle bei Eroberung und
>   neuem Dorf. Eine kachelgenaue Variante ist weiterhin nicht gebaut.

## Kontext

Mit 19-8 weiß der Server, **wer** eine Anfrage stellt. Er weiß aber nicht, **welcher
Spieler** dieser Account in einer Welt ist, und prüft nirgends, ob er etwas darf:

- Alle Routen setzen `PLAYER_ID` als Spieler ein: Profil, eigene Dörfer, Berichte,
  Diplomatie und Stammesaktionen (`routes.ts:147-269`, `437`, `509`, `534`, `568`).
- Dorfkommandos (`POST /api/worlds/:id/villages/:vid/…`, `routes.ts:352-410`) prüfen
  nicht, ob das Dorf dem Anfragenden gehört. Wer eine Dorf-ID kennt, kann es steuern.
- `World.broadcast` (`world.ts:184`) sendet jede Nachricht an jeden verbundenen Client.
  Darunter sind `village_updated` für fremde Dörfer und `movement` mit Ursprung und Ziel.
  Das verrät jedem Spieler jeden Truppenmarsch der Welt.
- `mapgen.ts` legt den Menschen als Spieler 1 an. Spieler kommen nur bei der Erzeugung
  in die Welt.

## Kernentscheidung: Der Spieler kommt aus der Session, das Recht aus dem Besitz

Jede Spielroute löst zuerst `(account, world) → player` auf. Ein Account hat **höchstens
einen Spieler je Welt**. Danach gilt eine einzige Regel für alle Dorfkommandos:

> **Ein Kommando auf ein Dorf ist erlaubt, wenn `village.player_id = player.id`.**

Diese Prüfung steht **einmal** im Engine-Wrapper `world.command` (aus 19-2), nicht in
jeder Route. Kommandos bekommen dafür einen `actor: PlayerId`. Bots rufen dieselben
Kommandos mit ihrer eigenen ID auf (`execute.ts`). Damit gilt die Regel aus Plan 15
(„Bots haben keine Sonderrechte") jetzt auch technisch.

**Nachrichten haben Empfänger.** `broadcast(msg)` wird zu `notify(playerIds, msg)`. Jede
Nachricht weiß, wen sie betrifft:

| Nachricht | Empfänger |
|---|---|
| `village_updated`, `build_complete` | Besitzer |
| `movement` (abgeschickt) | Absender; Zielbesitzer nur bei `attack`/`support` und nur `{ targetVillageId, arrival }` ohne Truppen |
| `report` | Empfänger des Berichts |
| `map_tile_changed` (19-7) | alle (öffentlich) |
| `world_status` | alle |
| Stammesnachrichten | Stammesmitglieder |

Die WebSocket-Verbindung wird beim Aufbau einem Spieler zugeordnet (Session aus 19-8 +
`worldId`). Der `World` hält `Map<playerId, Set<Socket>>`.

## Umsetzung

### Datenmodell

- `players.account_id INTEGER UNIQUE` (NULL für Bots), Migration additiv.
- `PLAYER_ID` entfällt aus `shared`. Der Compiler findet jede Fundstelle, und keine darf
  übrig bleiben.

### Beitreten

- `POST /api/worlds/:id/join` (`requireAccount`) legt den Spieler mit dem Accountnamen
  an und ruft `settleNewPlayer` aus 19-6 auf. Das Dorf entsteht am Rand des
  Siedlungsradius. Ist der Account schon Spieler der Welt, liefert die Route 409
  `already_joined`.
- `GET /api/worlds` gibt pro Welt `joined: boolean` und `playerId | null` aus.
- Lobby (`features/lobby/`): „Beitreten" statt „Öffnen" für fremde Welten, „Welt anlegen"
  nur für Admins.
- `generateMap` legt keinen Menschen mehr an, nur noch Bots und Barbaren.

### Rechte

- Fastify-preHandler `resolvePlayer` setzt `req.player` (404 `not_joined`, wenn kein
  Spieler).
- `world.command(actor, fn)`: Kommandos mit Dorfbezug rufen `assertOwns(actor, villageId)`
  auf (`GameError('village_not_owned')`, HTTP 403).
- Lesende Routen filtern nach `req.player`: Berichte, eigene Dörfer, Bewegungen
  (eigene + eingehende ohne Truppendetails), Dorfansicht fremder Dörfer nur als
  öffentliche Info (Name, Besitzer, Punkte, Koordinaten).
- Profil-Route `players/:playerId` bleibt öffentlich, ohne interne Felder.
- Dev-Routen (19-3) und Weltverwaltung: `requireAdmin`.

### Nachrichten

- `World.subscribe(playerId, fn)`, `World.notify(ids, msg)`, `World.notifyAll(msg)`.
  Die Bündelung je Batch aus 19-2 bleibt erhalten, jetzt je Empfänger.
- Alle `broadcast`-Aufrufe in `world.ts`, `military.ts`, `trade.ts` und `tribes.ts`
  umstellen. Für jeden Aufruf steht der Empfänger in der Tabelle oben.

### Client

- `PLAYER_ID` in `MainNav.tsx`, `MapCanvas.tsx` und `TargetPanel.tsx` ersetzen durch
  `worldStore.playerId` (aus `GET /api/worlds/:id`).
- Fehlercodes `village_not_owned`, `not_joined`, `already_joined` übersetzen.

## Dateien

| Datei | Änderung |
|---|---|
| `shared/src/index.ts` | `PLAYER_ID` entfernen |
| `server/src/db/ddl.ts` · `worldManager.ts` | `players.account_id`, Migration |
| `server/src/engine/settle.ts` · `mapgen.ts` | Beitreten, kein Mensch beim Erzeugen |
| `server/src/engine/world.ts` | `command(actor, …)`, `assertOwns`, `subscribe/notify` |
| `server/src/engine/military.ts` · `trade.ts` · `tribes.ts` | `actor`, Empfänger je Nachricht |
| `server/src/ai/execute.ts` | Bots als `actor` |
| `server/src/api/routes.ts` | `resolvePlayer`, `join`, gefilterte Lesezugriffe, WS je Spieler |
| `shared/src/schema/api.ts` | `joined`, `playerId`, öffentliche Dorfansicht |
| `client/src/stores/{WorldStore,LobbyStore}.ts` | `playerId`, `join` |
| `client/src/features/{lobby,world,map}/…` | `PLAYER_ID` ersetzen, Beitreten-Knopf |

## Verifikation

Alles über `createTestApp` + `loginAs` (19-1, 19-8):

- **Beitreten:** A und B treten bei → zwei Spieler, zwei Dörfer am Rand. Zweites `join`
  von A → 409.
- **Fremdsteuerung:** A ruft `POST /villages/{B's Dorf}/build` → 403 `village_not_owned`,
  und B's Dorf ist unverändert.
- **Berichte:** A greift B an → A und B haben je einen Bericht. C sieht über
  `GET /reports` keinen davon.
- **WebSocket:** A, B und C verbunden, A baut → nur A erhält `village_updated`. A schickt
  einen Angriff auf B → B erhält `movement` ohne Truppenliste, C erhält nichts.
- **Bots:** Bot-Kommandos laufen über `actor`. Ein absichtlich falscher Intent (fremdes
  Dorf) wird als `village_not_owned` abgewiesen und protokolliert.
- **Kein `PLAYER_ID`:** `grep -r PLAYER_ID packages/*/src` findet nichts.
- **Browser:** zwei Browserprofile, zwei Accounts, beide in derselben Welt. Jeder sieht nur
  seine eigenen Dörfer und Berichte. Ein Angriff von A taucht bei B als eingehend auf.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
