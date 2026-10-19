import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createGymAppApi } from './gym-app-api';

const port = Number(process.env.GYM_APP_API_PORT ?? 4001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GYM_APP_API_PORT must be a valid TCP port');

const maxCheckInHours = Number(process.env.GYM_MAX_CHECK_IN_HOURS ?? 8);
const allowedOrigins = (process.env.GYM_APP_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
const databasePath = resolve(process.env.GYM_APP_DATABASE_PATH ?? './data/gym-app.sqlite3');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
const app = createGymAppApi(database, {
  secureCookies: process.env.NODE_ENV === 'production',
  allowedOrigins,
  maxCheckInHours,
});

app.listen(port, '127.0.0.1', () => {
  console.info(`Manual gym app API listening on 127.0.0.1:${port}`);
});
