import { useEffect, useState } from 'react';
import { Target, TrendingUp } from 'lucide-react';
import type { WorkoutLog } from '../../services/gymRepository';
import { calculateWorkoutVolume, getThisWeekWorkouts, getWeeklyWorkoutCounts, startOfLocalWeek } from './format';
import { Field, InlineNotice, PageHeading, SectionTitle } from './components';

export function Progress({ workouts, weeklyGoal, busy, error, online, onUpdateGoal }: {
  workouts: WorkoutLog[];
  weeklyGoal: number;
  busy: boolean;
  error: string | null;
  online: boolean;
  onUpdateGoal: (value: number) => void;
}) {
  const [goalInput, setGoalInput] = useState(weeklyGoal);
  useEffect(() => setGoalInput(weeklyGoal), [weeklyGoal]);
  const weekWorkouts = getThisWeekWorkouts(workouts);
  const volume = calculateWorkoutVolume(weekWorkouts);
  const counts = getWeeklyWorkoutCounts(workouts);
  const maxCount = Math.max(1, ...counts);
  const exerciseProgress = (() => {
    const byExercise = new Map<string, Array<{ date: number; weight: number; workoutTitle: string }>>();

    for (const workout of workouts) {
      const date = new Date(workout.occurredAt).getTime();
      if (!Number.isFinite(date)) continue;

      for (const exercise of workout.exercises) {
        const name = exercise.name.trim();
        const weights = exercise.sets
          .map((set) => set.weightKg)
          .filter((weight) => Number.isFinite(weight) && weight >= 0);

        if (!name || weights.length === 0) continue;

        const key = name.toLocaleLowerCase('de-DE');
        const entries = byExercise.get(key) ?? [];
        entries.push({
          date,
          weight: Math.max(...weights),
          workoutTitle: workout.title,
        });
        byExercise.set(key, entries);
      }
    }

    return Array.from(byExercise.entries())
      .map(([key, entries]) => {
        const sorted = [...entries].sort((a, b) => a.date - b.date);
        const latest = sorted[sorted.length - 1];
        const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
        return { key, name: workouts.flatMap((w) => w.exercises).find(
          (exercise) => exercise.name.trim().toLocaleLowerCase('de-DE') === key,
        )?.name.trim() ?? key, latest, previous, sessions: sorted.length };
      })
      .sort((a, b) => b.latest.date - a.latest.date);
  })();

  const weekStart = startOfLocalWeek(new Date());
  const labels = counts.map((_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() - (6 - index) * 7);
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(date);
  });

  return (
    <>
      <PageHeading eyebrow="DEINE ENTWICKLUNG" title="Fortschritt" description="Ein Überblick aus deinen gespeicherten Trainingseinheiten." />
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <section className="progress-stat-grid" aria-label="Trainingskennzahlen">
        <article className="surface stat-panel"><span className="stat-icon"><TrendingUp size={18} aria-hidden="true" /></span><p>Einheiten diese Woche</p><strong>{weekWorkouts.length}</strong><span className="stat-caption">von {weeklyGoal} als Wochenziel</span></article>
        <article className="surface stat-panel"><span className="stat-icon"><Target size={18} aria-hidden="true" /></span><p>Trainingsvolumen</p><strong>{Math.round(volume).toLocaleString('de-DE')} <small>kg</small></strong><span className="stat-caption">Gewicht × Wiederholungen</span></article>
        <article className="surface stat-panel"><span className="stat-icon"><TrendingUp size={18} aria-hidden="true" /></span><p>Einheiten insgesamt</p><strong>{workouts.length}</strong><span className="stat-caption">in deinem Trainingsprotokoll</span></article>
      </section>

      <section className="surface chart-panel">
        <SectionTitle title="Kraftentwicklung" />
        <p className="muted-copy section-intro">Vergleich des höchsten gespeicherten Gewichts je Übung zwischen deinen letzten Trainingseinheiten.</p>
        {exerciseProgress.length === 0 ? (
          <p className="muted-copy">Sobald du Übungen mit Gewichten protokollierst, erscheint deine Entwicklung hier.</p>
        ) : (
          <div className="exercise-progress-list">
            {exerciseProgress.map((exercise) => {
              const difference = exercise.previous
                ? exercise.latest.weight - exercise.previous.weight
                : null;
              const percent = exercise.previous && exercise.previous.weight > 0
                ? difference! / exercise.previous.weight * 100
                : null;

              return (
                <article className="exercise-progress-item" key={exercise.key}>
                  <div>
                    <strong>{exercise.name}</strong>
                    <p className="muted-copy">
                      {exercise.previous
                        ? `Vorher: ${exercise.previous.weight.toLocaleString('de-DE')} kg`
                        : 'Noch kein Vergleich möglich'}
                    </p>
                  </div>
                  <div className="exercise-progress-value">
                    <strong>{exercise.latest.weight.toLocaleString('de-DE')} kg</strong>
                    {difference !== null && (
                      <span className={difference > 0 ? 'progress-positive' : difference < 0 ? 'progress-negative' : 'muted-copy'}>
                        {difference > 0 ? '+' : ''}{difference.toLocaleString('de-DE')} kg
                        {percent !== null ? ` (${percent > 0 ? '+' : ''}${percent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %)` : ''}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="surface chart-panel">
        <SectionTitle title="Training pro Woche" />
        <p className="muted-copy section-intro">Deine letzten sieben Kalenderwochen</p>
        <div className="bar-chart" role="img" aria-label={`Trainingseinheiten der letzten sieben Wochen: ${counts.join(', ')}`}>
          {counts.map((count, index) => <div className="chart-column" key={labels[index]}><span className="chart-value">{count}</span><div className="chart-bar-track"><span className={`chart-bar ${index === counts.length - 1 ? 'current-week' : ''}`} style={{ height: `${Math.max(count ? 12 : 4, count / maxCount * 100)}%` }} /></div><span className="chart-label">{labels[index]}</span></div>)}
        </div>
      </section>

      <section className="surface goal-panel">
        <div><SectionTitle title="Wochenziel" /><p className="muted-copy">Ein persönliches Ziel, nur für dein Profil.</p><div className="goal-progress-track" aria-label={`${weekWorkouts.length} von ${weeklyGoal} Einheiten`}><span style={{ width: `${Math.min(100, weekWorkouts.length / weeklyGoal * 100)}%` }} /></div><p className="goal-progress-copy">{weekWorkouts.length} von {weeklyGoal} Einheiten diese Woche</p></div>
        <form className="goal-form" onSubmit={(event) => { event.preventDefault(); onUpdateGoal(goalInput); }}><Field label="Einheiten pro Woche"><select className="text-input" value={goalInput} onChange={(event) => setGoalInput(Number(event.target.value))}>{Array.from({ length: 7 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? 'Einheit' : 'Einheiten'}</option>)}</select></Field><button type="submit" className="button button-secondary" disabled={!online || busy}>Ziel speichern</button></form>
      </section>
    </>
  );
}
