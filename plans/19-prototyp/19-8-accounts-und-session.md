# Ticket 19-8: Accounts & Session

**Status:** ✅ erledigt (2026-10-22) · **Voraussetzung:** [19-1](19-1-integrationstest-harness.md) · **Grundlage für:** [19-9](19-9-welt-beitreten-und-rechte.md)

> **Ergebnis:** Accounts und Sessions liegen in der Meta-DB (`server/src/auth/`).
> Passwörter werden asynchron mit `scrypt` gehasht und in konstanter Zeit verglichen. Bei
> unbekanntem Namen wird gleich lange gerechnet, damit die Antwortzeit keine Namen
> verrät. Das Session-Cookie ist signiert und `httpOnly`, mit `SameSite=Lax` und 30 Tagen
> Gültigkeit, die bei Benutzung höchstens einmal am Tag verlängert wird. Routen:
> `POST /api/auth/register|login|logout`, `GET /api/me`. Admin ist der erste Account oder
> wer in `MEDIVAL_ADMINS` steht. Weltverwaltung und Dev-Werkzeuge sind nur für Admins
> erlaubt. Der WebSocket ohne Session wird mit 4401 geschlossen. Gedrosselt wird nach zehn
> Fehlversuchen je Name und Adresse in 15 min (429). Im Client gibt es `AuthStore`, die
> Routen `/login` und `/register`, eine Umleitung ohne Session in der Root-Route,
> Anmelde-Hinweis und Abmelden in Lobby und Einstellungen. Anlegen und Löschen sind nur
> für Admins sichtbar.
>
> **Tests:** `test/integration/auth.test.ts` (13): An- und Abmelden über das Cookie,
> falsches Passwort und unbekannter Name gleich (401), Name doppelt auch in anderer
> Schreibweise (409), ungültige Eingaben (400), kein Klartextpasswort in der DB, Rollen
> (401/403/200 beim Anlegen und Löschen), `MEDIVAL_ADMINS`, Sessions laufen ab und
> gleiten weiter, Sessions überstehen einen Neustart, verfälschtes Cookie, Drosselung,
> WebSocket mit und ohne Session. Im Client: `AuthStore` (4). Harness: `loginAs(api,
> name)`.
>
> **Am echten Server und im Browser:** `/` leitet ohne Session zu `/login` um. Nach dem
> Registrieren ist man Admin, kann eine Welt anlegen (200), ohne Login nicht (401). Das
> Cookie ist `HttpOnly`.
>
> **Abweichungen von der Planung:**
>
> - **`GET /api/me` liefert `{ account | null, devMode }`** statt 401 ohne Session. Der
>   Client unterscheidet so „niemand angemeldet" von einem Fehler.
> - **Der Brute-Force-Schutz** zählt im Speicher, ein Neustart setzt ihn zurück. Für den
>   Prototyp genügt das.
> - **Spielrouten sind serverseitig noch offen**, nur die Weltverwaltung ist geschützt.
>   Die Bindung an Spieler und die Rechte je Dorf kommen mit 19-9, so wie geplant.

## Kontext

Es gibt keinen Begriff von „wer". Der Spieler ist die Konstante `PLAYER_ID = 1`
(`shared/src/index.ts:37`). Benutzt wird sie in `routes.ts`, `mapgen.ts`, `MainNav.tsx`,
`MapCanvas.tsx` und `TargetPanel.tsx`. Jede Route ist ohne Anmeldung erreichbar,
darunter `DELETE /api/worlds/:id` (`routes.ts:115`).

Für den Prototyp reicht ein **minimaler** Account. Er soll beweisen, dass die Engine mit
mehreren Menschen umgehen kann. Ein Benutzerkonto-System mit E-Mail und Wiederherstellung
gehört in den PoC.

## Kernentscheidung: Server-Sessions in SQLite, keine Tokens

Ein Account ist `(name, passwortHash, rolle)` in der bestehenden Meta-DB
`worlds.sqlite`. Eine Session ist eine Zeile `(id, accountId, expiresAt)`. Im Browser
liegt nur ein signiertes, `httpOnly`-Cookie mit der Session-ID.

Warum nicht JWT: Eine Session muss sich widerrufen lassen (Logout, Sperre). Ein JWT kann
das nur mit einer Sperrliste, und die ist wieder eine Tabelle. Server und Daten liegen
ohnehin auf einer Maschine.

**Passwörter** werden mit `crypto.scrypt` aus `node:crypto` gehasht (Salt je Account,
Vergleich mit `timingSafeEqual`). Dafür braucht es keine native Abhängigkeit wie bcrypt.

