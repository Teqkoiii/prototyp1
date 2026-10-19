import { ArrowRight, Check, Clock3, LogIn, LogOut, Users } from 'lucide-react';
import type { GymBooking, GymSession, OccupancySnapshot, WorkoutLog } from '../../services/gymRepository';
import { calculateWorkoutVolume, formatDateTime, formatTime, getThisWeekWorkouts } from './format';
import { InlineNotice, PageHeading, SectionTitle, type GymPage } from './components';

export function Dashboard({
  session,
  occupancy,
  bookings,
  workouts,
  online,
  busy,
  error,
  onPresence,
  onNavigate,
}: {
  session: GymSession | null;
  occupancy: OccupancySnapshot | null;
  bookings: GymBooking[];
  workouts: WorkoutLog[];
  online: boolean;
  busy: boolean;
  error: string | null;
  onPresence: (present: boolean) => void;
  onNavigate: (page: GymPage) => void;
}) {
  const checkedIn = Boolean(session?.checkedInAt);
  const nextBooking = bookings.find((booking) => Date.parse(booking.startsAt) > Date.now());
  const weekWorkouts = getThisWeekWorkouts(workouts);
  const weeklyVolume = calculateWorkoutVolume(weekWorkouts);

  return (
    <>
      <PageHeading eyebrow="DHBW GYM HUB" title="Dein Gym, auf einen Blick" description="Belegung, Trainingsplanung und dein persönlicher Fortschritt." />

      {error && <InlineNotice tone="error">{error}</InlineNotice>}

      <section className="dashboard-feature-grid" aria-label="Aktuelle Gym-Informationen">
        <article className="surface occupancy-panel">
          <div className="panel-topline"><span className="icon-badge"><Users size={18} aria-hidden="true" /></span><span className={`connection-state ${online ? 'is-online' : ''}`}><span aria-hidden="true" />{online ? 'Backend verbunden' : 'Keine Verbindung'}</span></div>
          <p className="panel-label">Aktuell eingecheckt</p>
          {online && occupancy ? <p className="occupancy-number" aria-live="polite">{occupancy.count}<span> Personen</span></p> : <p className="occupancy-unavailable">{online ? 'Wird geladen …' : 'Gerade nicht verfügbar'}</p>}
          <p className="muted-copy">{occupancy ? `Aktualisiert ${formatTime(occupancy.refreshedAt)} · manuelle Meldungen` : 'Die Zahl stammt aus Check-ins in dieser App.'}</p>
          <div className="source-note">Nicht mit dem DHBW-Türsystem verbunden</div>
        </article>

        <article className={`surface presence-panel ${checkedIn ? 'is-present' : ''}`}>
          <div className="panel-topline"><span className="icon-badge">{checkedIn ? <Check size={18} aria-hidden="true" /> : <Clock3 size={18} aria-hidden="true" />}</span><span className="panel-label">Dein Status</span></div>
          <h2>{checkedIn ? 'Du bist eingecheckt' : 'Noch nicht eingecheckt'}</h2>
          <p className="muted-copy">{checkedIn && session?.checkedInAt ? `Seit ${formatTime(session.checkedInAt)} · endet automatisch nach ${session.maxCheckInHours} Stunden` : 'Mit einem Tipp meldest du dich in der gemeinsamen Belegung an.'}</p>
          <button type="button" className={`button ${checkedIn ? 'button-secondary' : 'button-primary'} presence-button`} disabled={!online || busy} onClick={() => onPresence(!checkedIn)}>
            {checkedIn ? <><LogOut size={17} aria-hidden="true" />Ich gehe</> : <><LogIn size={17} aria-hidden="true" />Ich bin drin</>}
          </button>
          {!online && <p className="field-hint">Check-in ist verfügbar, sobald die Verbindung wiederhergestellt ist.</p>}
        </article>
      </section>

      <section className="dashboard-secondary-grid" aria-label="Deine nächsten Aktivitäten">
        <article className="surface compact-panel">
          <SectionTitle title="Nächste Trainingseinheit" action={<button className="text-action" onClick={() => onNavigate('calendar')}>Kalender <ArrowRight size={15} aria-hidden="true" /></button>} />
          {nextBooking ? <div className="next-booking"><span className="date-marker">{new Date(nextBooking.startsAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</span><div><strong>{nextBooking.title || 'Training im Gym'}</strong><p>{formatDateTime(nextBooking.startsAt)} · bis {formatTime(nextBooking.endsAt)}</p></div></div> : <p className="muted-copy">Noch nichts geplant. Reserviere dir eine Trainingszeit.</p>}
        </article>
        <article className="surface compact-panel progress-glance">
          <SectionTitle title="Diese Woche" action={<button className="text-action" onClick={() => onNavigate('progress')}>Fortschritt <ArrowRight size={15} aria-hidden="true" /></button>} />
          <div className="glance-stats"><div><strong>{weekWorkouts.length}</strong><span>Einheiten</span></div><div><strong>{Math.round(weeklyVolume).toLocaleString('de-DE')}<small> kg</small></strong><span>Trainingsvolumen</span></div></div>
        </article>
      </section>
    </>
  );
}
