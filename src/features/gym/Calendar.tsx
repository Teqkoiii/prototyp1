import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Trash2 } from 'lucide-react';
import type { GymAvailability, GymBooking, GymVisit, SharedBookingSlot } from '../../services/gymRepository';
import { formatDate, formatDateTime, formatTime } from './format';
import { EmptyState, Field, InlineNotice, PageHeading, SectionTitle } from './components';

function tomorrowInputValue(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function Calendar({
  bookings,
  sharedSlots,
  visits,
  availability,
  online,
  busy,
  error,
  onCreateBooking,
  onDeleteBooking,
  onCheckAvailability,
}: {
  bookings: GymBooking[];
  sharedSlots: SharedBookingSlot[];
  visits: GymVisit[];
  availability: GymAvailability | null;
  online: boolean;
  busy: boolean;
  error: string | null;
  onCreateBooking: (input: { startsAt: string; durationMinutes: number; title?: string }) => void;
  onDeleteBooking: (id: string) => void;
  onCheckAvailability: (startAt: string, duration: number) => void;
}) {
  const [startsAt, setStartsAt] = useState(tomorrowInputValue);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState('');
  const startsAtIso = localInputToIso(startsAt);
  const upcoming = useMemo(() => bookings.filter((booking) => Date.parse(booking.endsAt) >= Date.now()), [bookings]);
  const history = useMemo(() => visits.filter((visit) => visit.checkedOutAt !== null && Date.parse(visit.checkedInAt) < Date.now()), [visits]);

  useEffect(() => {
    if (!startsAtIso || !online) return;
    const timer = window.setTimeout(() => onCheckAvailability(startsAtIso, duration), 250);
    return () => window.clearTimeout(timer);
  }, [startsAtIso, duration, online, onCheckAvailability]);

  const create = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!startsAtIso) return;
    onCreateBooking({ startsAt: startsAtIso, durationMinutes: duration, title: title.trim() });
  };

  return (
    <>
      <PageHeading eyebrow="PLANUNG" title="Kalender" description="Plane deine Trainingszeit und behalte vergangene Besuche im Blick." />
      <div className="calendar-grid">
        <section className="surface calendar-booking-form">
          <SectionTitle title="Trainingszeit reservieren" />
          <form onSubmit={create} className="stack-form">
            <Field label="Datum und Uhrzeit"><input className="text-input" type="datetime-local" value={startsAt} min={localDateTimeValue(new Date())} onChange={(event) => setStartsAt(event.target.value)} required /></Field>
            <Field label="Dauer"><select className="text-input" value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={30}>30 Minuten</option><option value={60}>1 Stunde</option><option value={90}>1,5 Stunden</option><option value={120}>2 Stunden</option></select></Field>
            <Field label="Titel (optional)"><input className="text-input" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z. B. Oberkörper" /></Field>
            {availability && <InlineNotice>{availability.reserved === 0 ? 'Für diese Zeit gibt es noch keine geteilten Reservierungen.' : `${availability.reserved} Reservierung${availability.reserved === 1 ? '' : 'en'} in diesem Zeitraum. Reservierungen sind jederzeit möglich, es gibt keine Teilnehmergrenze.`}</InlineNotice>}
            {error && <InlineNotice tone="error">{error}</InlineNotice>}
            <button className="button button-primary full-width" type="submit" disabled={!online || busy}><CalendarClock size={17} aria-hidden="true" />Zeit reservieren</button>
            <p className="field-hint">App-Reservierung · nicht mit dem DHBW-Türsystem oder einer Zutrittsberechtigung verbunden.</p>
          </form>
        </section>

        <section className="surface calendar-list-panel">
          <SectionTitle title="Deine nächsten Termine" />
          {upcoming.length ? <ul className="event-list">{upcoming.map((booking) => <li key={booking.id} className="event-row"><span className="event-date-icon"><CalendarClock size={17} aria-hidden="true" /></span><div className="event-content"><strong>{booking.title || 'Training im Gym'}</strong><span>{formatDateTime(booking.startsAt)} · {formatTime(booking.endsAt)}</span></div><button type="button" className="icon-button danger-hover" aria-label={`Reservierung ${booking.title || 'Training'} stornieren`} disabled={busy} onClick={() => { if (window.confirm('Diese Reservierung wirklich stornieren?')) onDeleteBooking(booking.id); }}><Trash2 size={17} aria-hidden="true" /></button></li>)}</ul> : <EmptyState title="Noch keine Termine" description="Deine Reservierungen erscheinen hier." />}
        </section>
      </div>

      <div className="calendar-grid calendar-lower-grid">
        <section className="surface calendar-list-panel">
          <SectionTitle title="Gemeinsame Reservierungen" />
          <p className="muted-copy section-intro">Es werden nur Zeitfenster und Anzahl angezeigt, keine Namen.</p>
          {sharedSlots.length ? <ul className="event-list">{sharedSlots.slice(0, 10).map((slot) => <li key={`${slot.startsAt}-${slot.endsAt}`} className="event-row"><span className="event-date-icon"><Clock3 size={17} aria-hidden="true" /></span><div className="event-content"><strong>{formatDateTime(slot.startsAt)}</strong><span>{slot.reserved} Reservierung{slot.reserved === 1 ? '' : 'en'}</span></div></li>)}</ul> : <p className="muted-copy">Im gewählten Zeitraum gibt es noch keine Reservierungen.</p>}
        </section>
        <section className="surface calendar-list-panel">
          <SectionTitle title="Vergangene Gym-Besuche" />
          <p className="muted-copy section-intro">Besuche werden 90 Tage gespeichert.</p>
          {history.length ? <ul className="event-list">{history.slice(0, 8).map((visit) => <li key={visit.id} className="event-row"><span className="event-date-icon"><Clock3 size={17} aria-hidden="true" /></span><div className="event-content"><strong>{formatDate(visit.checkedInAt)}</strong><span>{formatTime(visit.checkedInAt)}{visit.checkedOutAt ? ` – ${formatTime(visit.checkedOutAt)}` : ' · Check-out noch offen'}</span></div></li>)}</ul> : <p className="muted-copy">Nach deinem ersten Check-in findest du deine Besuche hier.</p>}
        </section>
      </div>
    </>
  );
}