**Rollen:** `player` und `admin`. Admin ist der erste angelegte Account oder jeder Name in
`MEDIVAL_ADMINS` (kommagetrennt). Admins verwalten Welten (19-9) und nutzen die
Dev-Werkzeuge (19-3).

**WebSocket** authentifiziert sich über dasselbe Cookie beim Upgrade. Eine Verbindung
ohne gültige Session wird mit Code 4401 geschlossen.

## Umsetzung

### Server

- Abhängigkeit `@fastify/cookie`. Das Cookie-Secret kommt aus `MEDIVAL_SECRET`. Fehlt es,
  wird es einmalig erzeugt und in `data/secret` abgelegt.
- Meta-DDL: `accounts (id, name UNIQUE COLLATE NOCASE, password_hash, role, created_at)`
  und `sessions (id TEXT PRIMARY KEY, account_id, expires_at)`. Sessions gelten 30 Tage
  und verlängern sich gleitend bei Benutzung.
- `server/src/auth/` (neu): `passwords.ts` (hash/verify), `sessions.ts`
  (create/resolve/revoke) und `plugin.ts`. Das Plugin dekoriert `req.account`
  (`Account | null`) und stellt die preHandler `requireAccount` und `requireAdmin` bereit.
- Routen: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/me` (`{ id, name, role, devMode }`).
- Eingaben mit zod parsen: Name 3–24 Zeichen `[A-Za-z0-9_ -]`, Passwort ≥ 8 Zeichen.
- **Brute-Force-Schutz minimal:** höchstens 10 Fehlversuche je Name und IP in 15 min, im
  Speicher gezählt. Für den Prototyp reicht das.
- Fehlercodes nach dem Muster aus Plan 07: `name_taken`, `invalid_credentials`,
  `not_authenticated`, `forbidden`, `too_many_attempts`.
- Bis 19-9 bleiben die Spielrouten offen. Das Ticket schützt nur die Weltverwaltung
  (anlegen, löschen) mit `requireAdmin`.

### Client

- `AuthStore` (MobX) mit `me: AsyncValue<Me | null>`, `login`, `register`, `logout`. Der
  `RootStore` lädt `me` beim Start.
- Routen `/login` und `/register` (file-based). Ein `beforeLoad` auf der Root-Route leitet
  ohne Session zu `/login` um. Nach Plan 10 stößt `beforeLoad` nur Store-Actions an und
  lädt selbst keine Daten.
- `credentials: 'include'` im API-Client. Der Vite-Proxy reicht Cookies bereits durch.
- Kopfzeile: Accountname und Abmelden-Knopf.
- Texte in `i18n/de.ts`, Fehlercodes übersetzt.

### Harness

`loginAs(app, name, role?)` legt einen Account an und gibt den Cookie-Header zurück.
Alle späteren API-Szenarien nutzen ihn.

## Dateien

| Datei | Änderung |
|---|---|
| `server/src/auth/{passwords,sessions,plugin}.ts` | **neu** |
| `server/src/db/ddl.ts` | `accounts`, `sessions` in `META_DDL` |
| `server/src/app.ts` · `api/routes.ts` | Plugin registrieren, Auth-Routen, Weltverwaltung nur Admin |
| `server/package.json` | `@fastify/cookie` |
| `shared/src/schema/api.ts` | `RegisterRequest`, `LoginRequest`, `Me` |
| `client/src/stores/AuthStore.ts` · `RootStore.ts` | **neu** bzw. erweitert |
| `client/src/routes/login.tsx` · `register.tsx` · `__root.tsx` | Anmeldung, Umleitung |
| `client/src/api/client.ts` | Auth-Methoden, `credentials: 'include'` |
| `client/src/i18n/de.ts` | Texte |
| `server/test/harness/app.ts` | `loginAs` |

## Verifikation

- **Szenarien (inject):** registrieren → `GET /api/me` mit Cookie liefert den Namen;
  ohne Cookie 401. Nach Logout ist dasselbe Cookie ungültig. Doppelter Name (auch
  Groß-/Kleinschreibung) → `name_taken`.
- **Passwort:** In der DB steht nie das Klartextpasswort. `verify` mit falschem Passwort
  liefert `false`, und die Laufzeit unterscheidet sich nicht messbar (keine Abkürzung).
- **Rollen:** Der erste Account ist Admin. `DELETE /api/worlds/:id` als `player` → 403,
  als Admin → 200.
- **Drosselung:** Der 11. Fehlversuch in 15 min → `too_many_attempts`.
- **WebSocket:** Verbindung ohne Cookie → Schließcode 4401.
- **Store-Test:** `AuthStore.login` setzt `me`, `logout` leert es, der API-Mock ist ergänzt.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` grün.
