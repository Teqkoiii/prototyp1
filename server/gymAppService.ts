import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { GymAppRepository, type BookingAvailability, type BookingRecord, type TrainingPlanRecord, type WorkoutRecord } from './gymAppRepository';
import { hashPassword, verifyPasswordOrDummy } from './password';

const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const VISIT_RETENTION_DAYS = 90;
const RESERVATION_DURATIONS = new Set([30, 60, 90, 120]);
const OCCUPANCY_RANGES: Record<string, number> = {
  '60m': 60 * 60_000,
  '3h': 3 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 86400_000,
};
const EMAIL_PATTERN = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

export class GymDomainError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GymDomainError';
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !EMAIL_PATTERN.test(email)) return undefined;
  return email;
}

function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) {
    throw new GymDomainError('password must be between 10 and 128 characters', 400);
  }
  return value;
}

export class GymAppService {
  private readonly recoveryAttempts = new Map<string, { count: number; resetsAt: number }>();
  private readonly loginAttempts = new Map<string, { count: number; resetsAt: number }>();

  constructor(
    private readonly repository: GymAppRepository,
    private readonly options: {
      maxCheckInHours: number;
      now?: () => number;
      makeToken?: () => string;
    },
  ) {
    if (!Number.isFinite(options.maxCheckInHours) || options.maxCheckInHours < 1 || options.maxCheckInHours > 24) {
      throw new Error('maxCheckInHours must be between 1 and 24');
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private makeToken(): string {
    return this.options.makeToken?.() ?? randomBytes(32).toString('hex');
  }

  cleanupExpiredData(): void {
    const timestamp = this.now();
    this.repository.cleanupExpiredData(
      new Date(timestamp).toISOString(),
      new Date(timestamp - VISIT_RETENTION_DAYS * 86400_000).toISOString(),
      new Date(timestamp - 30 * 86400_000).toISOString(),
    );
  }

  openSession(token?: string): { token: string; principalId: string; maxAgeSeconds: number } {
    this.cleanupExpiredData();
    const timestamp = this.now();
    const nowIso = new Date(timestamp).toISOString();
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const sessionHash = hashToken(token);
      const existing = this.repository.findSession(sessionHash, nowIso);
      if (existing) {
        this.repository.renewSession(sessionHash, new Date(timestamp + SESSION_MAX_AGE_SECONDS * 1000).toISOString());
        return { token, principalId: existing.principalId, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
      }
    }

    const nextToken = this.makeToken();
    const principalId = this.repository.createAnonymousPrincipal(
      hashToken(nextToken),
      nowIso,
      new Date(timestamp + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
    );
    return { token: nextToken, principalId, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
  }

  resolvePrincipal(token: string | undefined): string | undefined {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    this.cleanupExpiredData();
    return this.repository.findSession(hashToken(token), new Date(this.now()).toISOString())?.principalId;
  }

  logout(token: string | undefined): void {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    this.repository.deleteSession(hashToken(token));
  }

  getSession(principalId: string) {
    const timestamp = this.now();
    const checkIn = this.repository.getCheckIn(principalId, new Date(timestamp).toISOString());
    const account = this.repository.getLocalAccount(principalId);
    return {
      identity: account ? 'local-account' as const : 'anonymous-app-profile' as const,
      email: account?.email ?? null,
      recoveryConfigured: this.repository.hasRecoveryToken(principalId),
      checkedInAt: checkIn?.checkedInAt ?? null,
      checkInExpiresAt: checkIn?.expiresAt ?? null,
      maxCheckInHours: this.options.maxCheckInHours,
      serverTime: new Date(timestamp).toISOString(),
    };
  }

  async register(currentToken: string | undefined, input: unknown): Promise<{ token: string; principalId: string; maxAgeSeconds: number }> {
    const email = normalizeEmail(isRecord(input) ? input.email : undefined);
    if (!email) throw new GymDomainError('a valid email address is required', 400);
    const password = validatePassword(isRecord(input) ? input.password : undefined);
    if (this.repository.emailTaken(email)) throw new GymDomainError('an account with this email already exists', 409);

    const timestamp = this.now();
    const nowIso = new Date(timestamp).toISOString();
    let principalId = this.resolvePrincipal(currentToken);
    if (principalId && this.repository.hasLocalCredentials(principalId)) {
      throw new GymDomainError('this session already has an account', 409);
    }
    const passwordHash = await hashPassword(password);
    if (!principalId) {
      const opened = this.openSession();
      principalId = opened.principalId;
      this.saveLocalCredentials(principalId, email, passwordHash, nowIso);
      return opened;
    }
    this.saveLocalCredentials(principalId, email, passwordHash, nowIso);
    return this.openSession(currentToken);
  }

  async login(input: unknown, rateLimitKey: string): Promise<{ token: string; principalId: string; maxAgeSeconds: number }> {
    this.enforceRateLimit(this.loginAttempts, rateLimitKey, 8, 5 * 60_000);
    const email = normalizeEmail(isRecord(input) ? input.email : undefined);
    const password = typeof (isRecord(input) ? input.password : undefined) === 'string' ? String((input as { password: string }).password) : '';
    const credentials = email ? this.repository.findLocalCredentialsByEmail(email) : undefined;
    const valid = await verifyPasswordOrDummy(password, credentials?.passwordHash);
    if (!email || password.length < 10 || password.length > 128 || !credentials || !valid) {
      throw new GymDomainError('email or password is incorrect', 401);
    }
    this.loginAttempts.delete(rateLimitKey);
    const timestamp = this.now();
    const token = this.makeToken();
    this.repository.createSession(
      hashToken(token),
      credentials.principalId,
      new Date(timestamp).toISOString(),
      new Date(timestamp + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
    );
    return { token, principalId: credentials.principalId, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
  }

  getOccupancy(rangeValue: unknown = '24h') {
    const timestamp = this.now();
    const refreshedAt = new Date(timestamp).toISOString();
    this.cleanupExpiredData();
    const count = this.repository.occupancy(refreshedAt);
    this.repository.recordOccupancySample(refreshedAt, count);
    const range = typeof rangeValue === 'string' && rangeValue in OCCUPANCY_RANGES ? rangeValue : '24h';
    const from = new Date(timestamp - OCCUPANCY_RANGES[range]).toISOString();
    return {
      count,
      plannedNow: this.repository.plannedOverlapping(refreshedAt),
      refreshedAt,
      source: 'self-reported-manual-check-ins' as const,
      disclaimer: 'User-reported occupancy from app check-ins. This is not a verified visitor count and not an access decision.',
      maxCheckInHours: this.options.maxCheckInHours,
      history: {
        range,
        points: this.repository.listOccupancyHistory(from, refreshedAt),
      },
    };
  }

  checkIn(principalId: string) {
    const timestamp = this.now();
    const result = this.repository.checkIn(
      principalId,
      new Date(timestamp).toISOString(),
      new Date(timestamp + this.options.maxCheckInHours * 60 * 60 * 1000).toISOString(),
    );
    const occupancy = this.repository.occupancy(new Date(timestamp).toISOString());
    this.repository.recordOccupancySample(new Date(timestamp).toISOString(), occupancy);
    return { ...result, maxCheckInHours: this.options.maxCheckInHours };
  }

  checkOut(principalId: string) {
    const checkedOutAt = new Date(this.now()).toISOString();
    this.repository.checkOut(principalId, checkedOutAt);
    const occupancy = this.repository.occupancy(checkedOutAt);
    this.repository.recordOccupancySample(checkedOutAt, occupancy);
    return { checkedInAt: null, checkedOutAt };
  }

  getAvailability(startAt: unknown, durationMinutes: unknown): { startAt: string; endAt: string } & BookingAvailability {
    if (!isDate(startAt) || typeof durationMinutes !== 'number' || !RESERVATION_DURATIONS.has(durationMinutes)) {
      throw new GymDomainError('valid startAt and durationMinutes are required', 400);
    }
    const startMs = Date.parse(startAt);
    if (startMs < this.now()) throw new GymDomainError('availability must be checked for a future time', 400);
    const normalizedStart = new Date(startMs).toISOString();
    const endAt = new Date(startMs + durationMinutes * 60_000).toISOString();
    return { startAt: normalizedStart, endAt, ...this.repository.availability(normalizedStart, endAt) };
  }

  listBookingSlots(fromValue: unknown, toValue: unknown) {
    const now = this.now();
    const from = isDate(fromValue) ? new Date(Date.parse(fromValue)).toISOString() : new Date(now).toISOString();
    const to = isDate(toValue) ? new Date(Date.parse(toValue)).toISOString() : new Date(now + 30 * 86400_000).toISOString();
    if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 90 * 86400_000) {
      throw new GymDomainError('booking window must be between 0 and 90 days', 400);
    }
    this.cleanupExpiredData();
    return {
      slots: this.repository.listBookingSlots(from, to),
      capacityConfigured: false,
      bookingMeaning: 'planned-visit' as const,
    };
  }

  createBooking(principalId: string, input: unknown): { booking: BookingRecord; availability: BookingAvailability } {
    const parsed = this.parseBookingInput(input);
    const timestamp = this.now();
    if (parsed.startMs < timestamp || parsed.startMs > timestamp + 90 * 86400_000) {
      throw new GymDomainError('booking must start within the next 90 days', 400);
    }
    const booking: Omit<BookingRecord, 'status'> = {
      id: randomUUID(),
      startsAt: new Date(parsed.startMs).toISOString(),
      endsAt: new Date(parsed.startMs + parsed.durationMinutes * 60_000).toISOString(),
      title: parsed.title,
    };
    const result = this.repository.createBooking(principalId, booking, new Date(timestamp).toISOString());
    if ('duplicate' in result) throw new GymDomainError('you already have this time planned', 409);
    return { booking: { ...booking, status: 'planned' }, availability: result.availability };
  }

  updateBooking(principalId: string, id: string, input: unknown): BookingRecord {
    const parsed = this.parseBookingInput(input);
    const timestamp = this.now();
    if (parsed.startMs < timestamp || parsed.startMs > timestamp + 90 * 86400_000) {
      throw new GymDomainError('booking must start within the next 90 days', 400);
    }
    const result = this.repository.updateBooking(principalId, id, {
      startsAt: new Date(parsed.startMs).toISOString(),
      endsAt: new Date(parsed.startMs + parsed.durationMinutes * 60_000).toISOString(),
      title: parsed.title,
    }, new Date(timestamp).toISOString());
    if (result === 'missing') throw new GymDomainError('planned visit not found', 404);
    if (result === 'duplicate') throw new GymDomainError('you already have this time planned', 409);
    return result;
  }

  listMyBookings(principalId: string) {
    this.cleanupExpiredData();
    return this.repository.listMyBookings(principalId);
  }

  cancelBooking(principalId: string, id: string): void {
    if (!this.repository.cancelBooking(principalId, id, new Date(this.now()).toISOString())) {
      throw new GymDomainError('planned visit not found', 404);
    }
  }

  listVisits(principalId: string, fromValue: unknown, toValue: unknown) {
    this.cleanupExpiredData();
    const timestamp = this.now();
    const from = isDate(fromValue) ? new Date(Date.parse(fromValue)).toISOString() : new Date(timestamp - VISIT_RETENTION_DAYS * 86400_000).toISOString();
    const to = isDate(toValue) ? new Date(Date.parse(toValue)).toISOString() : new Date(timestamp + 86400_000).toISOString();
    if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 400 * 86400_000) {
      throw new GymDomainError('visit window is invalid', 400);
    }
    return { visits: this.repository.listVisits(principalId, from, to), retentionDays: VISIT_RETENTION_DAYS };
  }

  listWorkouts(principalId: string): { workouts: WorkoutRecord[] } {
    this.cleanupExpiredData();
    return { workouts: this.repository.listWorkouts(principalId) };
  }

  createWorkout(principalId: string, input: unknown): { id: string } {
    if (!isRecord(input) || typeof input.title !== 'string' || input.title.trim().length < 1 || input.title.length > 80 ||
        !isDate(input.occurredAt) || !Array.isArray(input.exercises) || input.exercises.length < 1 || input.exercises.length > 30) {
      throw new GymDomainError('workout needs a title, date and at least one exercise', 400);
    }
    if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 500)) {
      throw new GymDomainError('workout notes must be at most 500 characters', 400);
    }
    const timestamp = this.now();
    const occurredAtMs = Date.parse(input.occurredAt);
    if (occurredAtMs > timestamp + 60_000 || occurredAtMs < timestamp - 365 * 86400_000) {
      throw new GymDomainError('workout date must be within the past year and not in the future', 400);
    }
    const exercises = input.exercises as unknown[];
    const validExercises = exercises.every((exercise) => isRecord(exercise) &&
      typeof exercise.name === 'string' && exercise.name.trim().length > 0 && exercise.name.length <= 80 &&
      Array.isArray(exercise.sets) && exercise.sets.length > 0 && exercise.sets.length <= 20 &&
      exercise.sets.every((set) => isRecord(set) && Number.isInteger(set.reps) && Number(set.reps) > 0 && Number(set.reps) <= 100 &&
        typeof set.weightKg === 'number' && Number.isFinite(set.weightKg) && set.weightKg >= 0 && set.weightKg <= 500));
    if (!validExercises) throw new GymDomainError('exercise sets need valid repetitions and weights', 400);

    const workout: WorkoutRecord = {
      id: randomUUID(),
      title: input.title.trim(),
      occurredAt: new Date(occurredAtMs).toISOString(),
      notes: typeof input.notes === 'string' ? input.notes.trim() : '',
      exercises: exercises.map((exercise) => {
        const item = exercise as { name: string; sets: Array<{ reps: number; weightKg: number }> };
        return { name: item.name.trim(), sets: item.sets.map((set) => ({ reps: set.reps, weightKg: set.weightKg })) };
      }),
    };
    this.repository.createWorkout(principalId, workout, new Date(timestamp).toISOString());
    return { id: workout.id };
  }

  deleteWorkout(principalId: string, id: string): void {
    if (!this.repository.deleteWorkout(principalId, id)) throw new GymDomainError('workout not found', 404);
  }

  listTrainingPlans(principalId: string): { plans: TrainingPlanRecord[] } {
    return { plans: this.repository.listTrainingPlans(principalId) };
  }

  createTrainingPlan(principalId: string, input: unknown): { id: string } {
    const plan = this.parseTrainingPlan(input, randomUUID());
    this.repository.createTrainingPlan(principalId, plan, new Date(this.now()).toISOString());
    return { id: plan.id };
  }

  updateTrainingPlan(principalId: string, id: string, input: unknown): void {
    if (!this.repository.updateTrainingPlan(principalId, this.parseTrainingPlan(input, id), new Date(this.now()).toISOString())) {
      throw new GymDomainError('training plan not found', 404);
    }
  }

  deleteTrainingPlan(principalId: string, id: string): void {
    if (!this.repository.deleteTrainingPlan(principalId, id)) throw new GymDomainError('training plan not found', 404);
  }

  getWeeklyGoal(principalId: string): { weeklySessions: number } {
    return { weeklySessions: this.repository.getWeeklyGoal(principalId) };
  }

  setWeeklyGoal(principalId: string, input: unknown): { weeklySessions: number } {
    const weeklySessions = isRecord(input) ? input.weeklySessions : undefined;
    if (typeof weeklySessions !== 'number' || !Number.isInteger(weeklySessions) || weeklySessions < 1 || weeklySessions > 14) {
      throw new GymDomainError('weeklySessions must be an integer between 1 and 14', 400);
    }
    this.repository.setWeeklyGoal(principalId, weeklySessions, new Date(this.now()).toISOString());
    return { weeklySessions };
  }

  issueRecoveryCode(principalId: string): { recoveryCode: string; oneTimeDisplay: true } {
    const recoveryCode = randomBytes(32).toString('base64url');
    this.repository.setRecoveryToken(principalId, hashToken(recoveryCode), new Date(this.now()).toISOString());
    return { recoveryCode, oneTimeDisplay: true };
  }

  recoverProfile(input: unknown, rateLimitKey: string): { principalId: string; token: string; maxAgeSeconds: number } {
    this.enforceRateLimit(this.recoveryAttempts, rateLimitKey, 5, 5 * 60_000);
    const recoveryCode = isRecord(input) ? input.recoveryCode : undefined;
    if (typeof recoveryCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(recoveryCode)) {
      throw new GymDomainError('recovery code is invalid or has already been used', 401);
    }
    const token = this.makeToken();
    const timestamp = this.now();
    const principalId = this.repository.recoverPrincipal(
      hashToken(recoveryCode),
      hashToken(token),
      new Date(timestamp).toISOString(),
      new Date(timestamp + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
    );
    if (!principalId) throw new GymDomainError('recovery code is invalid or has already been used', 401);
    return { principalId, token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
  }

  deletePersonalData(principalId: string): void {
    this.repository.deletePersonalData(principalId);
  }

  private saveLocalCredentials(principalId: string, email: string, passwordHash: string, nowIso: string): void {
    try {
      this.repository.createLocalCredentials(principalId, email, passwordHash, nowIso);
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        throw new GymDomainError('an account with this email already exists', 409);
      }
      throw error;
    }
  }

  private parseBookingInput(input: unknown): { startMs: number; durationMinutes: number; title: string } {
    if (!isRecord(input) || !isDate(input.startsAt) || typeof input.durationMinutes !== 'number' ||
        !RESERVATION_DURATIONS.has(input.durationMinutes) ||
        (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 80))) {
      throw new GymDomainError('booking needs a valid start time, duration and optional short title', 400);
    }
    return {
      startMs: Date.parse(input.startsAt),
      durationMinutes: input.durationMinutes,
      title: typeof input.title === 'string' ? input.title.trim() : '',
    };
  }

  private parseTrainingPlan(input: unknown, id: string): TrainingPlanRecord {
    if (!isRecord(input) || typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 80 ||
        (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 500)) ||
        !Array.isArray(input.exercises) || input.exercises.length < 1 || input.exercises.length > 30) {
      throw new GymDomainError('training plan needs a name and at least one exercise', 400);
    }
    const exercises = input.exercises.map((exercise) => {
      if (!isRecord(exercise) || typeof exercise.name !== 'string' || exercise.name.trim().length < 1 || exercise.name.length > 80) {
        throw new GymDomainError('training plan exercises need a name', 400);
      }
      const targetSets = exercise.targetSets === undefined ? undefined : Number(exercise.targetSets);
      const targetReps = exercise.targetReps === undefined ? undefined : Number(exercise.targetReps);
      const targetWeightKg = exercise.targetWeightKg === undefined ? undefined : Number(exercise.targetWeightKg);
      if (targetSets !== undefined && (!Number.isInteger(targetSets) || targetSets < 1 || targetSets > 20)) {
        throw new GymDomainError('training plan sets must be between 1 and 20', 400);
      }
      if (targetReps !== undefined && (!Number.isInteger(targetReps) || targetReps < 1 || targetReps > 100)) {
        throw new GymDomainError('training plan repetitions must be between 1 and 100', 400);
      }
      if (targetWeightKg !== undefined && (!Number.isFinite(targetWeightKg) || targetWeightKg < 0 || targetWeightKg > 500)) {
        throw new GymDomainError('training plan weights must be between 0 and 500', 400);
      }
      return { name: exercise.name.trim(), targetSets, targetReps, targetWeightKg };
    });
    return { id, name: input.name.trim(), notes: typeof input.notes === 'string' ? input.notes.trim() : '', exercises };
  }

  private enforceRateLimit(store: Map<string, { count: number; resetsAt: number }>, key: string, maxAttempts: number, windowMs: number): void {
    const timestamp = this.now();
    const attempt = store.get(key);
    if (!attempt || attempt.resetsAt <= timestamp) {
      store.set(key, { count: 1, resetsAt: timestamp + windowMs });
      return;
    }
    attempt.count += 1;
    if (attempt.count > maxAttempts) throw new GymDomainError('too many attempts; try again later', 429);
  }
}
