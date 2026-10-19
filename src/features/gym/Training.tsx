import { useMemo, useState } from 'react';
import { Plus, Save, Trash2, Search, Dumbbell } from 'lucide-react';
import type { WorkoutLog } from '../../services/gymRepository';
import { calculateWorkoutVolume, formatDate } from './format';
import { EmptyState, Field, InlineNotice, PageHeading, SectionTitle } from './components';

interface ExerciseDraft {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
}

interface ExerciseOption {
  name: string;
  category: string;
}

const exerciseLibrary: ExerciseOption[] = [
  { name: 'Brustpresse', category: 'Brust' },
  { name: 'Bankdrücken', category: 'Brust' },
  { name: 'Schrägbankdrücken', category: 'Brust' },
  { name: 'Butterfly', category: 'Brust' },
  { name: 'Kabelzug Brust', category: 'Brust' },
  { name: 'Latzug', category: 'Rücken' },
  { name: 'Rudern sitzend', category: 'Rücken' },
  { name: 'Rudern am Gerät', category: 'Rücken' },
  { name: 'Klimmzüge', category: 'Rücken' },
  { name: 'Hyperextensions', category: 'Rücken' },
  { name: 'Schulterpresse', category: 'Schultern' },
  { name: 'Seitheben', category: 'Schultern' },
  { name: 'Reverse Butterfly', category: 'Schultern' },
  { name: 'Bizepscurls', category: 'Arme' },
  { name: 'Hammercurls', category: 'Arme' },
  { name: 'Trizepsdrücken am Kabel', category: 'Arme' },
  { name: 'Beinstrecker', category: 'Beine' },
  { name: 'Beinbeuger', category: 'Beine' },
  { name: 'Beinpresse', category: 'Beine' },
  { name: 'Kniebeugen', category: 'Beine' },
  { name: 'Ausfallschritte', category: 'Beine' },
  { name: 'Wadenheben', category: 'Beine' },
  { name: 'Adduktorenmaschine', category: 'Beine' },
  { name: 'Abduktorenmaschine', category: 'Beine' },
  { name: 'Bauchmaschine', category: 'Bauch' },
  { name: 'Crunches', category: 'Bauch' },
  { name: 'Plank', category: 'Bauch' },
  { name: 'Laufband', category: 'Cardio' },
  { name: 'Fahrrad-Ergometer', category: 'Cardio' },
  { name: 'Crosstrainer', category: 'Cardio' },
];

const categories = ['Alle', 'Brust', 'Rücken', 'Schultern', 'Arme', 'Beine', 'Bauch', 'Cardio', 'Eigene Übungen'];

