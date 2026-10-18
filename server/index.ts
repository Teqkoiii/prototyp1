import 'dotenv/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express, { type Request, type Response } from 'express';
import { decideDoorAccess } from './accessPolicy';

const CAMPUS_IDS = new Set(['dhbw-mgt', 'dhbw-mosbach', 'dhbw-heilbronn', 'dhbw-stuttgart']);
const BODY_LIMIT = '4kb';
const MAX_CLOCK_SKEW_MS = 30_000;
const NONCE_RETENTION_MS = 24 * 60 * 60 * 1000;

function readHexSecret(name: string): Buffer {
  const value = process.env[name] ?? '';
  if (!/^[a-fA-F0-9]{64,}$/.test(value) || value.length % 2 !== 0) {
    throw new Error(`${name} must be configured as at least 32 random bytes in hex`);
  }
  return Buffer.from(value, 'hex');
}

function readGatewaySecrets(): Map<string, Buffer> {
  const raw = process.env.DOOR_GATEWAY_SECRETS_JSON;
  if (!raw) throw new Error('DOOR_GATEWAY_SECRETS_JSON must be configured before starting the API');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('DOOR_GATEWAY_SECRETS_JSON must be a JSON object');
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) throw new Error('At least one gateway secret must be provisioned');
  const secrets = new Map<string, Buffer>();
  for (const [deviceId, secret] of entries) {
    if (!/^[A-Z0-9_-]{3,64}$/.test(deviceId) || typeof secret !== 'string' ||
        !/^[a-fA-F0-9]{64,}$/.test(secret) || secret.length % 2 !== 0) {
      throw new Error('Each gateway entry needs a valid device ID and a 32-byte-or-longer hex secret');
    }
    secrets.set(deviceId, Buffer.from(secret, 'hex'));
  }
  return secrets;
}

const gatewaySecrets = readGatewaySecrets();
const rfidHashKey = readHexSecret('RFID_HASH_SECRET');
const retentionHours = Number(process.env.ACCESS_LOG_RETENTION_HOURS ?? '4');
if (![4, 24, 48].includes(retentionHours)) {
  throw new Error('ACCESS_LOG_RETENTION_HOURS must be 4, 24, or 48');
}

const databasePath = resolve(process.env.DATABASE_PATH ?? './data/gym.sqlite3');
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const purgeExpiredAccessLogs = () => {
  database.prepare('DELETE FROM access_logs WHERE retention_expires_at <= ?').run(new Date().toISOString());
};
purgeExpiredAccessLogs();
const retentionCleanupTimer = setInterval(purgeExpiredAccessLogs, 60_000);
retentionCleanupTimer.unref();

const app = express();
app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

interface DeviceRow {
  device_id: string;
  campus_id: string;
  door_id: string;
  enabled: number;
}
interface StudentRow {
  id: string;
  campus_id: string;
  role: 'student' | 'employee';
  card_active: number;
  safety_briefing_completed: number;
}
interface SessionRow {
  student_id: string;
  campus_id: string;
}

function maskUid(uid: string): string {
  const parts = uid.split(':');
  return parts.length > 2 ? `${parts[0]}:**:**:${parts[parts.length - 1]}` : '***';
}

