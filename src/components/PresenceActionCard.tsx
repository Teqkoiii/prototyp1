import { Check, LogIn, LogOut } from 'lucide-react';
import type { PresenceState } from '../services/presenceState';

interface PresenceActionCardProps {
  language: 'de' | 'en';
  presence: PresenceState;
  onSetPresence: (isPresent: boolean) => void;
}

export function PresenceActionCard({ language, presence, onSetPresence }: PresenceActionCardProps) {
  const isDe = language === 'de';

  return (
    <section
      aria-labelledby="presence-action-title"
      className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-lg sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="presence-action-title" className="text-lg font-bold">
            {isDe ? 'Mein Check-in' : 'My check-in'}
          </h2>
          <p className="mt-1 text-sm text-slate-300" aria-live="polite">
            {presence.isPresent
              ? (isDe ? 'Auf diesem Gerät als anwesend markiert.' : 'Marked as present on this device.')
              : (isDe ? 'Auf diesem Gerät derzeit nicht eingecheckt.' : 'Not checked in on this device.')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
          {isDe ? 'Demo · nur dieses Gerät' : 'Demo · this device only'}
        </span>
      </div>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-400">
        {isDe
          ? 'Diese Markierung ist noch nicht mit der DHBW oder der campusweiten Personenzahl verbunden.'
          : 'This mark is not connected to DHBW or the campus-wide occupancy count yet.'}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSetPresence(true)}
          disabled={presence.isPresent}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-default disabled:bg-emerald-900/60 disabled:text-emerald-100"
        >
          {presence.isPresent ? <Check className="h-4 w-4" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          {isDe ? 'Ich bin drin' : "I'm in"}
        </button>
        <button
          type="button"
          onClick={() => onSetPresence(false)}
          disabled={!presence.isPresent}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-default disabled:opacity-55"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {isDe ? 'Ich gehe' : "I'm leaving"}
        </button>
      </div>
    </section>
  );
}
