import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import { GymAppRepository } from './gymAppRepository';

function createPrincipal(repository: GymAppRepository, id: string, now: string) {
  const principalId = repository.createAnonymousPrincipal(`hash-${id}`, now, new Date(Date.parse(now) + 86_400_000).toISOString());
  return principalId;
}

test('database check-in and check-out are idempotent and keep one visit record', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new GymAppRepository(database);
  const principalId = createPrincipal(repository, 'one', '2026-10-19T09:00:00.000Z');
  const checkedInAt = '2026-10-19T09:00:00.000Z';
  const expiresAt = '2026-10-19T17:00:00.000Z';

  assert.deepEqual({ ...repository.checkIn(principalId, checkedInAt, expiresAt) }, { checkedInAt, expiresAt });
  assert.deepEqual({ ...repository.checkIn(principalId, '2026-10-19T09:01:00.000Z', expiresAt) }, { checkedInAt, expiresAt });
  assert.equal(repository.occupancy('2026-10-19T09:02:00.000Z'), 1);
  assert.equal(repository.listVisits(principalId, '2026-10-19T00:00:00.000Z', '2026-10-20T00:00:00.000Z').length, 1);

  repository.checkOut(principalId, '2026-10-19T10:00:00.000Z');
  repository.checkOut(principalId, '2026-10-19T10:01:00.000Z');
  assert.equal(repository.occupancy('2026-10-19T10:01:00.000Z'), 0);
  const visits = repository.listVisits(principalId, '2026-10-19T00:00:00.000Z', '2026-10-20T00:00:00.000Z');
  assert.equal(visits.length, 1);
  assert.equal(visits[0]?.checkedOutAt, '2026-10-19T10:00:00.000Z');
  database.close();
});

test('database check-in expiry closes a visit and removes it from occupancy', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new GymAppRepository(database);
  const checkIn = '2026-10-19T09:00:00.000Z';
  const expiry = '2026-10-19T17:00:00.000Z';
  const principalId = createPrincipal(repository, 'expiry', checkIn);
  repository.checkIn(principalId, checkIn, expiry);

  repository.cleanupExpiredData('2026-10-19T17:00:01.000Z', '2026-07-21T00:00:00.000Z', '2026-09-19T00:00:00.000Z');
  assert.equal(repository.occupancy('2026-10-19T17:00:01.000Z'), 0);
  const visits = repository.listVisits(principalId, '2026-10-19T00:00:00.000Z', '2026-10-20T00:00:00.000Z');
  assert.equal(visits[0]?.checkedOutAt, expiry);
  database.close();
});

test('bookings are never rejected for overlapping intervals; only an identical planned slot of the same profile is a duplicate', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new GymAppRepository(database);
  const now = '2026-10-19T09:00:00.000Z';
  const firstPrincipal = createPrincipal(repository, 'reservation-a', now);
  const secondPrincipal = createPrincipal(repository, 'reservation-b', now);
  const first = {
    id: 'booking-a', startsAt: '2026-10-20T09:00:00.000Z', endsAt: '2026-10-20T10:00:00.000Z', title: 'Training',
  };
  const overlapping = {
    id: 'booking-b', startsAt: '2026-10-20T09:30:00.000Z', endsAt: '2026-10-20T10:30:00.000Z', title: '',
  };
  const adjacent = {
    id: 'booking-c', startsAt: '2026-10-20T10:00:00.000Z', endsAt: '2026-10-20T11:00:00.000Z', title: '',
  };
  assert.deepEqual(repository.createBooking(firstPrincipal, first, now), {
    availability: { reserved: 1, capacity: null, availablePlaces: null },
  });
  assert.deepEqual(repository.createBooking(secondPrincipal, overlapping, now), {
    availability: { reserved: 2, capacity: null, availablePlaces: null },
  });
  assert.deepEqual(repository.createBooking(secondPrincipal, adjacent, now), {
    availability: { reserved: 2, capacity: null, availablePlaces: null },
  });
  assert.deepEqual(repository.createBooking(secondPrincipal, { ...first, id: 'booking-d' }, now), {
    availability: { reserved: 3, capacity: null, availablePlaces: null },
  });
  assert.deepEqual(repository.createBooking(firstPrincipal, { ...first, id: 'booking-e' }, now), { duplicate: true });
  assert.equal(repository.listMyBookings(firstPrincipal).length, 1);
  assert.equal(repository.listMyBookings(secondPrincipal).length, 3);
  database.close();
});

