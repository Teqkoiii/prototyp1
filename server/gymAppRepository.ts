import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface BookingRecord {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  status: 'planned' | 'cancelled';
}

export interface WorkoutRecord {
  id: string;
  title: string;
  occurredAt: string;
  notes: string;
  exercises: Array<{ name: string; sets: Array<{ reps: number; weightKg: number }> }>;
}

export interface TrainingPlanRecord {
  id: string;
  name: string;
  notes: string;
  exercises: Array<{ name: string; targetSets?: number; targetReps?: number; targetWeightKg?: number }>;
}

export interface BookingAvailability {
  reserved: number;
  capacity: null;
  availablePlaces: null;
}

export const UNLIMITED_BOOKING_AVAILABILITY = { capacity: null, availablePlaces: null } as const;

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
    this.migrate();
  }

  private tableColumns(table: 'gym_reservations' | 'workouts'): Set<string> {
    const rows = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  }

  private migrate(): void {
    const reservationColumns = this.tableColumns('gym_reservations');
    if (!reservationColumns.has('status')) {
      this.database.exec("ALTER TABLE gym_reservations ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'");
    }
    if (!reservationColumns.has('cancelled_at')) {
      this.database.exec('ALTER TABLE gym_reservations ADD COLUMN cancelled_at TEXT');
    }
    const workoutColumns = this.tableColumns('workouts');
    if (!workoutColumns.has('notes')) {
      this.database.exec("ALTER TABLE workouts ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
    }
    this.database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_reservations_owner_slot_planned
        ON gym_reservations(principal_id, starts_at, ends_at) WHERE status = 'planned';
      CREATE TABLE IF NOT EXISTS gym_local_credentials (
        principal_id TEXT PRIMARY KEY REFERENCES gym_principals(id) ON DELETE CASCADE,
        email_normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS occupancy_samples (
        sampled_at TEXT PRIMARY KEY,
        reported_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_occupancy_samples_time ON occupancy_samples(sampled_at);
      CREATE TABLE IF NOT EXISTS training_plans (
        id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES gym_principals(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_training_plans_owner ON training_plans(principal_id, updated_at);
      CREATE TABLE IF NOT EXISTS training_plan_exercises (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_sets INTEGER,
        target_reps INTEGER,
        target_weight_kg REAL
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
    this.database.prepare('DELETE FROM occupancy_samples WHERE sampled_at < ?').run(new Date(Date.parse(nowIso) - 8 * 86400_000).toISOString());
  }

  findSession(sessionHash: string, nowIso: string): { principalId: string } | undefined {
    return this.database.prepare('SELECT principal_id AS principalId FROM app_sessions WHERE session_hash = ? AND expires_at > ?')
      .get(sessionHash, nowIso) as { principalId: string } | undefined;
  }

  renewSession(sessionHash: string, expiresAt: string): void {
    this.database.prepare('UPDATE app_sessions SET expires_at = ? WHERE session_hash = ?').run(expiresAt, sessionHash);
  }

  deleteSession(sessionHash: string): void {
    this.database.prepare('DELETE FROM app_sessions WHERE session_hash = ?').run(sessionHash);
  }

  createAnonymousPrincipal(sessionHash: string, nowIso: string, expiresAt: string): string {
    const principalId = randomUUID();
    this.database.prepare('INSERT INTO gym_principals(id, created_at) VALUES (?, ?)').run(principalId, nowIso);
    this.createSession(sessionHash, principalId, nowIso, expiresAt);
    return principalId;
  }

  hasLocalCredentials(principalId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM gym_local_credentials WHERE principal_id = ?').get(principalId));
  }

  getLocalAccount(principalId: string): { email: string } | undefined {
    const row = this.database.prepare('SELECT email_normalized AS email FROM gym_local_credentials WHERE principal_id = ?')
      .get(principalId) as { email: string } | undefined;
    return row;
  }

  findLocalCredentialsByEmail(emailNormalized: string): { principalId: string; passwordHash: string } | undefined {
    return this.database.prepare(`
      SELECT principal_id AS principalId, password_hash AS passwordHash
      FROM gym_local_credentials WHERE email_normalized = ?
    `).get(emailNormalized) as { principalId: string; passwordHash: string } | undefined;
  }

  createLocalCredentials(principalId: string, emailNormalized: string, passwordHash: string, nowIso: string): void {
    this.database.prepare('INSERT INTO gym_local_credentials(principal_id, email_normalized, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(principalId, emailNormalized, passwordHash, nowIso);
  }

  emailTaken(emailNormalized: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM gym_local_credentials WHERE email_normalized = ?').get(emailNormalized));
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

  plannedOverlapping(nowIso: string): number {
    return (this.database.prepare(`
      SELECT COUNT(*) AS count FROM gym_reservations
      WHERE status = 'planned' AND starts_at <= ? AND ends_at > ?
    `).get(nowIso, nowIso) as { count: number }).count;
  }

  recordOccupancySample(nowIso: string, count: number): void {
    const last = this.database.prepare('SELECT sampled_at AS sampledAt, reported_count AS reportedCount FROM occupancy_samples ORDER BY sampled_at DESC LIMIT 1')
      .get() as { sampledAt: string; reportedCount: number } | undefined;
    if (last && last.reportedCount === count && Date.parse(nowIso) - Date.parse(last.sampledAt) < 60_000) return;
    this.database.prepare('INSERT OR REPLACE INTO occupancy_samples(sampled_at, reported_count) VALUES (?, ?)').run(nowIso, count);
  }

  listOccupancyHistory(fromIso: string, toIso: string): Array<{ at: string; count: number }> {
    return this.database.prepare(`
      SELECT sampled_at AS at, reported_count AS count
      FROM occupancy_samples WHERE sampled_at >= ? AND sampled_at <= ?
      ORDER BY sampled_at ASC
    `).all(fromIso, toIso) as Array<{ at: string; count: number }>;
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

  availability(startAt: string, endAt: string): BookingAvailability {
    const reserved = (this.database.prepare(`
      SELECT COUNT(*) AS count FROM gym_reservations
      WHERE status = 'planned' AND starts_at < ? AND ends_at > ?
    `).get(endAt, startAt) as { count: number }).count;
    return { reserved, ...UNLIMITED_BOOKING_AVAILABILITY };
  }

  listBookingSlots(from: string, to: string): Array<BookingAvailability & { startsAt: string; endsAt: string }> {
    const rows = this.database.prepare(`
      SELECT DISTINCT starts_at AS startsAt, ends_at AS endsAt
      FROM gym_reservations WHERE status = 'planned' AND starts_at < ? AND ends_at > ?
      ORDER BY starts_at ASC
    `).all(to, from) as Array<{ startsAt: string; endsAt: string }>;
    return rows.map((row) => ({ ...row, ...this.availability(row.startsAt, row.endsAt) }));
  }

  createBooking(principalId: string, booking: Omit<BookingRecord, 'status'>, createdAt: string): { availability: BookingAvailability } | { duplicate: true } {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`
        INSERT INTO gym_reservations(id, principal_id, starts_at, ends_at, title, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'planned')
      `).run(booking.id, principalId, booking.startsAt, booking.endsAt, booking.title, createdAt);
      const availability = this.availability(booking.startsAt, booking.endsAt);
      this.database.exec('COMMIT');
      return { availability };
    } catch (error) {
      this.database.exec('ROLLBACK');
      if (isUniqueConstraint(error)) return { duplicate: true };
      throw error;
    }
  }

  updateBooking(principalId: string, id: string, booking: Omit<BookingRecord, 'id' | 'status'>, updatedAt: string): BookingRecord | 'missing' | 'duplicate' {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.database.prepare(`
        SELECT id FROM gym_reservations WHERE id = ? AND principal_id = ? AND status = 'planned'
      `).get(id, principalId);
      if (!existing) {
        this.database.exec('ROLLBACK');
        return 'missing';
      }
      this.database.prepare(`
        UPDATE gym_reservations SET starts_at = ?, ends_at = ?, title = ?, created_at = ?
        WHERE id = ? AND principal_id = ? AND status = 'planned'
      `).run(booking.startsAt, booking.endsAt, booking.title, updatedAt, id, principalId);
      this.database.exec('COMMIT');
      return { id, ...booking, status: 'planned' };
    } catch (error) {
      this.database.exec('ROLLBACK');
      if (isUniqueConstraint(error)) return 'duplicate';
      throw error;
    }
  }

  listMyBookings(principalId: string): BookingRecord[] {
    return this.database.prepare(`
      SELECT id, starts_at AS startsAt, ends_at AS endsAt, title, status
      FROM gym_reservations
      WHERE principal_id = ? AND status = 'planned'
      ORDER BY starts_at ASC
    `).all(principalId) as unknown as BookingRecord[];
  }

  cancelBooking(principalId: string, id: string, cancelledAt: string): boolean {
    return this.database.prepare(`
      UPDATE gym_reservations SET status = 'cancelled', cancelled_at = ?
      WHERE id = ? AND principal_id = ? AND status = 'planned'
    `).run(cancelledAt, id, principalId).changes > 0;
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
      SELECT id, title, occurred_at AS occurredAt, notes FROM workouts
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
      this.database.prepare('INSERT INTO workouts(id, principal_id, title, occurred_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(workout.id, principalId, workout.title, workout.occurredAt, workout.notes, createdAt);
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

  listTrainingPlans(principalId: string): TrainingPlanRecord[] {
    const rows = this.database.prepare(`
      SELECT id, name, notes FROM training_plans WHERE principal_id = ? ORDER BY updated_at DESC
    `).all(principalId) as Array<{ id: string; name: string; notes: string }>;
    return rows.map((plan) => ({
      ...plan,
      exercises: this.database.prepare(`
        SELECT name, target_sets AS targetSets, target_reps AS targetReps, target_weight_kg AS targetWeightKg
        FROM training_plan_exercises WHERE plan_id = ? ORDER BY position ASC
      `).all(plan.id) as TrainingPlanRecord['exercises'],
    }));
  }

  createTrainingPlan(principalId: string, plan: TrainingPlanRecord, nowIso: string): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare('INSERT INTO training_plans(id, principal_id, name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(plan.id, principalId, plan.name, plan.notes, nowIso, nowIso);
      this.insertPlanExercises(plan);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  updateTrainingPlan(principalId: string, plan: TrainingPlanRecord, nowIso: string): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.database.prepare('UPDATE training_plans SET name = ?, notes = ?, updated_at = ? WHERE id = ? AND principal_id = ?')
        .run(plan.name, plan.notes, nowIso, plan.id, principalId).changes;
      if (updated === 0) {
        this.database.exec('ROLLBACK');
        return false;
      }
      this.database.prepare('DELETE FROM training_plan_exercises WHERE plan_id = ?').run(plan.id);
      this.insertPlanExercises(plan);
      this.database.exec('COMMIT');
      return true;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  deleteTrainingPlan(principalId: string, id: string): boolean {
    return this.database.prepare('DELETE FROM training_plans WHERE id = ? AND principal_id = ?').run(id, principalId).changes > 0;
  }

  private insertPlanExercises(plan: TrainingPlanRecord): void {
    plan.exercises.forEach((exercise, index) => {
      this.database.prepare(`
        INSERT INTO training_plan_exercises(id, plan_id, position, name, target_sets, target_reps, target_weight_kg)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), plan.id, index, exercise.name, exercise.targetSets ?? null, exercise.targetReps ?? null, exercise.targetWeightKg ?? null);
    });
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
      this.database.prepare('DELETE FROM training_plans WHERE principal_id = ?').run(principalId);
      this.database.prepare('DELETE FROM training_goals WHERE principal_id = ?').run(principalId);
      this.database.prepare('DELETE FROM profile_recovery_tokens WHERE principal_id = ?').run(principalId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
