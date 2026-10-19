# DHBW Gym Hub: current implementation

## What the app currently does

- The web app and native app shell use the same five areas: Dashboard, Calendar, Training, Progress and Profile.
- Check-in and check-out are manually reported by the user. The backend shares the active count and refreshes it in the app every 15 seconds. It is not a DHBW scanner count and does not verify who is physically in the room.
- Reservations, past visits, workouts, exercises, weekly goals and active check-ins are stored in the Gym Hub SQLite database. Personal records are never stored in browser localStorage by the new UI.
- The shared reservations view contains time ranges and counts only. It does not reveal names or personal titles.
- Room capacity is intentionally unset by default. Reservations can be recorded, but free places remain “unknown” until an approved capacity is configured.
- The existing Android and iOS home-screen widgets still store a device-only status. Both are labelled as not shared; their actions do not change backend occupancy. The dashboard buttons are the shared check-in controls.
- No DHBW API, SSO, RFID/NFC reader, door controller or hardware connection is implemented.

## Local development

```sh
bun install
bun run dev
```

`dev` starts Vite on port 3000 and the manual Gym Hub API on port 4001. Vite proxies `/api/gym` to the separate Gym Hub API. The legacy gateway API remains a separate process and is not needed for the new interface.

The server uses `GYM_APP_DATABASE_PATH` (default `./data/gym-app.sqlite3`). Keep this file on persistent storage in a deployment and include it in an encrypted backup plan. The database is ignored by Git.

To configure available places, set `GYM_RESERVATION_CAPACITY` to the room capacity confirmed by the operator. Do not copy the previous comfort guide or invent a number. Without this setting, the app only reports how many app reservations overlap a selected time.

For a native build that calls a deployed API, set `VITE_GYM_API_BASE_URL` before building and set `GYM_APP_ALLOWED_ORIGINS` on the API to the exact app origins. Cross-origin cookies require HTTPS. Do not use `*` for allowed origins.

## Anonymous profile ownership and recovery

The server creates a random 256-bit browser/app session token and sends it in an `HttpOnly` cookie. SQLite stores only its SHA-256 hash. The cookie is `SameSite=Strict` for same-origin web use, and `Secure` in production. If explicitly configured mobile origins are enabled, the API uses credentialed CORS with an exact origin allowlist and secure cross-origin cookies.

The browser never supplies a profile ID. Private routes resolve the profile from the cookie and scope every read, update and delete by that server-derived profile ID. Record IDs in URLs are not sufficient to access another profile's reservation or workout.

An anonymous profile can be recovered with a one-time 256-bit code. Only the code hash is stored. A successful recovery consumes the code, revokes prior sessions and opens a new session for the same server profile; all records remain attached to that profile. The app does not save the recovery code automatically. The user must keep it in a password manager or another safe place. Recovery attempts are limited per source IP in the API process.

`gym_accounts` and the nullable `gym_principals.account_id` relationship prepare a future account association. The database has an atomic link operation that accepts a provider and subject only from a future verified login flow; there is no login endpoint or DHBW identity verification yet. Linking a single anonymous profile preserves its principal ID and all attached records. Merging multiple anonymous profiles is rejected for now and will need a transactional merge with reservation-conflict handling. A recovery code is a bearer credential, not proof of DHBW identity.

## Storage and retention

| Data | Owner/scope | Current retention |
| --- | --- | --- |
| Active manual check-in | Anonymous profile; aggregate count is shared | Automatically ends after 8 hours by default (`GYM_MAX_CHECK_IN_HOURS`, configurable 1–24) |
| Visit history | Anonymous profile | 90 days |
| Reservations | Owner can view/cancel; time/count is shared | Past reservations are removed 30 days after their end time |
| Training, exercises and goals | Anonymous profile | Until the user deletes them; no automatic expiry is configured |
| Session token | Browser/app session | 1 year, extended when the app is opened |
| Recovery code | Anonymous profile | Until used or replaced; only a hash is stored |

The “Meine App-Daten löschen” action removes the profile's current check-in, visit history, reservations, workouts, goals and recovery code. The anonymous profile and current cookie remain so the app can continue to use a fresh profile.

## HTTP interface

- `GET /api/gym/session` opens/renews the anonymous profile session.
- `GET /api/gym/occupancy`, `POST /api/gym/check-in`, `POST /api/gym/check-out` provide the manual shared count.
- `GET /api/gym/bookings`, `GET /api/gym/availability`, `GET /api/gym/my/bookings`, `POST /api/gym/bookings`, `DELETE /api/gym/my/bookings/:id` manage shared time-slot counts and private reservations.
- `GET /api/gym/visits` returns the profile's visit history.
- `GET/POST /api/gym/workouts`, `DELETE /api/gym/workouts/:id` manage personal training records.
- `GET/PUT /api/gym/goals` manage the weekly target.
- `POST /api/gym/profile/recovery-code`, `POST /api/gym/profile/recover` issue and use one-time recovery codes.
- `DELETE /api/gym/my/data` deletes the profile's personal app data.

The implementation is a functional prototype, not yet a public production service. Public release still needs a real account/identity system, an operator-confirmed room capacity and schedule, deployment with persistent database backups and monitoring, a reviewed privacy notice/retention policy, and testing on signed Android and iOS builds. Anonymous check-ins can be misreported; they should be presented as community-reported occupancy rather than an access-control or safety signal.
