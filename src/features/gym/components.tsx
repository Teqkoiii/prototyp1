import type { ReactNode } from 'react';
import { Activity, CalendarDays, ChartNoAxesColumnIncreasing, Dumbbell, House, UserRound } from 'lucide-react';

export type GymPage = 'dashboard' | 'calendar' | 'training' | 'progress' | 'profile';

const navigation: Array<{ id: GymPage; label: string; Icon: typeof House }> = [
  { id: 'dashboard', label: 'Übersicht', Icon: House },
  { id: 'calendar', label: 'Kalender', Icon: CalendarDays },
  { id: 'training', label: 'Training', Icon: Dumbbell },
  { id: 'progress', label: 'Fortschritt', Icon: ChartNoAxesColumnIncreasing },
  { id: 'profile', label: 'Profil', Icon: UserRound },
];

export function AppFrame({ page, onNavigate, children }: {
  page: GymPage;
  onNavigate: (page: GymPage) => void;
  children: ReactNode;
}) {
  return (
    <div className="gym-app">
      <header className="gym-header">
        <button type="button" className="gym-brand" onClick={() => onNavigate('dashboard')} aria-label="DHBW Gym Hub – Übersicht">
          <span className="gym-brand-mark"><Activity size={18} strokeWidth={2.5} aria-hidden="true" /></span>
          <span><strong>Gym Hub</strong><small>DHBW · Fitnessraum</small></span>
        </button>
        <nav className="gym-desktop-nav" aria-label="Hauptnavigation">
          {navigation.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-current={page === id ? 'page' : undefined}
              className={`gym-nav-item ${page === id ? 'is-active' : ''}`} onClick={() => onNavigate(id)}>
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="gym-profile-shortcut" onClick={() => onNavigate('profile')} aria-label="Profil und Datenschutz">
          <UserRound size={18} aria-hidden="true" />
        </button>
      </header>
      <main className="gym-main">{children}</main>
      <nav className="gym-mobile-nav" aria-label="Hauptnavigation">
        {navigation.map(({ id, label, Icon }) => (
          <button key={id} type="button" aria-current={page === id ? 'page' : undefined}
            className={`gym-mobile-nav-item ${page === id ? 'is-active' : ''}`} onClick={() => onNavigate(id)}>
            <Icon size={19} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </div>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-title"><h2>{title}</h2>{action}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Dumbbell size={19} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function InlineNotice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`inline-notice tone-${tone}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="form-field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}
