import express, { type NextFunction, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { GymAppRepository } from './gymAppRepository';
import { GymAppService, GymDomainError } from './gymAppService';

const COOKIE_NAME = 'gym_app_session';

interface GymApiOptions {
  secureCookies?: boolean;
  allowedOrigins?: string[];
  maxCheckInHours?: number;
  now?: () => number;
  makeToken?: () => string;
}

interface GymSessionRequest extends Request {
  principalId?: string;
}

function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return /^[a-f0-9]{64}$/.test(value) ? value : undefined;
  }
  return undefined;
}

function setSessionCookie(response: Response, token: string, maxAgeSeconds: number, secure: boolean, crossOriginCookies: boolean): void {
  const sameSite = crossOriginCookies ? 'None' : 'Strict';
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(response: Response, secure: boolean, crossOriginCookies: boolean): void {
  const sameSite = crossOriginCookies ? 'None' : 'Strict';
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secure ? '; Secure' : ''}`);
}

function asyncRoute(handler: (request: GymSessionRequest, response: Response) => Promise<void>) {
  return (request: GymSessionRequest, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };
}

export function createGymAppApi(database: DatabaseSync, options: GymApiOptions = {}) {
  const secureCookies = options.secureCookies ?? false;
  const allowedOrigins = new Set(options.allowedOrigins ?? []);
  const crossOriginCookies = allowedOrigins.size > 0;
  if (crossOriginCookies && !secureCookies) throw new Error('Cross-origin app cookies require secureCookies');
  const service = new GymAppService(new GymAppRepository(database), {
    maxCheckInHours: options.maxCheckInHours ?? 8,
    now: options.now,
    makeToken: options.makeToken,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12kb', type: 'application/json' }));
  app.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use((request, response, next) => {
    const origin = request.get('Origin');
    let sameOrigin = false;
    if (origin) {
      try { sameOrigin = new URL(origin).host === request.get('host'); } catch { sameOrigin = false; }
    }
    const allowed = !origin || sameOrigin || allowedOrigins.has(origin);
    if (!allowed) {
      response.status(403).json({ error: 'origin is not allowed' });
      return;
    }
    if (origin && !sameOrigin && allowedOrigins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      if (!origin || (sameOrigin || allowedOrigins.has(origin))) {
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.status(204).end();
      } else {
        response.status(403).end();
      }
      return;
    }
    next();
  });

  const requireSession = (request: GymSessionRequest, response: Response, next: NextFunction) => {
    const principalId = service.resolvePrincipal(getCookie(request, COOKIE_NAME));
    if (!principalId) {
      response.status(401).json({ error: 'app session required' });
      return;
    }
    request.principalId = principalId;
    next();
  };

  app.get('/api/gym/session', (request, response) => {
    const opened = service.openSession(getCookie(request, COOKIE_NAME));
    setSessionCookie(response, opened.token, opened.maxAgeSeconds, secureCookies, crossOriginCookies);
    response.json(service.getSession(opened.principalId));
  });

  app.post('/api/gym/register', asyncRoute(async (request, response) => {
    const opened = await service.register(getCookie(request, COOKIE_NAME), request.body);
    setSessionCookie(response, opened.token, opened.maxAgeSeconds, secureCookies, crossOriginCookies);
    response.status(201).json(service.getSession(opened.principalId));
  }));

  app.post('/api/gym/login', asyncRoute(async (request, response) => {
    const opened = await service.login(request.body, request.ip || 'unknown');
    setSessionCookie(response, opened.token, opened.maxAgeSeconds, secureCookies, crossOriginCookies);
    response.json(service.getSession(opened.principalId));
  }));

  app.post('/api/gym/logout', (request, response) => {
    service.logout(getCookie(request, COOKIE_NAME));
    clearSessionCookie(response, secureCookies, crossOriginCookies);
    response.status(204).end();
  });

  app.get('/api/gym/occupancy', (request, response) => response.json(service.getOccupancy(request.query.range)));

  app.post('/api/gym/check-in', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.checkIn(request.principalId!));
  });

  app.post('/api/gym/check-out', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.checkOut(request.principalId!));
  });

  app.get('/api/gym/availability', (request, response) => {
    response.json(service.getAvailability(request.query.startAt, Number(request.query.durationMinutes)));
  });

  app.get('/api/gym/bookings', (request, response) => {
    response.json(service.listBookingSlots(request.query.from, request.query.to));
  });

  app.get('/api/gym/my/bookings', requireSession, (request: GymSessionRequest, response) => {
    response.json({ bookings: service.listMyBookings(request.principalId!) });
  });

  app.post('/api/gym/bookings', requireSession, (request: GymSessionRequest, response) => {
    const result = service.createBooking(request.principalId!, request.body);
    response.status(201).json({ booking: result.booking, ...result.availability });
  });

  app.put('/api/gym/my/bookings/:id', requireSession, (request: GymSessionRequest, response) => {
    response.json({ booking: service.updateBooking(request.principalId!, request.params.id ?? '', request.body) });
  });

  app.delete('/api/gym/my/bookings/:id', requireSession, (request: GymSessionRequest, response) => {
    service.cancelBooking(request.principalId!, request.params.id ?? '');
    response.status(204).end();
  });

  app.get('/api/gym/visits', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.listVisits(request.principalId!, request.query.from, request.query.to));
  });

  app.get('/api/gym/workouts', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.listWorkouts(request.principalId!));
  });

  app.post('/api/gym/workouts', requireSession, (request: GymSessionRequest, response) => {
    response.status(201).json(service.createWorkout(request.principalId!, request.body));
  });

  app.delete('/api/gym/workouts/:id', requireSession, (request: GymSessionRequest, response) => {
    service.deleteWorkout(request.principalId!, request.params.id ?? '');
    response.status(204).end();
  });

  app.get('/api/gym/plans', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.listTrainingPlans(request.principalId!));
  });

  app.post('/api/gym/plans', requireSession, (request: GymSessionRequest, response) => {
    response.status(201).json(service.createTrainingPlan(request.principalId!, request.body));
  });

  app.put('/api/gym/plans/:id', requireSession, (request: GymSessionRequest, response) => {
    service.updateTrainingPlan(request.principalId!, request.params.id ?? '', request.body);
    response.status(204).end();
  });

  app.delete('/api/gym/plans/:id', requireSession, (request: GymSessionRequest, response) => {
    service.deleteTrainingPlan(request.principalId!, request.params.id ?? '');
    response.status(204).end();
  });

  app.get('/api/gym/goals', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.getWeeklyGoal(request.principalId!));
  });

  app.put('/api/gym/goals', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.setWeeklyGoal(request.principalId!, request.body));
  });

  app.post('/api/gym/profile/recovery-code', requireSession, (request: GymSessionRequest, response) => {
    response.json(service.issueRecoveryCode(request.principalId!));
  });

  app.post('/api/gym/profile/recover', (request, response) => {
    const recovered = service.recoverProfile(request.body, request.ip || 'unknown');
    setSessionCookie(response, recovered.token, recovered.maxAgeSeconds, secureCookies, crossOriginCookies);
    response.json({ recovered: true, identity: service.getSession(recovered.principalId).identity });
  });

  app.delete('/api/gym/my/data', requireSession, (request: GymSessionRequest, response) => {
    service.deletePersonalData(request.principalId!);
    response.status(204).end();
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof GymDomainError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: 'invalid JSON body' });
      return;
    }
    response.status(500).json({ error: 'internal server error' });
  });

  return app;
}
