import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyGatewaySignature } from './gatewayAuth';

const secret = Buffer.from('a'.repeat(64), 'hex');
const deviceId = 'GW_MGT_01';
const nonce = 'b'.repeat(32);
const body = Buffer.from(JSON.stringify({ campusId: 'dhbw-mgt', doorId: 'DOOR-MGT-01', rfidUid: '3A:8F:12:0C' }));

function sign(timestamp: string, requestBody = body, requestNonce = nonce): string {
  const canonical = ['POST', '/api/v1/door/scan', deviceId, timestamp, requestNonce, requestBody.toString('utf8')].join('\n');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

test('accepts an HMAC for the exact canonical scan request', () => {
  const now = 1_800_000_000_000;
  const timestamp = String(now);
  assert.equal(verifyGatewaySignature(body, deviceId, timestamp, nonce, sign(timestamp, body, nonce), secret, now), true);
});

test('rejects a changed body and a stale timestamp', () => {
  const now = 1_800_000_000_000;
  const timestamp = String(now);
  const changedBody = Buffer.from(JSON.stringify({ campusId: 'dhbw-mosbach', doorId: 'DOOR-MGT-01', rfidUid: '3A:8F:12:0C' }));
  assert.equal(verifyGatewaySignature(changedBody, deviceId, timestamp, nonce, sign(timestamp), secret, now), false);
  assert.equal(verifyGatewaySignature(body, deviceId, String(now - 30_001), nonce, sign(String(now - 30_001)), secret, now), false);
});

test('rejects malformed nonce and signature values', () => {
  const now = 1_800_000_000_000;
  const timestamp = String(now);
  assert.equal(verifyGatewaySignature(body, deviceId, timestamp, 'not-hex'.repeat(5), sign(timestamp), secret, now), false);
  assert.equal(verifyGatewaySignature(body, deviceId, timestamp, nonce, 'invalid', secret, now), false);
});