test('shared reservation slots count every overlapping reservation without exposing a place limit', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new GymAppRepository(database);
  const now = '2026-10-19T09:00:00.000Z';
  const firstPrincipal = createPrincipal(repository, 'overlap-a', now);
  const secondPrincipal = createPrincipal(repository, 'overlap-b', now);
  repository.createBooking(firstPrincipal, {
    id: 'overlap-one', startsAt: '2026-10-20T09:00:00.000Z', endsAt: '2026-10-20T10:00:00.000Z', title: '',
  }, now);
  repository.createBooking(secondPrincipal, {
    id: 'overlap-two', startsAt: '2026-10-20T09:30:00.000Z', endsAt: '2026-10-20T10:00:00.000Z', title: '',
  }, now);
  const slots = repository.listBookingSlots('2026-10-20T00:00:00.000Z', '2026-10-21T00:00:00.000Z');
  assert.equal(slots.length, 2);
  assert.deepEqual(slots.map((slot) => [slot.reserved, slot.capacity, slot.availablePlaces]), [[2, null, null], [2, null, null]]);
  database.close();
});

test('simultaneous database workers can both book the same interval because bookings are never capacity-limited', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gym-app-db-test-'));
  const path = join(directory, 'gym.sqlite3');
  const setupDatabase = new DatabaseSync(path);
  const setupRepository = new GymAppRepository(setupDatabase);
  const now = new Date().toISOString();
  const firstPrincipal = createPrincipal(setupRepository, 'parallel-a', now);
  const secondPrincipal = createPrincipal(setupRepository, 'parallel-b', now);
  setupDatabase.close();
  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 87_000_000).toISOString();
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const inputs = [
    { databasePath: path, principalId: firstPrincipal, bookingId: 'parallel-one' },
    { databasePath: path, principalId: secondPrincipal, bookingId: 'parallel-two' },
  ].map((item) => ({ ...item, startsAt, endsAt, now, barrier }));
  const workers = inputs.map((workerData) => new Worker(new URL('./gymAppBookingWorker.ts', import.meta.url), {
    workerData,
  }));
  const waitForMessage = (worker: Worker, type: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const handleMessage = (message: Record<string, unknown>) => {
      if (message.type === 'error') {
        worker.off('message', handleMessage);
        reject(new Error(String(message.message)));
        return;
      }
      if (message.type !== type) return;
      worker.off('message', handleMessage);
      resolve(message);
    };
    worker.on('message', handleMessage);
    worker.once('error', reject);
  });

  try {
    const ready = workers.map((worker) => waitForMessage(worker, 'ready'));
    const results = workers.map((worker) => waitForMessage(worker, 'result'));
    await Promise.all(ready);
    Atomics.store(new Int32Array(barrier), 0, 1);
    Atomics.notify(new Int32Array(barrier), 0, workers.length);
    const replies = await Promise.all(results);
    assert.equal(replies.filter((reply) => reply.created === true).length, 2);
    assert.equal(replies.filter((reply) => reply.created === false).length, 0);

    const verifyDatabase = new DatabaseSync(path);
    const verifyRepository = new GymAppRepository(verifyDatabase);
    assert.equal(verifyRepository.availability(startsAt, endsAt).reserved, 2);
    verifyDatabase.close();
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('linking a profile to a verified account preserves server-owned data and rejects a duplicate link', () => {
  const database = new DatabaseSync(':memory:');
  const repository = new GymAppRepository(database);
  const now = new Date().toISOString();
  const owner = createPrincipal(repository, 'account-owner', now);
  const other = createPrincipal(repository, 'account-other', now);
  repository.createWorkout(owner, {
    id: 'kept-workout',
    title: 'Training',
    occurredAt: now,
    notes: '',
    exercises: [{ name: 'Bankdrücken', sets: [{ reps: 8, weightKg: 50 }] }],
  }, now);

  const accountId = repository.linkAnonymousProfileToVerifiedAccount(owner, 'oidc-example', 'issuer-subject-123', now);
  assert.equal(repository.listWorkouts(owner)[0]?.id, 'kept-workout');
  assert.equal((database.prepare('SELECT account_id FROM gym_principals WHERE id = ?').get(owner) as { account_id: string }).account_id, accountId);
  assert.throws(() => repository.linkAnonymousProfileToVerifiedAccount(other, 'oidc-example', 'issuer-subject-123', now), /already linked/i);
  assert.equal(repository.listWorkouts(owner)[0]?.id, 'kept-workout');
  assert.equal((database.prepare('SELECT account_id FROM gym_principals WHERE id = ?').get(other) as { account_id: string | null }).account_id, null);
  database.close();
});
