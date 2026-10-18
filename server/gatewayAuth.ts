import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_CLOCK_SKEW_MS = 30_000;
const SCAN_PATH = '/api/v1/door/scan';

export function verifyGatewaySignature(
  rawBody: Buffer,
  deviceId: string,
  timestamp: string,
  nonce: string,
  signature: string,
  secret: Buffer,
  now = Date.now(),
): boolean {
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  if (!/^[a-fA-F0-9]{32,128}$/.test(nonce) || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;

  const canonical = ['POST', SCAN_PATH, deviceId, timestamp, nonce, rawBody.toString('utf8')].join('\n');
  const expected = createHmac('sha256', secret).update(canonical).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
