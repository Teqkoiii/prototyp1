import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test, { type TestContext } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createGymAppApi } from './gym-app-api';

async function startApi(t: TestContext, reservationCapacity: number | null = null, options: { secureCookies?: boolean; allowedOrigins?: string[] } = {}) {
  const database = new DatabaseSync(':memory:');
  const server = createServer(createGymAppApi(database, { reservationCapacity, secureCookies: options.secureCookies ?? false, allowedOrigins: options.allowedOrigins }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  });
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

async function createAnonymousClient(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/gym/session`);
  assert.equal(response.status, 200);
  const session = await response.json() as Record<string, unknown>;
  assert.equal(session.identity, 'anonymous-app-profile');
  assert.equal('principalId' in session, false, 'server profile IDs must not be exposed to the browser');
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie, 'server should establish an HttpOnly app session');
  return {
    cookie,
    async request(path: string, init: RequestInit = {}) {
      return fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { cookie, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
      });
    },
  };
}

test('manual check-in is shared, idempotent, and scoped to the server session', async (t) => {
  const { baseUrl } = await startApi(t);
  assert.equal((await fetch(`${baseUrl}/api/gym/check-in`, { method: 'POST' })).status, 401);
  const first = await createAnonymousClient(baseUrl);
  const second = await createAnonymousClient(baseUrl);

  assert.equal((await first.request('/api/gym/occupancy').then((response) => response.json()) as { count: number }).count, 0);
  const firstCheckIn = await first.request('/api/gym/check-in', { method: 'POST' });
  assert.equal(firstCheckIn.status, 200);
  const timestamp = (await firstCheckIn.json() as { checkedInAt: string }).checkedInAt;
  await first.request('/api/gym/check-in', { method: 'POST' });
  assert.equal((await first.request('/api/gym/visits').then((response) => response.json()) as { visits: unknown[] }).visits.length, 1);
  assert.equal((await second.request('/api/gym/session').then((response) => response.json()) as { checkedInAt: string | null }).checkedInAt, null);
  assert.equal((await second.request('/api/gym/occupancy').then((response) => response.json()) as { count: number }).count, 1);

  const checkOut = await first.request('/api/gym/check-out', { method: 'POST' });
  assert.equal(checkOut.status, 200);
  assert.equal((await first.request('/api/gym/occupancy').then((response) => response.json()) as { count: number }).count, 0);
  const visits = (await first.request('/api/gym/visits').then((response) => response.json()) as { visits: Array<{ checkedInAt: string; checkedOutAt: string | null }> }).visits;
  assert.equal(visits[0]?.checkedInAt, timestamp);
  assert.ok(visits[0]?.checkedOutAt);
});

test('reservations are shared as aggregate slots and private records cannot be accessed across profiles', async (t) => {
  const { baseUrl } = await startApi(t, 1);
  const owner = await createAnonymousClient(baseUrl);
  const other = await createAnonymousClient(baseUrl);
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const created = await owner.request('/api/gym/bookings', {
    method: 'POST',
    body: JSON.stringify({ startsAt, durationMinutes: 60, title: 'Krafttraining' }),
  });
  assert.equal(created.status, 201);
  const booking = (await created.json() as { booking: { id: string } }).booking;
  const shared = await other.request('/api/gym/bookings').then((response) => response.json()) as {
    slots: Array<{ reserved: number; availablePlaces: number | null }>;
  };
  assert.equal(shared.slots[0]?.reserved, 1);
  assert.equal(shared.slots[0]?.availablePlaces, 0);
  assert.equal((await other.request('/api/gym/my/bookings').then((response) => response.json()) as { bookings: unknown[] }).bookings.length, 0);
  assert.equal((await other.request(`/api/gym/my/bookings/${booking.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await other.request('/api/gym/bookings', {
    method: 'POST',
    body: JSON.stringify({ startsAt, durationMinutes: 60 }),
  })).status, 409);
});

