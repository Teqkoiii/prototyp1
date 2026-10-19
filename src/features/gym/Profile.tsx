import { useState } from 'react';
import { Check, Copy, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import type { GymSession } from '../../services/gymRepository';
import { Field, InlineNotice, PageHeading, SectionTitle } from './components';

export function Profile({ session, online, busy, error, onCreateRecoveryCode, onRecover, onDeleteData }: {
  session: GymSession | null;
  online: boolean;
  busy: boolean;
  error: string | null;
  onCreateRecoveryCode: () => Promise<string>;
  onRecover: (code: string) => void;
  onDeleteData: () => void;
}) {
  const [recoveryCode, setRecoveryCode] = useState('');
  const [restoreInput, setRestoreInput] = useState('');
  const [copied, setCopied] = useState(false);

  const createCode = async () => {
    try {
      setRecoveryCode(await onCreateRecoveryCode());
      setCopied(false);
    } catch {
      // The parent displays the API error.
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const submitRecovery = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRecover(restoreInput.trim());
  };

  return (
    <>
      <PageHeading eyebrow="KONTO & DATENSCHUTZ" title="Profil" description="Deine Trainingsdaten und Einstellungen werden serverseitig deinem anonymen Profil zugeordnet." />
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <div className="profile-grid">
        <section className="surface profile-card">
          <span className="icon-badge"><ShieldCheck size={19} aria-hidden="true" /></span>
          <SectionTitle title="Dein App-Profil" />
          <dl className="profile-details"><div><dt>Profil</dt><dd>Anonym · nicht mit DHBW-Konto verbunden</dd></div><div><dt>Speicherung</dt><dd>Backend-Profil auf diesem Server</dd></div><div><dt>Check-in</dt><dd>Manuell gemeldet · automatisches Ende nach {session?.maxCheckInHours ?? 8} Stunden</dd></div><div><dt>Besuchshistorie</dt><dd>90 Tage</dd></div></dl>
          <p className="field-hint">Dein Profil wird über ein zufälliges, geschütztes Sitzungstoken erkannt. Die Profil-ID wird nicht im Browser eingegeben oder über URLs geändert.</p>
        </section>

        <section className="surface profile-card">
          <span className="icon-badge"><KeyRound size={19} aria-hidden="true" /></span>
          <SectionTitle title="Profil wiederherstellen" />
          <p className="muted-copy">Erstelle einen einmaligen Wiederherstellungscode, bevor du Gerät oder Browser wechselst. Der Server speichert nur einen Hash des Codes.</p>
          {!session?.recoveryConfigured && <button type="button" className="button button-secondary" disabled={!online || busy} onClick={() => void createCode()}>Wiederherstellungscode erstellen</button>}
          {session?.recoveryConfigured && !recoveryCode && <InlineNotice tone="success">Ein Code ist eingerichtet. Bewahre deinen angezeigten Code sicher auf. Du kannst einen neuen erzeugen, wenn du den aktuellen verloren hast.</InlineNotice>}
          {recoveryCode && <div className="recovery-code-panel"><p>Dieser Code wird nur jetzt angezeigt. Speichere ihn an einem sicheren Ort. Er ersetzt den zuvor gültigen Code.</p><code>{recoveryCode}</code><button type="button" className="button button-secondary" onClick={() => void copyCode()}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? 'Kopiert' : 'Code kopieren'}</button></div>}
          <form className="stack-form recovery-form" onSubmit={submitRecovery}><Field label="Vorhandenen Code eingeben"><input className="text-input" value={restoreInput} onChange={(event) => setRestoreInput(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Wiederherstellungscode" required /></Field><button type="submit" className="button button-primary" disabled={!online || busy || restoreInput.trim().length < 20}>Profil wiederherstellen</button></form>
          <p className="field-hint">Ein Wiederherstellungscode funktioniert nur einmal. Bei erfolgreicher Wiederherstellung wird die bisherige Sitzung widerrufen.</p>
        </section>

        <section className="surface profile-card privacy-card">
          <span className="icon-badge"><ShieldCheck size={19} aria-hidden="true" /></span>
          <SectionTitle title="Datenschutz" />
          <ul className="privacy-list"><li>Trainings, Ziele und Reservierungen sind nur für dein Profil sichtbar.</li><li>Die gemeinsame Belegung zeigt ausschließlich eine Summe manueller Check-ins.</li><li>Besuche werden nach 90 Tagen automatisch entfernt.</li><li>Du kannst deine persönlichen App-Daten hier löschen.</li></ul>
          <button type="button" className="button button-danger" disabled={!online || busy} onClick={onDeleteData}><Trash2 size={16} aria-hidden="true" />Meine App-Daten löschen</button>
        </section>
      </div>
    </>
  );
}
