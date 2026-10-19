import { useCallback, useEffect, useState } from 'react';
import { GymApiError, gymRepository, type GymAvailability, type GymBooking, type GymSession, type OccupancySnapshot, type SharedBookingSlot, type WorkoutLog, type GymVisit } from '../../services/gymRepository';
import { AppFrame, InlineNotice, type GymPage } from './components';
import { Dashboard } from './Dashboard';
import { Calendar } from './Calendar';
import { Training } from './Training';
import { Progress } from './Progress';
import { Profile } from './Profile';
import './gym.css';

export function GymApp() {
  const [page, setPage] = useState<GymPage>('dashboard');
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [session, setSession] = useState<GymSession | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancySnapshot | null>(null);
  const [bookings, setBookings] = useState<GymBooking[]>([]);
  const [sharedSlots, setSharedSlots] = useState<SharedBookingSlot[]>([]);
  const [visits, setVisits] = useState<GymVisit[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const [availability, setAvailability] = useState<GymAvailability | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const currentSession = await gymRepository.getSession();
      const [currentOccupancy, shared, mine, currentVisits, currentWorkouts, currentGoal] = await Promise.all([
        gymRepository.getOccupancy(),
        gymRepository.getBookings(),
        gymRepository.getMyBookings(),
        gymRepository.getVisits(),
        gymRepository.getWorkouts(),
        gymRepository.getWeeklyGoal(),
      ]);
      setSession(currentSession);
      setOccupancy(currentOccupancy);
      setSharedSlots(shared.slots);
      setBookings(mine);
      setVisits(currentVisits);
      setWorkouts(currentWorkouts);
      setWeeklyGoal(currentGoal);
      setOnline(true);
      setError(null);
    } catch (caught) {
      setOnline(false);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshOccupancy = useCallback(async () => {
    try {
      const [current, currentSession, shared] = await Promise.all([
        gymRepository.getOccupancy(),
        gymRepository.getSession(),
        gymRepository.getBookings(),
      ]);
      setOccupancy(current);
      setSession(currentSession);
      setSharedSlots(shared.slots);
      setOnline(true);
    } catch (caught) {
      setOnline(false);
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void refreshAll();
    const timer = window.setInterval(() => void refreshOccupancy(), 15_000);
    const onFocus = () => { if (document.visibilityState === 'visible') void refreshAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshAll, refreshOccupancy]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const runMutation = useCallback(async (operation: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refreshAll();
      setToast(successMessage);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [refreshAll]);

  const handlePresence = useCallback((present: boolean) => runMutation(
    () => gymRepository.setCheckedIn(present),
    present ? 'Du bist eingecheckt.' : 'Du wurdest ausgecheckt.',
  ), [runMutation]);

  const handleCreateBooking = useCallback((input: { startsAt: string; durationMinutes: number; title?: string }) => runMutation(
    async () => { await gymRepository.createBooking(input); },
    'Deine Trainingszeit wurde reserviert.',
  ), [runMutation]);

  const handleDeleteBooking = useCallback((id: string) => runMutation(
    () => gymRepository.deleteBooking(id),
    'Reservierung storniert.',
  ), [runMutation]);

  const handleCreateWorkout = useCallback((input: Omit<WorkoutLog, 'id'>) => runMutation(
    () => gymRepository.createWorkout(input),
    'Training gespeichert.',
  ), [runMutation]);

  const handleDeleteWorkout = useCallback((id: string) => runMutation(
    () => gymRepository.deleteWorkout(id),
    'Training gelöscht.',
  ), [runMutation]);

  const handleGoal = useCallback((value: number) => runMutation(
    async () => { await gymRepository.setWeeklyGoal(value); },
    'Wochenziel aktualisiert.',
  ), [runMutation]);

  const handleAvailability = useCallback(async (startAt: string, duration: number) => {
    try {
      setAvailability(await gymRepository.getAvailability(startAt, duration));
    } catch {
      setAvailability(null);
    }
  }, []);

  const handleIssueRecoveryCode = useCallback(async () => {
    setError(null);
    try {
      const code = await gymRepository.issueRecoveryCode();
      await refreshAll();
      setToast('Wiederherstellungscode erstellt. Bewahre ihn sicher auf.');
      return code;
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    }
  }, [refreshAll]);

  const handleRecover = useCallback((code: string) => runMutation(
    () => gymRepository.recoverProfile(code),
    'Profil wiederhergestellt. Deine Serverdaten sind wieder verfügbar.',
  ), [runMutation]);

  const handleDeleteData = useCallback(() => {
    if (!window.confirm('Alle deine Trainingsdaten, Reservierungen, Ziele und die Besuchshistorie wirklich löschen?')) return;
    void runMutation(async () => {
      await gymRepository.deletePersonalData();
      setPage('dashboard');
    }, 'Deine persönlichen App-Daten wurden gelöscht.');
  }, [runMutation]);

  if (loading) {
    return <div className="app-loading" role="status"><span className="loading-mark" /><p>Gym Hub wird verbunden …</p></div>;
  }

  return (
    <AppFrame page={page} onNavigate={setPage}>
      {!online && <InlineNotice tone="warning">Der Gym-Server ist nicht erreichbar. Angezeigte Daten können veraltet sein; Check-in, Reservierungen und Speichern sind derzeit deaktiviert.</InlineNotice>}
      {page === 'dashboard' && <Dashboard session={session} occupancy={occupancy} bookings={bookings} workouts={workouts} online={online} busy={busy} error={error} onPresence={handlePresence} onNavigate={setPage} />}
      {page === 'calendar' && <Calendar bookings={bookings} sharedSlots={sharedSlots} visits={visits} availability={availability} online={online} busy={busy} error={error} onCreateBooking={handleCreateBooking} onDeleteBooking={handleDeleteBooking} onCheckAvailability={handleAvailability} />}
      {page === 'training' && <Training workouts={workouts} busy={busy} error={error} online={online} onCreate={handleCreateWorkout} onDelete={handleDeleteWorkout} />}
      {page === 'progress' && <Progress workouts={workouts} weeklyGoal={weeklyGoal} busy={busy} error={error} online={online} onUpdateGoal={handleGoal} />}
      {page === 'profile' && <Profile session={session} online={online} busy={busy} error={error} onCreateRecoveryCode={handleIssueRecoveryCode} onRecover={handleRecover} onDeleteData={handleDeleteData} />}
      <footer className="gym-footer"><span>Manuelle App-Check-ins · keine DHBW-Scannerverbindung</span><span>Belegung aktualisiert automatisch alle 15 Sekunden</span></footer>
      <div className="toast-region" aria-live="polite" aria-atomic="true">{toast && <div className="toast-message">{toast}</div>}</div>
    </AppFrame>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof GymApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 409) return 'Diese Zeit hast du bereits geplant.';
    if (error.status === 401) return 'Deine Sitzung ist abgelaufen. Bitte lade die App neu oder stelle dein Profil wieder her.';
    if (error.status === 429) return 'Zu viele Wiederherstellungsversuche. Bitte warte kurz und versuche es erneut.';
    if (error.status === 400) return 'Bitte prüfe die eingegebenen Daten.';
  }
  return 'Das hat gerade nicht funktioniert. Bitte versuche es noch einmal.';
}