test('workouts and goals persist per anonymous profile and can be deleted by their owner', async (t) => {
  const { baseUrl } = await startApi(t);
  const owner = await createAnonymousClient(baseUrl);
  const other = await createAnonymousClient(baseUrl);
  const workout = {
    title: 'Ganzkörper',
    occurredAt: new Date().toISOString(),
    exercises: [{ name: 'Kniebeuge', sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 45 }] }],
  };

  const created = await owner.request('/api/gym/workouts', { method: 'POST', body: JSON.stringify(workout) });
  assert.equal(created.status, 201);
  const id = (await created.json() as { id: string }).id;
  assert.equal((await owner.request('/api/gym/workouts').then((response) => response.json()) as { workouts: unknown[] }).workouts.length, 1);
  assert.equal((await other.request('/api/gym/workouts').then((response) => response.json()) as { workouts: unknown[] }).workouts.length, 0);
  assert.equal((await other.request(`/api/gym/workouts/${id}`, { method: 'DELETE' })).status, 404);

  assert.equal((await owner.request('/api/gym/goals', { method: 'PUT', body: JSON.stringify({ weeklySessions: 4 }) })).status, 200);
  assert.equal((await owner.request('/api/gym/goals').then((response) => response.json()) as { weeklySessions: number }).weeklySessions, 4);
  assert.equal((await other.request('/api/gym/goals').then((response) => response.json()) as { weeklySessions: number }).weeklySessions, 3);
  assert.equal((await owner.request('/api/gym/my/data', { method: 'DELETE' })).status, 204);
  assert.equal((await owner.request('/api/gym/workouts').then((response) => response.json()) as { workouts: unknown[] }).workouts.length, 0);
});

test('recovery code restores the same server profile once and rotates the active session', async (t) => {
  const { baseUrl } = await startApi(t);
  const original = await createAnonymousClient(baseUrl);
  await original.request('/api/gym/check-in', { method: 'POST' });
  const createdWorkout = await original.request('/api/gym/workouts', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Zugtag',
      occurredAt: new Date().toISOString(),
      exercises: [{ name: 'Rudern', sets: [{ reps: 10, weightKg: 30 }] }],
    }),
  });
  assert.equal(createdWorkout.status, 201);

  const recoveryResponse = await original.request('/api/gym/profile/recovery-code', { method: 'POST' });
  assert.equal(recoveryResponse.status, 200);
  const recoveryCode = (await recoveryResponse.json() as { recoveryCode: string }).recoveryCode;
  assert.match(recoveryCode, /^[A-Za-z0-9_-]{43}$/);

  const recoveredResponse = await fetch(`${baseUrl}/api/gym/profile/recover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recoveryCode }),
  });
  assert.equal(recoveredResponse.status, 200);
  const recoveredCookie = recoveredResponse.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(recoveredCookie);
  const recovered = {
    request: (path: string, init: RequestInit = {}) => fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { cookie: recoveredCookie, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    }),
  };

  assert.equal((await recovered.request('/api/gym/session').then((response) => response.json()) as { checkedInAt: string | null }).checkedInAt !== null, true);
  assert.equal((await recovered.request('/api/gym/workouts').then((response) => response.json()) as { workouts: unknown[] }).workouts.length, 1);
  assert.equal((await original.request('/api/gym/workouts')).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/gym/profile/recover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recoveryCode }),
  })).status, 401);
});

test('availability stays explicitly unknown when the gym capacity has not been configured', async (t) => {
  const { baseUrl } = await startApi(t);
  const client = await createAnonymousClient(baseUrl);
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const query = new URLSearchParams({ startAt: startsAt, durationMinutes: '60' });
  const availability = await client.request(`/api/gym/availability?${query}`).then((response) => response.json()) as {
    capacity: number | null;
    availablePlaces: number | null;
  };
  assert.equal(availability.capacity, null);
  assert.equal(availability.availablePlaces, null);
});

test('cross-origin mobile API access requires an exact allowlist and secure cookies', async (t) => {
  const allowedOrigin = 'capacitor://localhost';
  const { baseUrl } = await startApi(t, null, { secureCookies: true, allowedOrigins: [allowedOrigin] });
  const session = await fetch(`${baseUrl}/api/gym/session`, { headers: { Origin: allowedOrigin } });
  assert.equal(session.status, 200);
  assert.equal(session.headers.get('access-control-allow-origin'), allowedOrigin);
  assert.equal(session.headers.get('access-control-allow-credentials'), 'true');
  assert.match(session.headers.get('set-cookie') ?? '', /HttpOnly; SameSite=None; Path=\/; Max-Age=\d+; Secure/);

  const preflight = await fetch(`${baseUrl}/api/gym/check-in`, {
    method: 'OPTIONS',
    headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(preflight.status, 204);

  const rejected = await fetch(`${baseUrl}/api/gym/check-in`, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example' },
  });
  assert.equal(rejected.status, 403);
});

test('profile recovery attempts are rate limited', async (t) => {
  const { baseUrl } = await startApi(t);
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/gym/profile/recover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recoveryCode: 'A'.repeat(43) }),
    });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
});