function storeLog(input: {
  campusId: string;
  eventType: 'check_in' | 'check_out' | 'access_denied';
  uid: string;
  reason?: string;
  doorId: string;
  now: number;
}): void {
  const timestamp = new Date(input.now).toISOString();
  const expiresAt = new Date(input.now + retentionHours * 60 * 60 * 1000).toISOString();
  database.prepare(`
    INSERT INTO access_logs(id, campus_id, timestamp, event_type, masked_uid, reason, door_id, retention_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), input.campusId, timestamp, input.eventType, maskUid(input.uid), input.reason ?? null, input.doorId, expiresAt);
}

function signedRequestIsValid(
  rawBody: Buffer,
  deviceId: string,
  timestamp: string,
  nonce: string,
  signature: string,
  secret: Buffer,
): boolean {
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  if (!/^[a-fA-F0-9]{32,128}$/.test(nonce) || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const canonical = ['POST', '/api/v1/door/scan', deviceId, timestamp, nonce, rawBody.toString('utf8')].join('\n');
  const expected = createHmac('sha256', secret).update(canonical).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

app.get('/api/v1/health', (_request, response) => {
  database.prepare('SELECT 1').get();
  response.json({ status: 'ok' });
});

app.post('/api/v1/door/scan', express.raw({ type: 'application/json', limit: BODY_LIMIT }), (request: Request, response: Response) => {
  if (!Buffer.isBuffer(request.body)) {
    response.status(415).json({ allowed: false, error: 'application/json body required' });
    return;
  }
  const rawBody = request.body as Buffer;
  const deviceId = request.get('X-Gateway-Device') ?? '';
  const timestamp = request.get('X-Gateway-Timestamp') ?? '';
  const nonce = request.get('X-Gateway-Nonce') ?? '';
  const signature = request.get('X-Gateway-Signature') ?? '';
  const secret = gatewaySecrets.get(deviceId);
  if (!secret || !signedRequestIsValid(rawBody, deviceId, timestamp, nonce, signature, secret)) {
    response.status(401).json({ allowed: false, error: 'gateway authentication failed' });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    response.status(400).json({ allowed: false, error: 'invalid JSON body' });
    return;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    response.status(400).json({ allowed: false, error: 'invalid scan payload' });
    return;
  }
  const payload = body as Record<string, unknown>;
  const campusId = payload.campusId;
  const doorId = payload.doorId;
  const rfidUid = payload.rfidUid;
  if (typeof campusId !== 'string' || !CAMPUS_IDS.has(campusId) ||
      typeof doorId !== 'string' || typeof rfidUid !== 'string' ||
      !/^[a-fA-F0-9]{2}(?::[a-fA-F0-9]{2}){2,9}$/.test(rfidUid)) {
    response.status(400).json({ allowed: false, error: 'invalid scan payload' });
    return;
  }

  const now = Date.now();
  const uid = rfidUid.toUpperCase();
  const rfidUidHash = createHmac('sha256', rfidHashKey).update(uid).digest('hex');
  let statusCode = 403;
  let result: Record<string, unknown>;

  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare('INSERT INTO gateway_nonces(device_id, nonce, created_at) VALUES (?, ?, ?)').run(deviceId, nonce, now);
    database.prepare('DELETE FROM gateway_nonces WHERE created_at < ?').run(now - NONCE_RETENTION_MS);
    database.prepare('DELETE FROM access_logs WHERE retention_expires_at <= ?').run(new Date(now).toISOString());

    const device = database.prepare('SELECT device_id, campus_id, door_id, enabled FROM gateway_devices WHERE device_id = ?').get(deviceId) as DeviceRow | undefined;
    if (!device || device.enabled !== 1 || device.door_id !== doorId || device.campus_id !== campusId) {
      result = { allowed: false, action: 'denied', message: 'Gateway or campus is not provisioned.' };
    } else {
      const student = database.prepare(`
        SELECT id, campus_id, role, card_active, safety_briefing_completed
        FROM students WHERE rfid_uid_hash = ?
      `).get(rfidUidHash) as StudentRow | undefined;

      if (!student) {
        storeLog({ campusId: device.campus_id, eventType: 'access_denied', uid, reason: 'unknown_card', doorId, now });
        result = { allowed: false, action: 'denied', message: 'Access denied.' };
      } else {
        const session = database.prepare('SELECT student_id, campus_id FROM active_sessions WHERE student_id = ?').get(student.id) as SessionRow | undefined;
        const checkedInAtThisCampus = session?.campus_id === device.campus_id;
        if (session && !checkedInAtThisCampus) {
          storeLog({ campusId: device.campus_id, eventType: 'access_denied', uid, reason: 'session_campus_mismatch', doorId, now });
          result = { allowed: false, action: 'denied', message: 'Access denied.' };
        } else if (!checkedInAtThisCampus && student.campus_id !== device.campus_id) {
          storeLog({ campusId: device.campus_id, eventType: 'access_denied', uid, reason: 'campus_mismatch', doorId, now });
          result = { allowed: false, action: 'denied', message: 'Access denied.' };
        } else {
          const isWednesday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Berlin' })
            .format(new Date(now)) === 'Wed';
          const decision = decideDoorAccess({
            checkedIn: Boolean(checkedInAtThisCampus),
            cardActive: student.card_active === 1,
            briefingComplete: student.safety_briefing_completed === 1,
            isWednesday,
            isEmployee: student.role === 'employee',
          });

          if (decision.action === 'check_out') {
            database.prepare('DELETE FROM active_sessions WHERE student_id = ?').run(student.id);
            storeLog({ campusId: device.campus_id, eventType: 'check_out', uid, doorId, now });
            statusCode = 200;
            result = { allowed: true, action: 'check_out', message: 'Check-out recorded.' };
          } else if (decision.action === 'check_in') {
            database.prepare('INSERT INTO active_sessions(student_id, campus_id, checked_in_at) VALUES (?, ?, ?)').run(student.id, device.campus_id, new Date(now).toISOString());
            storeLog({ campusId: device.campus_id, eventType: 'check_in', uid, doorId, now });
            statusCode = 200;
            result = { allowed: true, action: 'check_in', message: 'Check-in recorded.' };
          } else {
            storeLog({ campusId: device.campus_id, eventType: 'access_denied', uid, reason: decision.reason, doorId, now });
            result = { allowed: false, action: 'denied', message: 'Access denied.' };
          }
        }
      }
    }

    const occupancy = database.prepare('SELECT COUNT(*) AS count FROM active_sessions WHERE campus_id = ?').get(campusId) as { count: number };
    database.exec('COMMIT');
    response.status(statusCode).json({ ...result, occupancy: occupancy.count });
  } catch (error) {
    database.exec('ROLLBACK');
    if (error instanceof Error && /UNIQUE constraint failed: gateway_nonces/.test(error.message)) {
      response.status(409).json({ allowed: false, error: 'replayed request' });
      return;
    }
    console.error('Door scan transaction failed');
    response.status(500).json({ allowed: false, error: 'internal server error' });
  }
});

const port = Number(process.env.API_PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid TCP port');

app.listen(port, () => {
  console.info(`Access API listening on port ${port}`);
});
