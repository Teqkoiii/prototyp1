import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { GymAppRepository, type BookingAvailability, type BookingRecord, type WorkoutRecord } from './gymAppRepository';

const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const VISIT_RETENTION_DAYS = 90;
const RESERVATION_DURATIONS = new Set([30, 60, 90, 120]);

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

export class GymAppService {
  private readonly recoveryAttempts = new Map<string, { count: number; resetsAt: number }>();

  constructor(
    private readonly repository: GymAppRepository,
    private readonly options: {
      maxCheckInHours: number;
      reservationCapacity: number | null;
      now?: () => number;
      makeToken?: () => string;
    },
  ) {
    if (!Number.isFinite(options.maxCheckInHours) || options.maxCheckInHours < 1 || options.maxCheckInHours > 24) {
      throw new Error('maxCheckInHours must be between 1 and 24');
    }
    if (options.reservationCapacity !== null && (!Number.isInteger(options.reservationCapacity) || options.reservationCapacity < 1 || options.reservationCapacity > 500)) {
      throw new Error('reservationCapacity must be null or an integer between 1 and 500');
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

  getSession(principalId: string) {
    const timestamp = this.now();
    const checkIn = this.repository.getCheckIn(principalId, new Date(timestamp).toISOString());
    return {
      identity: 'anonymous-app-profile' as const,
      recoveryConfigured: this.repository.hasRecoveryToken(principalId),
      checkedInAt: checkIn?.checkedInAt ?? null,
      checkInExpiresAt: checkIn?.expiresAt ?? null,
      maxCheckInHours: this.options.maxCheckInHours,
      serverTime: new Date(timestamp).toISOString(),
    };
  }

  getOccupancy() {
    const refreshedAt = new Date(this.now()).toISOString();
    this.cleanupExpiredData();
    return {
      count: this.repository.occupancy(refreshedAt),
      refreshedAt,
      source: 'self-reported-manual-check-ins' as const,
      maxCheckInHours: this.options.maxCheckInHours,
    };
  }

  checkIn(principalId: string) {
    const timestamp = this.now();
    const result = this.repository.checkIn(
      principalId,
      new Date(timestamp).toISOString(),
      new Date(timestamp + this.options.maxCheckInHours * 60 * 60 * 1000).toISOString(),
    );
    return { ...result, maxCheckInHours: this.options.maxCheckInHours };
  }

  checkOut(principalId: string) {
    const checkedOutAt = new Date(this.now()).toISOString();
    this.repository.checkOut(principalId, checkedOutAt);
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
    return { startAt: normalizedStart, endAt, ...this.repository.availability(normalizedStart, endAt, this.options.reservationCapacity) };
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
      slots: this.repository.listBookingSlots(from, to, this.options.reservationCapacity),
      capacityConfigured: this.options.reservationCapacity !== null,
    };
  }

  createBooking(principalId: string, input: unknown): { booking: BookingRecord; availability: BookingAvailability } {
    if (!isRecord(input) || !isDate(input.startsAt) || typeof input.durationMinutes !== 'number' ||
        !RESERVATION_DURATIONS.has(input.durationMinutes) ||
        (input.title !== undefined && (typeof input.title !== 'string' || input.title.length > 80))) {
      throw new GymDomainError('booking needs a valid start time, duration and optional short title', 400);
    }
    const startMs = Date.parse(input.startsAt);
    const timestamp = this.now();
    if (startMs < timestamp || startMs > timestamp + 90 * 86400_000) {
      throw new GymDomainError('booking must start within the next 90 days', 400);
    }
    const booking: BookingRecord = {
      id: randomUUID(),
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(startMs + input.durationMinutes * 60_000).toISOString(),
      title: typeof input.title === 'string' ? input.title.trim() : '',
    };
    const availability = this.repository.createBooking(principalId, booking, new Date(timestamp).toISOString(), this.options.reservationCapacity);
    if (!availability) throw new GymDomainError('no places available for this time', 409);
    return { booking, availability };
  }

  listMyBookings(principalId: string) {
    this.cleanupExpiredData();
    return this.repository.listMyBookings(principalId);
  }

  deleteBooking(principalId: string, id: string): void {
    if (!this.repository.deleteBooking(principalId, id)) throw new GymDomainError('reservation not found', 404);
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
    const attempt = this.recoveryAttempts.get(rateLimitKey);
    const timestamp = this.now();
    if (!attempt || attempt.resetsAt <= timestamp) {
      this.recoveryAttempts.set(rateLimitKey, { count: 1, resetsAt: timestamp + 5 * 60_000 });
    } else {
      attempt.count += 1;
      if (attempt.count > 5) throw new GymDomainError('too many recovery attempts; try again later', 429);
    }

    const recoveryCode = isRecord(input) ? input.recoveryCode : undefined;
    if (typeof recoveryCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(recoveryCode)) {
      throw new GymDomainError('recovery code is invalid or has already been used', 401);
    }
    const token = this.makeToken();
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
}
