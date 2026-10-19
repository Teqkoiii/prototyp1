import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from './password';

test('password hashes are not reversible and verify only the original password', async () => {
  const hash = await hashPassword('correct-horse-battery');
  assert.equal(hash.startsWith('scrypt$'), true);
  assert.equal(hash.includes('correct-horse-battery'), false);
  assert.equal(await verifyPassword('correct-horse-battery', hash), true);
  assert.equal(await verifyPassword('wrong-password-value', hash), false);
  assert.equal(await verifyPasswordOrDummy('anything-long-enough', undefined), false);
});
