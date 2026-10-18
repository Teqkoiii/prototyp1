import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_PRESENCE_STATE, parsePresence } from './presenceState';

test('uses a safe empty state for absent, malformed, or structurally invalid data', () => {
  assert.deepEqual(parsePresence(undefined), EMPTY_PRESENCE_STATE);
  assert.deepEqual(parsePresence('{broken'), EMPTY_PRESENCE_STATE);
  assert.deepEqual(parsePresence('[]'), EMPTY_PRESENCE_STATE);
  assert.deepEqual(parsePresence('{"isPresent":"yes","updatedAt":null}'), EMPTY_PRESENCE_STATE);
  assert.deepEqual(parsePresence('{"isPresent":true,"updatedAt":"not a date"}'), EMPTY_PRESENCE_STATE);
});

test('accepts a saved presence state and normalizes its scope to the local demo', () => {
  assert.deepEqual(parsePresence(JSON.stringify({
    isPresent: true,
    updatedAt: '2026-10-19T08:30:00.000Z',
    scope: 'campus-live',
  })), {
    isPresent: true,
    updatedAt: '2026-10-19T08:30:00.000Z',
    scope: 'this-device-demo',
  });
});

test('accepts the initial not-checked-in state with no timestamp', () => {
  assert.deepEqual(parsePresence('{"isPresent":false,"updatedAt":null}'), EMPTY_PRESENCE_STATE);
});
