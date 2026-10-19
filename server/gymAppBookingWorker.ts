import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { register } from 'tsx/esm/api';

// Worker threads do not reliably inherit the TypeScript loader, so register it here before loading TypeScript sources.
register();
const { GymAppRepository } = await import('./gymAppRepository');

interface BookingWorkerData {
  databasePath: string;
  principalId: string;
  bookingId: string;
  startsAt: string;
  endsAt: string;
  now: string;
  barrier: SharedArrayBuffer;
}

if (!parentPort) throw new Error('booking worker requires a parent thread');
const input = workerData as BookingWorkerData;
const database = new DatabaseSync(input.databasePath);
const repository = new GymAppRepository(database);
const barrier = new Int32Array(input.barrier);

parentPort.postMessage({ type: 'ready' });
Atomics.wait(barrier, 0, 0);

try {
  const result = repository.createBooking(input.principalId, {
    id: input.bookingId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    title: '',
  }, input.now);
  parentPort.postMessage({ type: 'result', created: !('duplicate' in result) });
} catch (error) {
  parentPort.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'unknown error' });
} finally {
  database.close();
}
