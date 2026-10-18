import 'dotenv/config';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express, { type Request, type Response } from 'express';
import { decideDoorAccess, isStudentAuthorizedAtCampus } from './accessPolicy';
import { verifyGatewaySignature } from './gatewayAuth';

const CAMPUS_IDS = new Set(['dhbw-mgt', 'dhbw-mosbach', 'dhbw-heilbronn', 'dhbw-stuttgart']);
const BODY_LIMIT = '4kb';
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
recordOccupancySnapshots();
const occupancySnapshotTimer = setInterval(recordOccupancySnapshots, 60_000);
occupancySnapshotTimer.unref();

const app = express();
app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
const configuredCapacity = Number(process.env.GYM_CAPACITY ?? '30');
if (!Number.isInteger(configuredCapacity) || configuredCapacity < 1 || configuredCapacity > 1000) {
  throw new Error('GYM_CAPACITY must be an integer between 1 and 1000');
}

const occupancyStreams = new Map<string, Set<Response>>();

function getOccupancy(campusId: string) {
  const row = database.prepare(
    'SELECT COUNT(*) AS count FROM active_sessions WHERE campus_id = ?'
  ).get(campusId) as { count: number };
  const latest = database.prepare(
    "SELECT timestamp FROM access_logs WHERE campus_id = ? AND event_type IN ('check_in', 'check_out') ORDER BY timestamp DESC LIMIT 1"
  ).get(campusId) as { timestamp: string } | undefined;
  const current = row.count;
  return {
    campusId,
    current,
    capacity: configuredCapacity,
    percentage: Math.min(100, Math.round((current / configuredCapacity) * 100)),
    status: current / configuredCapacity >= 0.95 ? 'full' : current / configuredCapacity >= 0.75 ? 'busy' : 'available',
    source: 'access_control_sessions' as const,
    updatedAt: new Date().toISOString(),
    lastAccessEventAt: latest?.timestamp ?? null,
    hardwareStatus: 'not_verified' as const,
  };
}

function sendOccupancyEvent(response: Response, campusId: string): void {
  response.write(`event: occupancy\\ndata: ${JSON.stringify(getOccupancy(campusId))}\\n\\n`);
}

function broadcastOccupancy(campusId: string): void {
  const streams = occupancyStreams.get(campusId);
  if (!streams) return;
  for (const stream of streams) {
    if (stream.destroyed || stream.writableEnded) {
      streams.delete(stream);
      continue;
    }
    sendOccupancyEvent(stream, campusId);
  }
}

function recordOccupancySnapshots(): void {
  const now = new Date().toISOString();
  const campuses = database.prepare('SELECT id FROM campuses').all() as Array<{ id: string }>;
  const countForCampus = database.prepare(
    'SELECT COUNT(*) AS count FROM active_sessions WHERE campus_id = ?'
  );
  const insertSnapshot = database.prepare(
    'INSERT INTO occupancy_snapshots(campus_id, recorded_at, person_count, source) VALUES (?, ?, ?, ?)'
  );
  for (const campus of campuses) {
    const result = countForCampus.get(campus.id) as { count: number };
    insertSnapshot.run(campus.id, now, result.count, 'access_control_sessions');
  }
  database.prepare(
    "DELETE FROM occupancy_snapshots WHERE recorded_at < ?"
  ).run(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
}



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

app.get('/api/v1/health', (_request, response) => {
  database.prepare('SELECT 1').get();
  response.json({ status: 'ok' });
});
app.get('/api/v1/occupancy', (request, response) => {
  const campusId = typeof request.query.campusId === 'string' ? request.query.campusId : 'dhbw-mgt';
  if (!CAMPUS_IDS.has(campusId)) {
    response.status(400).json({ error: 'invalid campusId' });
    return;
  }
  response.json(getOccupancy(campusId));
});

app.get('/api/v1/occupancy/history', (request, response) => {
  const campusId = typeof request.query.campusId === 'string' ? request.query.campusId : 'dhbw-mgt';
  if (!CAMPUS_IDS.has(campusId)) {
    response.status(400).json({ error: 'invalid campusId' });
    return;
  }
  const requestedLimit = Number(request.query.limit ?? 96);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(500, requestedLimit)) : 96;
  const rows = database.prepare(
    'SELECT recorded_at AS recordedAt, person_count AS count, source FROM occupancy_snapshots WHERE campus_id = ? ORDER BY recorded_at DESC LIMIT ?'
  ).all(campusId, limit) as Array<{ recordedAt: string; count: number; source: string }>;
  response.json({ campusId, points: rows.reverse() });
});

app.get('/api/v1/occupancy/stream', (request, response) => {
  const campusId = typeof request.query.campusId === 'string' ? request.query.campusId : 'dhbw-mgt';
  if (!CAMPUS_IDS.has(campusId)) {
    response.status(400).json({ error: 'invalid campusId' });
    return;
  }

  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  let streams = occupancyStreams.get(campusId);
  if (!streams) {
    streams = new Set<Response>();
    occupancyStreams.set(campusId, streams);
  }
  streams.add(response);
  sendOccupancyEvent(response, campusId);
  response.write(': connected\\n\\n');

  const keepAlive = setInterval(() => {
    if (!response.writableEnded) response.write(': keepalive\\n\\n');
  }, 25_000);
  request.on('close', () => {
    clearInterval(keepAlive);
    streams?.delete(response);
    if (streams?.size === 0) occupancyStreams.delete(campusId);
  });
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
  if (!secret || !verifyGatewaySignature(rawBody, deviceId, timestamp, nonce, signature, secret)) {
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
        if (!isStudentAuthorizedAtCampus(student.campus_id, session?.campus_id, device.campus_id)) {
          storeLog({
            campusId: device.campus_id,
            eventType: 'access_denied',
            uid,
            reason: session ? 'session_campus_mismatch' : 'campus_mismatch',
            doorId,
            now,
          });
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
    if (result.action === 'check_in' || result.action === 'check_out') {
      broadcastOccupancy(campusId);
    }
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
