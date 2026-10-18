# Server-side access API foundation

This is the first backend slice for the prototype: a Node.js 22 API with a local SQLite database and server-side door-scan decisions. The frontend still uses its demo state and is not connected to this API.

## What it does

- Requires each door request to be signed with a device-specific HMAC key.
- Rejects stale timestamps and replayed nonces.
- Checks the provisioned device, campus, student card status, safety briefing, and Wednesday rule on the server.
- Stores only a keyed HMAC of RFID UIDs for lookup, masked UIDs in logs, and short-lived access logs.
- Uses a SQLite transaction for each scan so concurrent door requests cannot both create an active session.

The API does not expose student-administration routes or user login. Do not expose it directly to the public internet; terminate TLS at a trusted reverse proxy and restrict network access to provisioned gateways. No door relay is controlled by this API yet.

## Runtime configuration

Requires Node.js 22.13 or newer. Install the locked dependencies, copy `.env.example` to `.env`, and configure:

- `API_PORT`: API listener port (default 4000).
- `DATABASE_PATH`: local SQLite file path.
- `ACCESS_LOG_RETENTION_HOURS`: server policy, limited to 4, 24, or 48.
- `RFID_HASH_SECRET`: at least 32 random bytes in hex. This key must remain stable for existing student hashes.
- `DOOR_GATEWAY_SECRETS_JSON`: JSON map from provisioned device IDs to separate, at least 32-byte hex secrets.

Generate keys with a trusted secret manager or a local cryptographic random generator. Never put real values in Git, browser code, logs, or support messages. The API fails to start if required keys are missing or malformed.

Start the API with `bun run api`. It creates the database schema and campus records on first start. `GET /api/v1/health` reports process/database availability only; it does not indicate that a gateway is connected.

## Gateway signature

For each request, the gateway sends:

- `X-Gateway-Device`: provisioned device ID.
- `X-Gateway-Timestamp`: Unix timestamp in milliseconds.
- `X-Gateway-Nonce`: a fresh random hexadecimal value.
- `X-Gateway-Signature`: lowercase or uppercase hex HMAC-SHA256.

The signature covers this exact UTF-8 canonical message, including the exact request body bytes:

```text
POST
/api/v1/door/scan
<device-id>
<timestamp>
<nonce>
<raw-json-body>
```

The JSON body contains `campusId`, `doorId`, and `rfidUid`. The device row must be provisioned in `gateway_devices` and its campus and door must match the signed payload. Provision student RFID hashes with HMAC-SHA256 over the normalized uppercase UID using `RFID_HASH_SECRET`; raw UIDs are not stored.

## Current limits

This foundation uses a local SQLite file and is intended for one API instance. It does not yet include an authenticated admin/provisioning API, OIDC/SSO, dashboard reads, production migrations, backup/restore, cross-instance coordination, or actual hardware relay control. The browser UI is not connected to it. Those pieces need a deployment target, identity provider, operational policy, and review before production use.
