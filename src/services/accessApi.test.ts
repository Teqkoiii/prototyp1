import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAccessApi } from './accessApi';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('reports reachable only for a successful health response', async () => {
  const fetcher = (async () => jsonResponse({ status: 'ok' })) as typeof fetch;
  assert.equal(await checkAccessApi(fetcher), true);
});

test('fails closed for HTTP errors or unexpected payloads', async () => {
  const httpError = (async () => jsonResponse({ status: 'ok' }, 503)) as typeof fetch;
  const unexpectedPayload = (async () => jsonResponse({ status: 'gateway-connected' })) as typeof fetch;

  assert.equal(await checkAccessApi(httpError), false);
  assert.equal(await checkAccessApi(unexpectedPayload), false);
});

test('fails closed when the API cannot be reached', async () => {
  const fetcher = (async () => { throw new Error('offline'); }) as typeof fetch;
  assert.equal(await checkAccessApi(fetcher), false);
});
