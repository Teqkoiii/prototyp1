import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { WorkoutLog } from '../../services/gymRepository';
import { calculateWorkoutVolume, formatDate } from './format';
import { EmptyState, Field, InlineNotice, PageHeading, SectionTitle } from './components';

interface ExerciseDraft { name: string; sets: number; reps: number; weightKg: number; }
const newExercise = (): ExerciseDraft => ({ name: '', sets: 3, reps: 8, weightKg: 0 });
const todayDateValue = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export function Training({ workouts, busy, error, online, onCreate, onDelete }: {
  workouts: WorkoutLog[];
  busy: boolean;
  error: string | null;
  online: boolean;
  onCreate: (input: Omit<WorkoutLog, 'id'>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState('Krafttraining');
  const [date, setDate] = useState(todayDateValue);
  const [exercises, setExercises] = useState<ExerciseDraft[]>([newExercise()]);

  const updateExercise = (index: number, patch: Partial<ExerciseDraft>) => {
    setExercises((current) => current.map((exercise, itemIndex) => itemIndex === index ? { ...exercise, ...patch } : exercise));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const occurredAt = new Date(`${date}T12:00:00`).toISOString();
    onCreate({
      title: title.trim(),
      occurredAt,
      exercises: exercises.map((exercise) => ({
        name: exercise.name.trim(),
        sets: Array.from({ length: exercise.sets }, () => ({ reps: exercise.reps, weightKg: exercise.weightKg })),
      })),
    });
  };

  return (
    <>
      <PageHeading eyebrow="TRAININGSPROTOKOLL" title="Training" description="Halte Übungen, Sätze, Wiederholungen und Gewichte fest." />
      <div className="training-layout">
        <section className="surface training-form-panel">
          <SectionTitle title="Einheit eintragen" />
          <form className="stack-form" onSubmit={submit}>
            <div className="form-row"><Field label="Name der Einheit"><input className="text-input" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} required /></Field><Field label="Datum"><input className="text-input" type="date" value={date} max={todayDateValue()} onChange={(event) => setDate(event.target.value)} required /></Field></div>
            <div className="form-section-heading"><h3>Übungen</h3><button type="button" className="text-action" onClick={() => setExercises((current) => [...current, newExercise()])}><Plus size={15} aria-hidden="true" />Übung hinzufügen</button></div>
            <div className="exercise-drafts">{exercises.map((exercise, index) => <fieldset className="exercise-draft" key={index}><legend className="sr-only">Übung {index + 1}</legend><div className="exercise-draft-header"><span>Übung {index + 1}</span>{exercises.length > 1 && <button type="button" className="icon-button danger-hover" aria-label={`Übung ${index + 1} entfernen`} onClick={() => setExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} aria-hidden="true" /></button>}</div><Field label="Übung"><input className="text-input" value={exercise.name} maxLength={80} onChange={(event) => updateExercise(index, { name: event.target.value })} placeholder="z. B. Kniebeugen" required /></Field><div className="form-row form-row-3"><Field label="Sätze"><input className="text-input" type="number" min={1} max={20} value={exercise.sets} onChange={(event) => updateExercise(index, { sets: Number(event.target.value) })} required /></Field><Field label="Wiederholungen je Satz"><input className="text-input" type="number" min={1} max={100} value={exercise.reps} onChange={(event) => updateExercise(index, { reps: Number(event.target.value) })} required /></Field><Field label="Gewicht (kg)"><input className="text-input" type="number" min={0} max={500} step="0.5" value={exercise.weightKg} onChange={(event) => updateExercise(index, { weightKg: Number(event.target.value) })} required /></Field></div></fieldset>)}</div>
            {error && <InlineNotice tone="error">{error}</InlineNotice>}
            <button className="button button-primary full-width" type="submit" disabled={!online || busy}><Save size={17} aria-hidden="true" />Training speichern</button>
            {!online && <p className="field-hint">Deine Daten werden auf dem Gym-Server gespeichert. Stelle die Verbindung wieder her, um Einheiten einzutragen.</p>}
          </form>
        </section>

        <section className="surface training-history-panel">
          <SectionTitle title="Letzte Einheiten" />
          {workouts.length ? <ul className="workout-list">{workouts.map((workout) => <li key={workout.id} className="workout-item"><div className="workout-item-heading"><div><strong>{workout.title}</strong><span>{formatDate(workout.occurredAt)}</span></div><button type="button" className="icon-button danger-hover" aria-label={`${workout.title} löschen`} disabled={busy} onClick={() => onDelete(workout.id)}><Trash2 size={16} aria-hidden="true" /></button></div><ul className="exercise-summary">{workout.exercises.map((exercise, index) => <li key={`${exercise.name}-${index}`}><span>{exercise.name}</span><span>{exercise.sets.length} × {exercise.sets[0]?.reps} · {exercise.sets[0]?.weightKg} kg</span></li>)}</ul><p className="workout-volume">Volumen: {Math.round(calculateWorkoutVolume([workout])).toLocaleString('de-DE')} kg</p></li>)}</ul> : <EmptyState title="Noch keine Einheiten" description="Dein Trainingsprotokoll erscheint hier, sobald du deine erste Einheit speicherst." />}
        </section>
      </div>
    </>
  );
}
