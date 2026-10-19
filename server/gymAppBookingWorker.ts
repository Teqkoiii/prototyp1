import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { GymAppRepository } from './gymAppRepository';

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
  }, input.now, 1);
  parentPort.postMessage({ type: 'result', created: result !== null });
} catch (error) {
  parentPort.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'unknown error' });
} finally {
  database.close();
}
