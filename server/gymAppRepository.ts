import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface BookingRecord {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
}

export interface WorkoutRecord {
  id: string;
  title: string;
  occurredAt: string;
  exercises: Array<{ name: string; sets: Array<{ reps: number; weightKg: number }> }>;
}

export interface BookingAvailability {
  reserved: number;
  capacity: number | null;
  availablePlaces: number | null;
}

export class GymAppRepository {
  constructor(private readonly database: DatabaseSync) {
    database.exec('PRAGMA busy_timeout = 5000;');
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS gym_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(provider, subject)
      );
      CREATE TABLE IF NOT EXISTS gym_principals (
        id TEXT PRIMARY KEY,
        account_id TEXT REFERENCES gym_accounts(id),
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_principals_account ON gym_principals(account_id) WHERE account_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS app_sessions (
        session_hash TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES gym_principals(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile_recovery_tokens (
        principal_id TEXT PRIMARY KEY REFERENCES gym_principals(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS manual_check_ins (
        principal_id TEXT PRIMARY KEY REFERENCES gym_principals(id) ON DELETE CASCADE,
        checked_in_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_manual_check_ins_expires_at ON manual_check_ins(expires_at);
      CREATE TABLE IF NOT EXISTS gym_visits (
        id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES gym_principals(id) ON DELETE CASCADE,
        checked_in_at TEXT NOT NULL,
        checked_out_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_gym_visits_owner_date ON gym_visits(principal_id, checked_in_at);
      CREATE TABLE IF NOT EXISTS gym_reservations (
        id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES gym_principals(id) ON DELETE CASCADE,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gym_reservations_slot ON gym_reservations(starts_at, ends_at);
      CREATE INDEX IF NOT EXISTS idx_gym_reservations_owner ON gym_reservations(principal_id, starts_at);
      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES gym_principals(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workouts_owner_date ON workouts(principal_id, occurred_at);
      CREATE TABLE IF NOT EXISTS workout_exercises (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exercise_sets (
        id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        weight_kg REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS training_goals (
        principal_id TEXT PRIMARY KEY REFERENCES gym_principals(id) ON DELETE CASCADE,
        weekly_sessions INTEGER NOT NULL CHECK (weekly_sessions BETWEEN 1 AND 14),
        updated_at TEXT NOT NULL
      );
    `);
  }

  cleanupExpiredData(nowIso: string, visitCutoffIso: string, reservationCutoffIso: string): void {
    this.database.prepare(`
      UPDATE gym_visits SET checked_out_at = (
        SELECT expires_at FROM manual_check_ins WHERE manual_check_ins.principal_id = gym_visits.principal_id
      )
      WHERE checked_out_at IS NULL AND EXISTS (
        SELECT 1 FROM manual_check_ins WHERE manual_check_ins.principal_id = gym_visits.principal_id AND expires_at <= ?
      )
    `).run(nowIso);
    this.database.prepare('DELETE FROM manual_check_ins WHERE expires_at <= ?').run(nowIso);
    this.database.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').run(nowIso);
    this.database.prepare('DELETE FROM gym_visits WHERE checked_in_at <= ?').run(visitCutoffIso);
    this.database.prepare('DELETE FROM gym_reservations WHERE ends_at < ?').run(reservationCutoffIso);
  }

  findSession(sessionHash: string, nowIso: string): { principalId: string } | undefined {
    return this.database.prepare('SELECT principal_id AS principalId FROM app_sessions WHERE session_hash = ? AND expires_at > ?')
      .get(sessionHash, nowIso) as { principalId: string } | undefined;
  }

  renewSession(sessionHash: string, expiresAt: string): void {
    this.database.prepare('UPDATE app_sessions SET expires_at = ? WHERE session_hash = ?').run(expiresAt, sessionHash);
  }

  createAnonymousPrincipal(sessionHash: string, nowIso: string, expiresAt: string): string {
    const principalId = randomUUID();
    this.database.prepare('INSERT INTO gym_principals(id, created_at) VALUES (?, ?)').run(principalId, nowIso);
    this.createSession(sessionHash, principalId, nowIso, expiresAt);
    return principalId;
  }

  linkAnonymousProfileToVerifiedAccount(principalId: string, provider: string, verifiedSubject: string, nowIso: string): string {
    if (!provider || provider.length > 40 || !verifiedSubject || verifiedSubject.length > 255) {
      throw new Error('verified identity is invalid');
    }
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const principal = this.database.prepare('SELECT account_id FROM gym_principals WHERE id = ?')
        .get(principalId) as { account_id: string | null } | undefined;
      if (!principal) throw new Error('anonymous profile does not exist');
      const existingAccount = this.database.prepare('SELECT id FROM gym_accounts WHERE provider = ? AND subject = ?')
        .get(provider, verifiedSubject) as { id: string } | undefined;
      const accountId = existingAccount?.id ?? randomUUID();
      if (!existingAccount) {
        this.database.prepare('INSERT INTO gym_accounts(id, provider, subject, created_at) VALUES (?, ?, ?, ?)')
          .run(accountId, provider, verifiedSubject, nowIso);
      }
      if (principal.account_id && principal.account_id !== accountId) {
        throw new Error('profile is already linked to another account');
      }
      const linkedPrincipal = this.database.prepare('SELECT id FROM gym_principals WHERE account_id = ?')
        .get(accountId) as { id: string } | undefined;
      if (linkedPrincipal && linkedPrincipal.id !== principalId) {
        throw new Error('verified account is already linked to another profile');
      }
      this.database.prepare('UPDATE gym_principals SET account_id = ? WHERE id = ?').run(accountId, principalId);
      this.database.exec('COMMIT');
      return accountId;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  createSession(sessionHash: string, principalId: string, nowIso: string, expiresAt: string): void {
    this.database.prepare('INSERT INTO app_sessions(session_hash, principal_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sessionHash, principalId, nowIso, expiresAt);
  }

  setRecoveryToken(principalId: string, tokenHash: string, nowIso: string): void {
    this.database.prepare(`
      INSERT INTO profile_recovery_tokens(principal_id, token_hash, created_at) VALUES (?, ?, ?)
      ON CONFLICT(principal_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at
    `).run(principalId, tokenHash, nowIso);
  }

  hasRecoveryToken(principalId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM profile_recovery_tokens WHERE principal_id = ?').get(principalId));
  }

  recoverPrincipal(tokenHash: string, sessionHash: string, nowIso: string, expiresAt: string): string | undefined {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const record = this.database.prepare('SELECT principal_id FROM profile_recovery_tokens WHERE token_hash = ?')
        .get(tokenHash) as { principal_id: string } | undefined;
      if (!record) {
        this.database.exec('ROLLBACK');
        return undefined;
      }
      this.database.prepare('DELETE FROM profile_recovery_tokens WHERE principal_id = ?').run(record.principal_id);
      this.database.prepare('DELETE FROM app_sessions WHERE principal_id = ?').run(record.principal_id);
      this.createSession(sessionHash, record.principal_id, nowIso, expiresAt);
      this.database.exec('COMMIT');
      return record.principal_id;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  getCheckIn(principalId: string, nowIso: string): { checkedInAt: string; expiresAt: string } | undefined {
    return this.database.prepare('SELECT checked_in_at AS checkedInAt, expires_at AS expiresAt FROM manual_check_ins WHERE principal_id = ? AND expires_at > ?')
      .get(principalId, nowIso) as { checkedInAt: string; expiresAt: string } | undefined;
  }

  occupancy(nowIso: string): number {
    return (this.database.prepare('SELECT COUNT(*) AS count FROM manual_check_ins WHERE expires_at > ?').get(nowIso) as { count: number }).count;
  }

  checkIn(principalId: string, checkedInAt: string, expiresAt: string): { checkedInAt: string; expiresAt: string } {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const current = this.database.prepare('SELECT checked_in_at AS checkedInAt, expires_at AS expiresAt FROM manual_check_ins WHERE principal_id = ?')
        .get(principalId) as { checkedInAt: string; expiresAt: string } | undefined;
      if (current) {
        this.database.exec('COMMIT');
        return current;
      }
      this.database.prepare('INSERT INTO manual_check_ins(principal_id, checked_in_at, expires_at) VALUES (?, ?, ?)')
        .run(principalId, checkedInAt, expiresAt);
      this.database.prepare('INSERT INTO gym_visits(id, principal_id, checked_in_at) VALUES (?, ?, ?)')
        .run(randomUUID(), principalId, checkedInAt);
      this.database.exec('COMMIT');
      return { checkedInAt, expiresAt };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  checkOut(principalId: string, checkedOutAt: string): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('UPDATE gym_visits SET checked_out_at = ? WHERE principal_id = ? AND checked_out_at IS NULL')
        .run(checkedOutAt, principalId);
      this.database.prepare('DELETE FROM manual_check_ins WHERE principal_id = ?').run(principalId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  availability(startAt: string, endAt: string, capacity: number | null): BookingAvailability {
    const reserved = (this.database.prepare('SELECT COUNT(*) AS count FROM gym_reservations WHERE starts_at < ? AND ends_at > ?')
      .get(endAt, startAt) as { count: number }).count;
    return { reserved, capacity, availablePlaces: capacity === null ? null : Math.max(0, capacity - reserved) };
  }

  listBookingSlots(from: string, to: string, capacity: number | null): Array<BookingAvailability & { startsAt: string; endsAt: string }> {
    const rows = this.database.prepare(`
      SELECT DISTINCT starts_at AS startsAt, ends_at AS endsAt
      FROM gym_reservations WHERE starts_at < ? AND ends_at > ?
      ORDER BY starts_at ASC
    `).all(to, from) as Array<{ startsAt: string; endsAt: string }>;
    return rows.map((row) => ({ ...row, ...this.availability(row.startsAt, row.endsAt, capacity) }));
  }

  createBooking(principalId: string, booking: BookingRecord, createdAt: string, capacity: number | null): BookingAvailability | null {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const current = this.availability(booking.startsAt, booking.endsAt, capacity);
      if (current.availablePlaces !== null && current.availablePlaces <= 0) {
        this.database.exec('ROLLBACK');
        return null;
      }
      this.database.prepare('INSERT INTO gym_reservations(id, principal_id, starts_at, ends_at, title, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(booking.id, principalId, booking.startsAt, booking.endsAt, booking.title, createdAt);
      const updated = this.availability(booking.startsAt, booking.endsAt, capacity);
      this.database.exec('COMMIT');
      return updated;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listMyBookings(principalId: string): BookingRecord[] {
    return this.database.prepare(`
      SELECT id, starts_at AS startsAt, ends_at AS endsAt, title
      FROM gym_reservations WHERE principal_id = ? ORDER BY starts_at ASC
    `).all(principalId) as unknown as BookingRecord[];
  }

  deleteBooking(principalId: string, id: string): boolean {
    return this.database.prepare('DELETE FROM gym_reservations WHERE id = ? AND principal_id = ?').run(id, principalId).changes > 0;
  }

  listVisits(principalId: string, from: string, to: string): Array<{ id: string; checkedInAt: string; checkedOutAt: string | null }> {
    return this.database.prepare(`
      SELECT id, checked_in_at AS checkedInAt, checked_out_at AS checkedOutAt
      FROM gym_visits WHERE principal_id = ? AND checked_in_at >= ? AND checked_in_at < ?
      ORDER BY checked_in_at DESC
    `).all(principalId, from, to) as Array<{ id: string; checkedInAt: string; checkedOutAt: string | null }>;
  }

  listWorkouts(principalId: string): WorkoutRecord[] {
    const rows = this.database.prepare(`
      SELECT id, title, occurred_at AS occurredAt FROM workouts
      WHERE principal_id = ? ORDER BY occurred_at DESC LIMIT 100
    `).all(principalId) as Array<Omit<WorkoutRecord, 'exercises'>>;
    return rows.map((workout) => {
      const exerciseRows = this.database.prepare('SELECT id, name FROM workout_exercises WHERE workout_id = ? ORDER BY position ASC')
        .all(workout.id) as Array<{ id: string; name: string }>;
      return {
        ...workout,
        exercises: exerciseRows.map((exercise) => ({
          name: exercise.name,
          sets: this.database.prepare('SELECT reps, weight_kg AS weightKg FROM exercise_sets WHERE exercise_id = ? ORDER BY position ASC')
            .all(exercise.id) as Array<{ reps: number; weightKg: number }>,
        })),
      };
    });
  }

  createWorkout(principalId: string, workout: WorkoutRecord, createdAt: string): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('INSERT INTO workouts(id, principal_id, title, occurred_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(workout.id, principalId, workout.title, workout.occurredAt, createdAt);
      workout.exercises.forEach((exercise, index) => {
        const exerciseId = randomUUID();
        this.database.prepare('INSERT INTO workout_exercises(id, workout_id, position, name) VALUES (?, ?, ?, ?)')
          .run(exerciseId, workout.id, index, exercise.name);
        exercise.sets.forEach((set, setIndex) => {
          this.database.prepare('INSERT INTO exercise_sets(id, exercise_id, position, reps, weight_kg) VALUES (?, ?, ?, ?, ?)')
            .run(randomUUID(), exerciseId, setIndex, set.reps, set.weightKg);
        });
      });
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  deleteWorkout(principalId: string, id: string): boolean {
    return this.database.prepare('DELETE FROM workouts WHERE id = ? AND principal_id = ?').run(id, principalId).changes > 0;
  }

  getWeeklyGoal(principalId: string): number {
    const row = this.database.prepare('SELECT weekly_sessions AS weeklySessions FROM training_goals WHERE principal_id = ?')
      .get(principalId) as { weeklySessions: number } | undefined;
    return row?.weeklySessions ?? 3;
  }

  setWeeklyGoal(principalId: string, weeklySessions: number, updatedAt: string): void {
    this.database.prepare(`
      INSERT INTO training_goals(principal_id, weekly_sessions, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(principal_id) DO UPDATE SET weekly_sessions = excluded.weekly_sessions, updated_at = excluded.updated_at
    `).run(principalId, weeklySessions, updatedAt);
  }

  deletePersonalData(principalId: string): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('DELETE FROM manual_check_ins WHERE principal_id = ?').run(principalId);
      this.database.prepare('DELETE FROM gym_visits WHERE principal_id = ?').run(principalId);
      this.database.prepare('DELETE FROM gym_reservations WHERE principal_id = ?').run(principalId);
      this.database.prepare('DELETE FROM workouts WHERE principal_id = ?').run(principalId);
      this.database.prepare('DELETE FROM training_goals WHERE principal_id = ?').run(principalId);
      this.database.prepare('DELETE FROM profile_recovery_tokens WHERE principal_id = ?').run(principalId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