const newExercise = (name = ''): ExerciseDraft => ({ name, sets: 3, reps: 8, weightKg: 0 });

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
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [customName, setCustomName] = useState('');

  const lastPerformance = useMemo(() => {
    const result = new Map<string, { reps: number; weightKg: number; sets: number }>();
    const sorted = [...workouts].sort((a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    for (const workout of sorted) {
      for (const exercise of workout.exercises) {
        const key = exercise.name.trim().toLocaleLowerCase('de-DE');
        if (!key || result.has(key) || exercise.sets.length === 0) continue;
        const firstSet = exercise.sets[0];
        result.set(key, {
          reps: firstSet.reps,
          weightKg: firstSet.weightKg,
          sets: exercise.sets.length,
        });
      }
    }
    return result;
  }, [workouts]);

  const filteredExercises = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-DE');
    const addedNames = new Set(
      exercises.map((exercise) => exercise.name.trim().toLocaleLowerCase('de-DE')),
    );
    const recentNames = Array.from(lastPerformance.keys());

    return exerciseLibrary
      .filter((exercise) => {
        const key = exercise.name.toLocaleLowerCase('de-DE');
        return (!category || category === 'Alle' || exercise.category === category) &&
          key.includes(query) &&
          !addedNames.has(key);
      })
      .sort((a, b) => {
        const aRank = recentNames.indexOf(a.name.toLocaleLowerCase('de-DE'));
        const bRank = recentNames.indexOf(b.name.toLocaleLowerCase('de-DE'));
        return (aRank === -1 ? Number.MAX_SAFE_INTEGER : aRank) -
          (bRank === -1 ? Number.MAX_SAFE_INTEGER : bRank);
      });
  }, [search, category, exercises, lastPerformance]);

  const addExercise = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    const key = cleanName.toLocaleLowerCase('de-DE');
    if (exercises.some((exercise) =>
      exercise.name.trim().toLocaleLowerCase('de-DE') === key,
    )) return;

    const previous = lastPerformance.get(key);
    setExercises((current) => {
      if (current.some((exercise) =>
        exercise.name.trim().toLocaleLowerCase('de-DE') === key,
      )) return current;

      return [
        ...current,
        previous
          ? { name: cleanName, sets: previous.sets, reps: previous.reps, weightKg: previous.weightKg }
          : newExercise(cleanName),
      ];
    });
    setSearch('');
    setCustomName('');
  };

  const updateExercise = (index: number, patch: Partial<ExerciseDraft>) => {
    setExercises((current) =>
      current.map((exercise, itemIndex) =>
        itemIndex === index ? { ...exercise, ...patch } : exercise,
      ),
    );
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (exercises.length === 0 || exercises.some((exercise) => !exercise.name.trim())) return;

    const occurredAt = new Date(`${date}T12:00:00`).toISOString();
    onCreate({
      title: title.trim(),
      occurredAt,
      exercises: exercises.map((exercise) => ({
        name: exercise.name.trim(),
        sets: Array.from({ length: exercise.sets }, () => ({
          reps: exercise.reps,
          weightKg: exercise.weightKg,
        })),
      })),
    });
  };

  return (
    <>
      <PageHeading
        eyebrow="TRAININGSPROTOKOLL"
        title="Training"
        description="Stelle deine Trainingseinheit zusammen und behalte deine Leistungen im Blick."
      />

      <div className="training-layout">
        <section className="surface training-form-panel">
          <SectionTitle title="Einheit eintragen" />

          <form className="stack-form" onSubmit={submit}>
            <div className="form-row">
              <Field label="Name der Einheit">
                <input className="text-input" value={title} maxLength={80}
                  onChange={(event) => setTitle(event.target.value)} required />
              </Field>
              <Field label="Datum">
                <input className="text-input" type="date" value={date} max={todayDateValue()}
                  onChange={(event) => setDate(event.target.value)} required />
              </Field>
            </div>

            

            <div className="exercise-library">
              <div className="form-section-heading">
                <h3>Übung auswählen</h3>
              </div>
              <div className="search-field">
            
                  <input className="text-input" value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="z. B. Brustpresse oder Latzug" />
              </div>

              <div className="muscle-group-picker">
                <div className="muscle-group-heading">
                  <span className="field-label">Muskelgruppe auswählen</span>
                  
                </div>
                <div className="muscle-group-grid">
                  {categories.filter((item) => item !== 'Alle' && item !== 'Eigene Übungen').map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`muscle-group-card${category === item ? ' is-selected' : ''}`}
                      aria-pressed={category === item}
                      onClick={() => setCategory(category === item ? '' : item)}
                    >
                      <span className="muscle-group-card-name">{item}</span>
                      <span className="muscle-group-card-count">
                        {exerciseLibrary.filter((exercise) => exercise.category === item).length} Übungen
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {(category || search.trim()) ? (
              <div className="exercise-results">
                <div className="exercise-results-heading">
                  <h4>{category || 'Suchergebnisse'}</h4>
                  <span>{filteredExercises.length} Übungen</span>
                </div>
                <div className="exercise-library-options">
                {filteredExercises.length > 0 ? filteredExercises.map((exercise) => {
                  const previous = lastPerformance.get(exercise.name.toLocaleLowerCase('de-DE'));
                  return (
                    <button key={exercise.name} type="button"
                      className={`button button-secondary exercise-option${exercises.some((item) => item.name.trim().toLocaleLowerCase('de-DE') === exercise.name.toLocaleLowerCase('de-DE')) ? ' is-added' : ''}`}
                      aria-pressed={exercises.some((item) => item.name.trim().toLocaleLowerCase('de-DE') === exercise.name.toLocaleLowerCase('de-DE'))}
                      onClick={() => addExercise(exercise.name)}>
                      <span>
                        <strong>{exercise.name}</strong>
                        <small>{previous
                          ? `Zuletzt: ${previous.sets} Sätze · ${previous.reps} Wdh. · ${previous.weightKg} kg`
                          : exercise.category}</small>
                      </span>
                      <Plus size={17} aria-hidden="true" />
                    </button>
                  );
                }) : <p className="muted-copy">Keine passende Übung gefunden.</p>}
                </div>
              </div>
              ) : null}

              <div className="custom-exercise-row">
                <Field label="Eigene Übung hinzufügen">
                  <input className="text-input" value={customName} maxLength={80}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="Name deiner Übung" />
                </Field>
                <button type="button" className="button button-secondary"
                  disabled={!customName.trim()}
                  onClick={() => addExercise(customName)}>
                  <Plus size={16} aria-hidden="true" /> Hinzufügen
                </button>
              </div>
            </div>

            {exercises.length === 0 ? (
              <div className="exercise-empty">
                <Dumbbell size={25} aria-hidden="true" />
                <strong>Noch keine Übungen ausgewählt</strong>
                <p>Wähle oben Übungen aus. Deine letzten Trainingswerte werden automatisch übernommen, sofern vorhanden.</p>
              </div>
            ) : (
              <div className="exercise-drafts">
                {exercises.map((exercise, index) => (
                  <fieldset className="exercise-draft" key={`${exercise.name}-${index}`}>
                    <legend className="sr-only">Übung {index + 1}</legend>
                    <div className="exercise-draft-header">
                      <span>{index + 1}. {exercise.name}</span>
                      <button type="button" className="icon-button danger-hover"
                        aria-label={`${exercise.name} entfernen`}
                        onClick={() => setExercises((current) => current.filter((_, i) => i !== index))}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="form-row form-row-3">
                      <Field label="Sätze">
                        <input className="text-input" type="number" min={1} max={20}
                          value={exercise.sets}
                          onChange={(event) => updateExercise(index, { sets: Number(event.target.value) })}
                          required />
                      </Field>
                      <Field label="Wdh. je Satz">
                        <input className="text-input" type="number" min={1} max={100}
                          value={exercise.reps}
                          onChange={(event) => updateExercise(index, { reps: Number(event.target.value) })}
                          required />
                      </Field>
                      <Field label="Gewicht (kg)">
                        <input className="text-input" type="number" min={0} max={500} step="0.5"
                          value={exercise.weightKg}
                          onChange={(event) => updateExercise(index, { weightKg: Number(event.target.value) })}
                          required />
                      </Field>
                    </div>
                    {lastPerformance.has(exercise.name.toLocaleLowerCase('de-DE')) && (
                      <p className="field-hint">Letzte Werte dieser Übung wurden als Startwerte übernommen. Du kannst sie jederzeit ändern.</p>
                    )}
                  </fieldset>
                ))}
              </div>
            )}

            {error && <InlineNotice tone="error">{error}</InlineNotice>}
            <button className="button button-primary full-width" type="submit"
              disabled={!online || busy || exercises.length === 0 || exercises.some((exercise) => !exercise.name.trim())}>
              <Save size={17} aria-hidden="true" /> Training speichern
            </button>
            {!online && <p className="field-hint">Stelle die Verbindung zum Gym-Server wieder her, um Einheiten zu speichern.</p>}
          </form>
        </section>

        <section className="surface training-history-panel">
          <SectionTitle title="Letzte Einheiten" />
          {workouts.length ? (
            <ul className="workout-list">
              {[...workouts]
                .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
                .map((workout) => (
                  <li key={workout.id} className="workout-item">
                    <div className="workout-item-heading">
                      <div><strong>{workout.title}</strong><span>{formatDate(workout.occurredAt)}</span></div>
                      <button type="button" className="icon-button danger-hover"
                        aria-label={`${workout.title} löschen`} disabled={busy}
                        onClick={() => {
                          if (window.confirm('Diese Trainingseinheit wirklich löschen?')) onDelete(workout.id);
                        }}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <ul className="exercise-summary">
                      {workout.exercises.map((exercise, index) => (
                        <li key={`${exercise.name}-${index}`}>
                          <span>{exercise.name}</span>
                          <span>{exercise.sets.length} × {exercise.sets[0]?.reps} · {exercise.sets[0]?.weightKg} kg</span>
                        </li>
                      ))}
                    </ul>
                    <p className="workout-volume">
                      Volumen: {Math.round(calculateWorkoutVolume([workout])).toLocaleString('de-DE')} kg
                    </p>
                  </li>
                ))}
            </ul>
          ) : (
            <EmptyState title="Noch keine Einheiten"
              description="Dein Trainingsprotokoll erscheint hier, sobald du deine erste Einheit speicherst." />
          )}
        </section>
      </div>
    </>
  );
}